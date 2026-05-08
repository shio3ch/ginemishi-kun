# Discord Bot × Cloudflare Workers × ConoHa VPS 制御システム 仕様書

## 概要

Discord Bot を通じて ConoHa for Games の VPS インスタンスを遠隔操作するシステム。
週1〜2回・数時間の利用を想定し、使用時のみ VPS を起動することでコストを最小化する。

## アーキテクチャ

```
Discord クライアント
  │ Slash Command (/start, /stop, /status)
  ▼
Discord API
  │ POST /interactions（Webhook）
  ▼
Cloudflare Workers（Interaction Handler / Hono）
  │ type:5 deferred response（3秒以内に返却）
  │ vps-jobs Queue にジョブをエンキュー
  ▼
Cloudflare Queues（vps-jobs）
  │ メッセージをバッファリング
  ▼
Cloudflare Workers（Consumer Worker）
  │ ステートマシンで非同期処理
  │ 未完了の場合は delaySeconds=30 で自己再エンキュー
  ▼
ConoHa VPS API（OpenStack REST API）
  │ インスタンス操作
  ▼
VPS（ゲームサーバー）
```

Cron Trigger が2時間ごとに VPS ステータスを確認し、起動から12時間経過で Discord に警告通知を送る。

## 実装言語・フレームワーク

| 項目 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript | Workers の正式サポート言語。型安全・ドキュメント最充実 |
| Web フレームワーク | Hono | Workers ネイティブ設計。軽量で型推論が強力 |
| テスト | Vitest | `@cloudflare/vitest-pool-workers` で binding を含む Workers 環境をローカル再現可能 |
| パッケージ管理 | npm | 標準的かつ wrangler との相性が最良 |

## コンポーネント詳細

### 1. Interaction Handler Worker

Discord の Slash Command Webhook を受け取るエントリーポイント。Hono でルーティングする。

**責務**
- Discord からの署名検証（`X-Signature-Ed25519` / `X-Signature-Timestamp`）
- 3秒以内に `type:5`（deferred channel message）を返却
- コマンドに応じたジョブを `vps-jobs` Queue にエンキュー
- PING リクエスト（`type:1`）への即時 PONG 返却

**対応コマンド**

| コマンド | 処理 | エンキューするジョブ |
|---|---|---|
| `/start` | VPS 起動 | `{ action: "start", state: "starting" }` |
| `/stop` | VPS 停止・保存・削除 | `{ action: "stop", state: "stopping" }` |
| `/status` | VPS 状態確認 | `{ action: "status" }` |

**実装イメージ**

```typescript
import { Hono } from 'hono'
import { verifyDiscordSignature } from './discord/verify'

const app = new Hono<{ Bindings: Env }>()

app.post('/interactions', async (c) => {
  const verified = await verifyDiscordSignature(c)
  if (!verified) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()

  // PING
  if (body.type === 1) return c.json({ type: 1 })

  // Slash Command → deferred 応答 + Queue エンキュー
  await c.env.VPS_QUEUE.send({
    action: body.data.name,
    state: body.data.name === 'stop' ? 'stopping' : 'starting',
    interactionToken: body.token,
    channelId: body.channel_id,
    enqueuedAt: new Date().toISOString(),
  } satisfies VpsJob)

  return c.json({ type: 5 }) // deferred
})

export default app
```

### 2. Consumer Worker（Queue Consumer）

`vps-jobs` Queue からメッセージを受け取り、ステートマシンとして動作する。

**責務**
- ConoHa API を呼び出してインスタンスを操作
- API のポーリングを `delaySeconds` による再エンキューで代替
- 処理完了・エラー時に Discord へ Followup 通知
- タイムアウト検知と異常通知

**ステートマシン（stop フロー）**

```
stopping
  │ ConoHa API: POST /servers/{id}/action { "os-stop": null }
  │ GET /servers/{id} でステータス確認
  ├─ SHUTOFF でない → { state: "stopping" } を delaySeconds=30 で再エンキュー
  └─ SHUTOFF        → { state: "imaging" } を即時エンキュー

imaging
  │ ConoHa API: POST /images（イメージ作成）
  │ GET /images/{id} でステータス確認
  ├─ active でない  → { state: "imaging" } を delaySeconds=30 で再エンキュー
  └─ active         → { state: "deleting" } を即時エンキュー

deleting
  │ ConoHa API: DELETE /servers/{id}
  └─ 完了           → Discord に完了通知
```

**ステートマシン（start フロー）**

```
starting
  │ ConoHa API: POST /servers（インスタンス作成 / イメージから復元）
  │ GET /servers/{id} でステータス確認
  ├─ ACTIVE でない  → { state: "starting" } を delaySeconds=30 で再エンキュー
  └─ ACTIVE         → Discord に起動完了・接続情報を通知
```

**タイムアウト処理**

各ジョブには `enqueuedAt`（ISO 8601）を含め、経過時間が10分を超えた場合は異常とみなす。

```typescript
const elapsed = Date.now() - new Date(job.enqueuedAt).getTime()
if (elapsed > 10 * 60 * 1000) {
  await notifyDiscord(env, job, '⚠️ タイムアウト：手動確認してください')
  msg.ack()
  return
}
```

**メッセージスキーマ**

```typescript
type VpsAction = 'start' | 'stop' | 'status'
type VpsState  = 'starting' | 'stopping' | 'imaging' | 'deleting' | 'done'

type VpsJob = {
  action: VpsAction
  state: VpsState
  serverId?: string         // 起動済みの場合のみ
  imageId?: string          // imaging ステート以降
  interactionToken: string  // Discord Followup 用（有効期限15分）
  channelId: string         // トークン失効後の通知先フォールバック
  enqueuedAt: string        // ISO 8601、タイムアウト検知用
}
```

> **注意**: `interactionToken` の有効期限は15分。長時間処理（10分超）になる場合は `channelId` への直接 Webhook にフォールバックする。

**Consumer エクスポートイメージ**

```typescript
// src/consumer.ts
export default {
  async queue(batch: MessageBatch<VpsJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const job = msg.body
      const elapsed = Date.now() - new Date(job.enqueuedAt).getTime()
      if (elapsed > 10 * 60 * 1000) {
        await notifyDiscord(env, job, '⚠️ タイムアウト：手動確認してください')
        msg.ack()
        continue
      }
      await processState(env, job)
      msg.ack()
    }
  }
}
```

### 3. Cron Trigger Worker

定期的に VPS ステータスを確認し、起動しっぱなしを防ぐ。

**スケジュール**: 2時間ごと（`0 */2 * * *`）

**処理フロー**
1. ConoHa API で VPS のステータスと `created_at` を取得
2. ステータスが ACTIVE かつ起動から12時間以上経過している場合、Discord に警告を送信
3. 警告メッセージには「30分後に自動停止します」と `/stop` コマンドの案内を含める

**自動停止について**
- 自動停止は実装しない（誤操作防止のため、ユーザーの明示的な `/stop` を必須とする）
- Cron はあくまで通知のみ

### 4. ConoHa API クライアント

OpenStack Keystone 認証によるトークン管理と API 呼び出しをラップするモジュール。

**認証フロー**
1. `POST /tokens` でトークン取得
2. レスポンスの `access.token.id` を以降のリクエストに `X-Auth-Token` ヘッダとして付与
3. トークンの有効期限（通常24時間）を考慮し、必要に応じて再取得

**主な API エンドポイント**

| 操作 | メソッド | パス |
|---|---|---|
| トークン取得 | POST | `/tokens` |
| サーバー一覧 | GET | `/servers` |
| サーバー詳細 | GET | `/servers/{id}` |
| サーバー作成 | POST | `/servers` |
| サーバー操作（停止） | POST | `/servers/{id}/action` |
| サーバー削除 | DELETE | `/servers/{id}` |
| イメージ作成 | POST | `/images` |
| イメージ詳細 | GET | `/images/{id}` |

参考: https://doc.conoha.jp/reference/api-vps3/

## 環境変数

Cloudflare Workers の Secret / 環境変数として管理する。`wrangler.toml` の `[vars]` に非機密情報を、機密情報は `wrangler secret put` で登録する。

| 変数名 | 種別 | 説明 |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | Secret | Discord アプリの公開鍵（署名検証用） |
| `DISCORD_APPLICATION_ID` | var | Discord アプリケーション ID |
| `DISCORD_BOT_TOKEN` | Secret | Discord Bot トークン（Followup 通知用） |
| `CONOHA_USERNAME` | Secret | ConoHa アカウントのユーザー名 |
| `CONOHA_PASSWORD` | Secret | ConoHa アカウントのパスワード |
| `CONOHA_TENANT_ID` | var | ConoHa テナント ID |
| `CONOHA_IDENTITY_ENDPOINT` | var | ConoHa Identity API エンドポイント |
| `CONOHA_COMPUTE_ENDPOINT` | var | ConoHa Compute API エンドポイント |
| `CONOHA_IMAGE_ENDPOINT` | var | ConoHa Image API エンドポイント |
| `GAME_SERVER_IMAGE_ID` | var | 起動に使うベースイメージ ID |
| `GAME_SERVER_FLAVOR_ID` | var | VPS のフレーバー（スペック）ID |
| `DISCORD_NOTIFY_CHANNEL_ID` | var | 通知先 Discord チャンネル ID |

`Env` 型は `worker-configuration.d.ts`（`wrangler types` コマンドで自動生成）を参照すること。

## ディレクトリ構成

```
/
├── src/
│   ├── index.ts              # Interaction Handler（Hono エントリーポイント）
│   ├── consumer.ts           # Queue Consumer Worker
│   ├── cron.ts               # Cron Trigger Worker
│   ├── conoha/
│   │   ├── auth.ts           # Keystone トークン管理
│   │   ├── server.ts         # サーバー操作 API
│   │   └── image.ts          # イメージ操作 API
│   ├── discord/
│   │   ├── verify.ts         # 署名検証
│   │   └── notify.ts         # Followup / Webhook 通知
│   ├── queue/
│   │   └── types.ts          # VpsJob 型定義
│   └── statemachine/
│       ├── stop.ts           # stop フロー処理
│       └── start.ts          # start フロー処理
├── test/
│   ├── index.test.ts         # Interaction Handler のテスト
│   ├── consumer.test.ts      # Consumer Worker のテスト
│   ├── statemachine.test.ts  # ステートマシンのテスト
│   ├── conoha.test.ts        # ConoHa API クライアントのテスト
│   └── discord.test.ts       # Discord 署名検証・通知のテスト
├── .github/
│   └── workflows/
│       ├── ci.yml            # テスト（PR / push）
│       └── deploy.yml        # デプロイ（main push）
├── worker-configuration.d.ts # wrangler types で自動生成
├── wrangler.toml
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

## wrangler.toml 設定イメージ

```toml
name = "vps-bot"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
DISCORD_APPLICATION_ID     = "xxx"
CONOHA_TENANT_ID           = "xxx"
CONOHA_IDENTITY_ENDPOINT   = "https://identity.tyo1.conoha.io/v2.0"
CONOHA_COMPUTE_ENDPOINT    = "https://compute.tyo1.conoha.io/v2/xxx"
CONOHA_IMAGE_ENDPOINT      = "https://image-service.tyo1.conoha.io"
GAME_SERVER_IMAGE_ID       = "xxx"
GAME_SERVER_FLAVOR_ID      = "xxx"
DISCORD_NOTIFY_CHANNEL_ID  = "xxx"

[[queues.producers]]
queue   = "vps-jobs"
binding = "VPS_QUEUE"

[[queues.consumers]]
queue          = "vps-jobs"
max_batch_size = 1
max_retries    = 0   # リトライは自前の再エンキューで管理

[triggers]
crons = ["0 */2 * * *"]
```

## package.json 主要依存関係

```json
{
  "scripts": {
    "dev":    "wrangler dev",
    "deploy": "wrangler deploy",
    "test":   "vitest run",
    "types":  "wrangler types"
  },
  "dependencies": {
    "hono": "^4"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0",
    "@cloudflare/workers-types": "^4",
    "typescript": "^5",
    "vitest": "^2",
    "wrangler": "^3"
  }
}
```

## CI/CD パイプライン

### 全体フロー

```
PR 作成 / feature ブランチ push
  └─ ci.yml 発火
      ├─ vitest 実行
      └─ 失敗 → マージ不可（Branch Protection Rules）

main ブランチへの merge（= push）
  └─ deploy.yml 発火
      ├─ vitest 実行（念のため再実行）
      └─ 成功 → wrangler deploy → Cloudflare Workers に自動デプロイ
```

### ci.yml（テスト用ワークフロー）

```yaml
name: CI

on:
  push:
    branches-ignore:
      - main
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run Vitest
        run: npm test
```

### deploy.yml（デプロイ用ワークフロー）

```yaml
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run Vitest
        run: npm test

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### GitHub Branch Protection Rules の設定

`main` ブランチに以下のルールを設定することで、**テストが通らない限りマージ不可**を強制する。

```
Settings → Branches → Branch protection rules → Add rule

対象ブランチ: main

✅ Require a pull request before merging
✅ Require status checks to pass before merging
    Required checks: test（ci.yml の job 名）
✅ Require branches to be up to date before merging
✅ Do not allow bypassing the above settings
```

### GitHub Secrets の設定

```
Settings → Secrets and variables → Actions → New repository secret

CLOUDFLARE_API_TOKEN  : Cloudflare の API トークン（Edit Cloudflare Workers 権限）
CLOUDFLARE_ACCOUNT_ID : Cloudflare のアカウント ID
```

Cloudflare 側の Worker に設定する Secret（ConoHa クレデンシャル等）は別途以下で登録する。

```bash
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put CONOHA_USERNAME
wrangler secret put CONOHA_PASSWORD
```

### テスト方針

`@cloudflare/vitest-pool-workers` を使うことで、Queue binding・環境変数など Cloudflare Workers のランタイム環境をローカルで再現してテストできる。

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
})
```

```typescript
// test/index.test.ts
import { describe, it, expect } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import app from '../src/index'

describe('POST /interactions', () => {
  it('PING に対して PONG を返す', async () => {
    const req = new Request('http://localhost/interactions', {
      method: 'POST',
      body: JSON.stringify({ type: 1 }),
    })
    const ctx = createExecutionContext()
    const res = await app.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect((await res.json() as any).type).toBe(1)
  })
})
```

ステートマシン・ConoHa クライアント・Discord 署名検証などのビジネスロジック層は通常の Vitest でユニットテストし、ConoHa API への HTTP 通信は `vi.mock` でモックする。

## 今後の拡張（将来実装）

### LLM による自然言語操作

Discord での会話で VPS を操作できるようにする。

**構想**
- Discord のメッセージを OpenAI API / Claude API に渡す
- LLM が意図を解釈し、`/start` `/stop` に相当するアクションを決定
- MCP（Model Context Protocol）サーバーとして VPS 操作ツールを定義し、LLM から呼び出す

**MCP ツール定義イメージ**

```typescript
const tools = [
  { name: 'start_server', description: 'ゲームサーバーを起動する' },
  { name: 'stop_server',  description: 'ゲームサーバーを停止・保存・削除する' },
  { name: 'get_status',   description: 'サーバーの現在の状態を取得する' },
]
```
