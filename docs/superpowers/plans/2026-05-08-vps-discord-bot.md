# VPS Discord Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discord Slash Command で ConoHa VPS を遠隔操作する Cloudflare Workers システムを構築する。

**Architecture:** Hono ベースの Interaction Handler Worker が Discord Webhook を受信し、vps-jobs Queue にジョブをエンキュー。Consumer Worker がステートマシンで非同期に ConoHa API を呼び出す。Cron Trigger が2時間ごとに長時間起動を検知し Discord に警告する。

**Tech Stack:** TypeScript, Hono v4, Cloudflare Workers, Cloudflare Queues, @cloudflare/vitest-pool-workers, Vitest v2, Wrangler v3

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `src/queue/types.ts` | VpsJob / VpsAction / VpsState 型定義 |
| `src/discord/verify.ts` | Discord Ed25519 署名検証 |
| `src/discord/notify.ts` | Discord Followup / Channel Webhook 通知 |
| `src/conoha/auth.ts` | ConoHa Keystone トークン取得 |
| `src/conoha/server.ts` | ConoHa サーバー操作 API |
| `src/conoha/image.ts` | ConoHa イメージ操作 API |
| `src/statemachine/stop.ts` | stop フロー（stopping→imaging→deleting）|
| `src/statemachine/start.ts` | start フロー（starting→ACTIVE）|
| `src/index.ts` | エントリーポイント: fetch(Hono) + queue + scheduled を統合 |
| `src/consumer.ts` | Queue Consumer ロジック（processQueue 関数）|
| `src/cron.ts` | Cron Trigger ロジック（handleScheduled 関数）|
| `test/discord.test.ts` | Discord verify / notify ユニットテスト |
| `test/conoha.test.ts` | ConoHa auth / server / image ユニットテスト |
| `test/statemachine.test.ts` | stop / start ステートマシンテスト |
| `test/index.test.ts` | Interaction Handler 統合テスト |
| `test/consumer.test.ts` | Consumer Worker 統合テスト |
| `wrangler.toml` | Workers 設定（Queue, Cron, vars）|
| `vitest.config.ts` | @cloudflare/vitest-pool-workers 設定 |
| `tsconfig.json` | TypeScript 設定 |
| `package.json` | 依存関係・スクリプト |
| `.github/workflows/ci.yml` | テスト CI |
| `.github/workflows/deploy.yml` | デプロイ CD |

---

## Task 1: プロジェクトスキャフォールド

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`

- [ ] **Step 1: package.json を作成する**

```json
{
  "name": "ginemishi-kun",
  "version": "1.0.0",
  "private": true,
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

- [ ] **Step 2: tsconfig.json を作成する**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*", "test/**/*", "worker-configuration.d.ts"]
}
```

- [ ] **Step 3: wrangler.toml を作成する**

```toml
name = "vps-bot"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
DISCORD_APPLICATION_ID    = "REPLACE_ME"
CONOHA_TENANT_ID          = "REPLACE_ME"
CONOHA_IDENTITY_ENDPOINT  = "https://identity.tyo1.conoha.io/v2.0"
CONOHA_COMPUTE_ENDPOINT   = "https://compute.tyo1.conoha.io/v2/REPLACE_ME"
CONOHA_IMAGE_ENDPOINT     = "https://image-service.tyo1.conoha.io"
GAME_SERVER_IMAGE_ID      = "REPLACE_ME"
GAME_SERVER_FLAVOR_ID     = "REPLACE_ME"
DISCORD_NOTIFY_CHANNEL_ID = "REPLACE_ME"

[[queues.producers]]
queue   = "vps-jobs"
binding = "VPS_QUEUE"

[[queues.consumers]]
queue          = "vps-jobs"
max_batch_size = 1
max_retries    = 0

[triggers]
crons = ["0 */2 * * *"]
```

- [ ] **Step 4: vitest.config.ts を作成する**

```typescript
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

- [ ] **Step 5: npm install を実行する**

```bash
npm install
```

期待: node_modules が作成される

- [ ] **Step 6: worker-configuration.d.ts を生成する**

`wrangler types` は認証を要求することがあるため、まず手動で `worker-configuration.d.ts` を作成する（後で `npm run types` で上書きできる）。

```typescript
// worker-configuration.d.ts
interface Env {
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_BOT_TOKEN: string
  CONOHA_USERNAME: string
  CONOHA_PASSWORD: string
  CONOHA_TENANT_ID: string
  CONOHA_IDENTITY_ENDPOINT: string
  CONOHA_COMPUTE_ENDPOINT: string
  CONOHA_IMAGE_ENDPOINT: string
  GAME_SERVER_IMAGE_ID: string
  GAME_SERVER_FLAVOR_ID: string
  DISCORD_NOTIFY_CHANNEL_ID: string
  VPS_QUEUE: Queue<import('./src/queue/types').VpsJob>
}
```

- [ ] **Step 7: コミットする**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts worker-configuration.d.ts
git commit -m "chore: scaffold project (package.json, tsconfig, wrangler, vitest)"
```

---

## Task 2: 型定義

**Files:**
- Create: `src/queue/types.ts`

- [ ] **Step 1: src/queue/types.ts を作成する**

```typescript
export type VpsAction = 'start' | 'stop' | 'status'
export type VpsState  = 'starting' | 'stopping' | 'imaging' | 'deleting' | 'done'

export type VpsJob = {
  action: VpsAction
  state: VpsState
  serverId?: string
  imageId?: string
  interactionToken: string
  channelId: string
  enqueuedAt: string
}
```

- [ ] **Step 2: コミットする**

```bash
git add src/queue/types.ts
git commit -m "feat: add VpsJob type definitions"
```

---

## Task 3: Discord 署名検証

**Files:**
- Create: `src/discord/verify.ts`
- Create: `test/discord.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// test/discord.test.ts
import { describe, it, expect } from 'vitest'
import { verifyEd25519 } from '../src/discord/verify'

describe('verifyEd25519', () => {
  it('有効な署名を受け入れる', async () => {
    // テスト用の Ed25519 鍵ペアを生成
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )
    const pubKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    const pubKeyHex = [...new Uint8Array(pubKeyBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const timestamp = '1234567890'
    const body = '{"type":1}'
    const message = new TextEncoder().encode(timestamp + body)
    const sigBuffer = await crypto.subtle.sign('Ed25519', keyPair.privateKey, message)
    const sigHex = [...new Uint8Array(sigBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const result = await verifyEd25519(sigHex, timestamp, body, pubKeyHex)
    expect(result).toBe(true)
  })

  it('無効な署名を拒否する', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )
    const pubKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    const pubKeyHex = [...new Uint8Array(pubKeyBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const result = await verifyEd25519(
      'a'.repeat(128),   // 無効な署名（64バイト hex）
      '1234567890',
      '{"type":1}',
      pubKeyHex
    )
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/discord.test.ts
```

期待: FAIL — `verifyEd25519` が存在しない

- [ ] **Step 3: src/discord/verify.ts を実装する**

```typescript
import type { Context } from 'hono'

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function verifyEd25519(
  signature: string,
  timestamp: string,
  body: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const pubKey = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKeyHex),
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    const message = new TextEncoder().encode(timestamp + body)
    return await crypto.subtle.verify('Ed25519', pubKey, hexToBytes(signature), message)
  } catch {
    return false
  }
}

export async function verifyDiscordSignature(
  c: Context<{ Bindings: Env }>
): Promise<boolean> {
  const signature = c.req.header('X-Signature-Ed25519') ?? ''
  const timestamp  = c.req.header('X-Signature-Timestamp') ?? ''
  const body = await c.req.text()
  return verifyEd25519(signature, timestamp, body, c.env.DISCORD_PUBLIC_KEY)
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/discord.test.ts
```

期待: PASS (verifyEd25519 の2テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/discord/verify.ts test/discord.test.ts
git commit -m "feat: add Discord Ed25519 signature verification"
```

---

## Task 4: Discord 通知モジュール

**Files:**
- Create: `src/discord/notify.ts`
- Modify: `test/discord.test.ts` (テスト追加)

- [ ] **Step 1: 失敗するテストを追加する**

`test/discord.test.ts` の末尾に追加:

```typescript
import { vi } from 'vitest'
import { notifyFollowup, notifyChannel } from '../src/discord/notify'
import type { VpsJob } from '../src/queue/types'

const mockJob: VpsJob = {
  action: 'start',
  state: 'starting',
  interactionToken: 'test-token',
  channelId: 'test-channel',
  enqueuedAt: new Date().toISOString(),
}

const mockEnv = {
  DISCORD_APPLICATION_ID: 'app-123',
  DISCORD_BOT_TOKEN: 'bot-token',
} as unknown as Env

describe('notifyFollowup', () => {
  it('Discord Followup API を呼び出す', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    )
    await notifyFollowup(mockEnv, mockJob, '✅ 起動しました')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/webhooks/app-123/test-token/messages/@original'),
      expect.objectContaining({ method: 'PATCH' })
    )
    fetchSpy.mockRestore()
  })
})

describe('notifyChannel', () => {
  it('Discord Channel Webhook API を呼び出す', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    )
    const envWithChannel = { ...mockEnv, DISCORD_NOTIFY_CHANNEL_ID: 'ch-456' } as unknown as Env
    await notifyChannel(envWithChannel, '⚠️ 起動しっぱなし警告')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/channels/ch-456/messages'),
      expect.objectContaining({ method: 'POST' })
    )
    fetchSpy.mockRestore()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/discord.test.ts
```

期待: FAIL — `notifyFollowup` / `notifyChannel` が存在しない

- [ ] **Step 3: src/discord/notify.ts を実装する**

```typescript
import type { VpsJob } from '../queue/types'

const DISCORD_API = 'https://discord.com/api/v10'

export async function notifyFollowup(
  env: Env,
  job: Pick<VpsJob, 'interactionToken'>,
  content: string
): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${job.interactionToken}/messages/@original`
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
}

export async function notifyChannel(env: Env, content: string): Promise<void> {
  const url = `${DISCORD_API}/channels/${env.DISCORD_NOTIFY_CHANNEL_ID}/messages`
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify({ content }),
  })
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/discord.test.ts
```

期待: PASS (全4テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/discord/notify.ts test/discord.test.ts
git commit -m "feat: add Discord followup and channel notification"
```

---

## Task 5: ConoHa 認証モジュール

**Files:**
- Create: `src/conoha/auth.ts`
- Create: `test/conoha.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// test/conoha.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getToken } from '../src/conoha/auth'

const mockEnv = {
  CONOHA_USERNAME: 'user',
  CONOHA_PASSWORD: 'pass',
  CONOHA_TENANT_ID: 'tenant-123',
  CONOHA_IDENTITY_ENDPOINT: 'https://identity.example.com/v2.0',
} as unknown as Env

describe('getToken', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('ConoHa Keystone からトークンを取得する', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access: {
            token: { id: 'tok-abc123' },
          },
        }),
        { status: 200 }
      )
    )
    const token = await getToken(mockEnv)
    expect(token).toBe('tok-abc123')
  })

  it('正しいリクエストボディで POST する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access: { token: { id: 'tok-xyz' } } }),
        { status: 200 }
      )
    )
    await getToken(mockEnv)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://identity.example.com/v2.0/tokens')
    const body = JSON.parse(init.body as string)
    expect(body.auth.passwordCredentials.username).toBe('user')
    expect(body.auth.passwordCredentials.password).toBe('pass')
    expect(body.auth.tenantId).toBe('tenant-123')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/conoha.test.ts
```

期待: FAIL — `getToken` が存在しない

- [ ] **Step 3: src/conoha/auth.ts を実装する**

```typescript
export async function getToken(env: Env): Promise<string> {
  const res = await fetch(`${env.CONOHA_IDENTITY_ENDPOINT}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth: {
        passwordCredentials: {
          username: env.CONOHA_USERNAME,
          password: env.CONOHA_PASSWORD,
        },
        tenantId: env.CONOHA_TENANT_ID,
      },
    }),
  })
  if (!res.ok) throw new Error(`ConoHa auth failed: ${res.status}`)
  const data = await res.json<{ access: { token: { id: string } } }>()
  return data.access.token.id
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/conoha.test.ts
```

期待: PASS (getToken の2テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/conoha/auth.ts test/conoha.test.ts
git commit -m "feat: add ConoHa Keystone authentication"
```

---

## Task 6: ConoHa サーバー操作 API

**Files:**
- Create: `src/conoha/server.ts`
- Modify: `test/conoha.test.ts` (テスト追加)

- [ ] **Step 1: 失敗するテストを追加する**

`test/conoha.test.ts` の末尾に追加:

```typescript
import {
  getServerStatus,
  createServer,
  stopServer,
  deleteServer,
} from '../src/conoha/server'

const TOKEN = 'tok-test'
const SERVER_ID = 'srv-abc'

describe('getServerStatus', () => {
  it('サーバーのステータスを返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ server: { id: SERVER_ID, status: 'ACTIVE' } }),
        { status: 200 }
      )
    )
    const status = await getServerStatus(mockEnv, TOKEN, SERVER_ID)
    expect(status).toBe('ACTIVE')
  })
})

describe('createServer', () => {
  it('サーバーを作成して ID を返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ server: { id: 'new-srv-id' } }),
        { status: 202 }
      )
    )
    const envWithFlavor = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
      GAME_SERVER_IMAGE_ID: 'img-001',
      GAME_SERVER_FLAVOR_ID: 'flv-001',
    } as unknown as Env
    const id = await createServer(envWithFlavor, TOKEN)
    expect(id).toBe('new-srv-id')
  })
})

describe('stopServer', () => {
  it('os-stop アクションを送信する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 202 })
    )
    const envWithCompute = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
    } as unknown as Env
    await stopServer(envWithCompute, TOKEN, SERVER_ID)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/servers/${SERVER_ID}/action`)
    expect(JSON.parse(init.body as string)).toEqual({ 'os-stop': null })
  })
})

describe('deleteServer', () => {
  it('サーバー削除リクエストを送信する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 204 })
    )
    const envWithCompute = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
    } as unknown as Env
    await deleteServer(envWithCompute, TOKEN, SERVER_ID)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/servers/${SERVER_ID}`)
    expect((init as RequestInit).method).toBe('DELETE')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/conoha.test.ts
```

期待: FAIL — サーバー操作関数が存在しない

- [ ] **Step 3: src/conoha/server.ts を実装する**

```typescript
function computeUrl(env: Env, path: string): string {
  return `${env.CONOHA_COMPUTE_ENDPOINT}${path}`
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': token }
}

export async function getServerStatus(
  env: Env,
  token: string,
  serverId: string
): Promise<string> {
  const res = await fetch(computeUrl(env, `/servers/${serverId}`), {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`getServerStatus failed: ${res.status}`)
  const data = await res.json<{ server: { id: string; status: string } }>()
  return data.server.status
}

export async function createServer(env: Env, token: string): Promise<string> {
  const res = await fetch(computeUrl(env, '/servers'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      server: {
        imageRef: env.GAME_SERVER_IMAGE_ID,
        flavorRef: env.GAME_SERVER_FLAVOR_ID,
      },
    }),
  })
  if (!res.ok) throw new Error(`createServer failed: ${res.status}`)
  const data = await res.json<{ server: { id: string } }>()
  return data.server.id
}

export async function stopServer(
  env: Env,
  token: string,
  serverId: string
): Promise<void> {
  const res = await fetch(computeUrl(env, `/servers/${serverId}/action`), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ 'os-stop': null }),
  })
  if (!res.ok) throw new Error(`stopServer failed: ${res.status}`)
}

export async function deleteServer(
  env: Env,
  token: string,
  serverId: string
): Promise<void> {
  const res = await fetch(computeUrl(env, `/servers/${serverId}`), {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 404) throw new Error(`deleteServer failed: ${res.status}`)
}

export async function getServerList(
  env: Env,
  token: string
): Promise<Array<{ id: string; status: string; created: string }>> {
  const res = await fetch(computeUrl(env, '/servers/detail'), {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`getServerList failed: ${res.status}`)
  const data = await res.json<{ servers: Array<{ id: string; status: string; created: string }> }>()
  return data.servers
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/conoha.test.ts
```

期待: PASS (全テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/conoha/server.ts test/conoha.test.ts
git commit -m "feat: add ConoHa server operations (get/create/stop/delete)"
```

---

## Task 7: ConoHa イメージ操作 API

**Files:**
- Create: `src/conoha/image.ts`
- Modify: `test/conoha.test.ts` (テスト追加)

- [ ] **Step 1: 失敗するテストを追加する**

`test/conoha.test.ts` の末尾に追加:

```typescript
import { createImage, getImageStatus } from '../src/conoha/image'

const IMAGE_ID = 'img-xyz'

describe('createImage', () => {
  it('イメージを作成して ID を返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ image: { id: 'new-img-id' } }),
        { status: 201 }
      )
    )
    const envWithImage = {
      ...mockEnv,
      CONOHA_IMAGE_ENDPOINT: 'https://image.example.com',
    } as unknown as Env
    const id = await createImage(envWithImage, TOKEN, SERVER_ID)
    expect(id).toBe('new-img-id')
  })
})

describe('getImageStatus', () => {
  it('イメージのステータスを返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ image: { id: IMAGE_ID, status: 'active' } }),
        { status: 200 }
      )
    )
    const envWithImage = {
      ...mockEnv,
      CONOHA_IMAGE_ENDPOINT: 'https://image.example.com',
    } as unknown as Env
    const status = await getImageStatus(envWithImage, TOKEN, IMAGE_ID)
    expect(status).toBe('active')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/conoha.test.ts
```

期待: FAIL — `createImage` / `getImageStatus` が存在しない

- [ ] **Step 3: src/conoha/image.ts を実装する**

```typescript
function imageUrl(env: Env, path: string): string {
  return `${env.CONOHA_IMAGE_ENDPOINT}${path}`
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': token }
}

export async function createImage(
  env: Env,
  token: string,
  serverId: string
): Promise<string> {
  const res = await fetch(imageUrl(env, '/v2/images'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      server_id: serverId,
      name: `vps-snapshot-${new Date().toISOString()}`,
    }),
  })
  if (!res.ok) throw new Error(`createImage failed: ${res.status}`)
  const data = await res.json<{ image: { id: string } }>()
  return data.image.id
}

export async function getImageStatus(
  env: Env,
  token: string,
  imageId: string
): Promise<string> {
  const res = await fetch(imageUrl(env, `/v2/images/${imageId}`), {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`getImageStatus failed: ${res.status}`)
  const data = await res.json<{ image: { id: string; status: string } }>()
  return data.image.status
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/conoha.test.ts
```

期待: PASS (全テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/conoha/image.ts test/conoha.test.ts
git commit -m "feat: add ConoHa image operations (create/get status)"
```

---

## Task 8: Stop ステートマシン

**Files:**
- Create: `src/statemachine/stop.ts`
- Create: `test/statemachine.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// test/statemachine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processStop } from '../src/statemachine/stop'
import type { VpsJob } from '../src/queue/types'

// ConoHa モジュールをモック
vi.mock('../src/conoha/auth', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token'),
}))
vi.mock('../src/conoha/server', () => ({
  stopServer: vi.fn().mockResolvedValue(undefined),
  getServerStatus: vi.fn(),
  deleteServer: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/conoha/image', () => ({
  createImage: vi.fn().mockResolvedValue('img-new'),
  getImageStatus: vi.fn(),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
}))

import { getServerStatus } from '../src/conoha/server'
import { getImageStatus } from '../src/conoha/image'
import { notifyFollowup } from '../src/discord/notify'

const mockEnv = {} as Env

function makeJob(state: VpsJob['state'], overrides: Partial<VpsJob> = {}): VpsJob {
  return {
    action: 'stop',
    state,
    serverId: 'srv-test',
    imageId: undefined,
    interactionToken: 'tok-test',
    channelId: 'ch-test',
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('processStop - stopping ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('SHUTOFF でない場合は { requeue: true, nextState: "stopping" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('ACTIVE')
    const result = await processStop(mockEnv, makeJob('stopping'))
    expect(result).toEqual({ requeue: true, nextState: 'stopping' })
  })

  it('SHUTOFF の場合は { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('SHUTOFF')
    const result = await processStop(mockEnv, makeJob('stopping'))
    expect(result).toEqual({ requeue: true, nextState: 'imaging' })
  })
})

describe('processStop - imaging ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('イメージが active でない場合は { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('saving')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'imaging' })
  })

  it('イメージが active の場合は { requeue: true, nextState: "deleting" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('active')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'deleting' })
  })
})

describe('processStop - deleting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('削除完了後に Discord 通知を送り { requeue: false } を返す', async () => {
    const result = await processStop(mockEnv, makeJob('deleting'))
    expect(notifyFollowup).toHaveBeenCalled()
    expect(result).toEqual({ requeue: false })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/statemachine.test.ts
```

期待: FAIL — `processStop` が存在しない

- [ ] **Step 3: src/statemachine/stop.ts を実装する**

```typescript
import { getToken } from '../conoha/auth'
import { getServerStatus, stopServer, deleteServer } from '../conoha/server'
import { createImage, getImageStatus } from '../conoha/image'
import { notifyFollowup } from '../discord/notify'
import type { VpsJob, VpsState } from '../queue/types'

type StopResult = { requeue: true; nextState: VpsState } | { requeue: false }

export async function processStop(env: Env, job: VpsJob): Promise<StopResult> {
  const token = await getToken(env)

  switch (job.state) {
    case 'stopping': {
      await stopServer(env, token, job.serverId!)
      const status = await getServerStatus(env, token, job.serverId!)
      if (status === 'SHUTOFF') return { requeue: true, nextState: 'imaging' }
      return { requeue: true, nextState: 'stopping' }
    }

    case 'imaging': {
      const imageId = job.imageId ?? await createImage(env, token, job.serverId!)
      const status = await getImageStatus(env, token, imageId)
      if (status === 'active') return { requeue: true, nextState: 'deleting' }
      return { requeue: true, nextState: 'imaging' }
    }

    case 'deleting': {
      await deleteServer(env, token, job.serverId!)
      await notifyFollowup(env, job, '✅ VPS を停止・保存・削除しました')
      return { requeue: false }
    }

    default:
      return { requeue: false }
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/statemachine.test.ts
```

期待: PASS (全テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/statemachine/stop.ts test/statemachine.test.ts
git commit -m "feat: add stop state machine (stopping→imaging→deleting)"
```

---

## Task 9: Start ステートマシン

**Files:**
- Create: `src/statemachine/start.ts`
- Modify: `test/statemachine.test.ts` (テスト追加)

- [ ] **Step 1: 失敗するテストを追加する**

`test/statemachine.test.ts` の先頭 mock 宣言に追加:

```typescript
import { processStart } from '../src/statemachine/start'
import { createServer } from '../src/conoha/server'
```

`vi.mock('../src/conoha/server', ...)` の中に `createServer: vi.fn()` を追加:

```typescript
vi.mock('../src/conoha/server', () => ({
  stopServer: vi.fn().mockResolvedValue(undefined),
  getServerStatus: vi.fn(),
  deleteServer: vi.fn().mockResolvedValue(undefined),
  createServer: vi.fn().mockResolvedValue('new-srv-id'),
}))
```

ファイル末尾にテストを追加:

```typescript
describe('processStart - starting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ACTIVE でない場合は { requeue: true, nextState: "starting" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('BUILD')
    const job = makeJob('starting') as VpsJob
    job.action = 'start'
    const result = await processStart(mockEnv, job)
    expect(result).toEqual({ requeue: true, nextState: 'starting' })
  })

  it('ACTIVE の場合は Discord 通知を送り { requeue: false } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('ACTIVE')
    const job: VpsJob = {
      ...makeJob('starting'),
      action: 'start',
      serverId: 'srv-existing',
    }
    const result = await processStart(mockEnv, job)
    expect(notifyFollowup).toHaveBeenCalled()
    expect(result).toEqual({ requeue: false })
  })

  it('serverId がない場合はサーバーを新規作成する', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('BUILD')
    const job: VpsJob = {
      ...makeJob('starting'),
      action: 'start',
      serverId: undefined,
    }
    await processStart(mockEnv, job)
    expect(createServer).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/statemachine.test.ts
```

期待: FAIL — `processStart` が存在しない

- [ ] **Step 3: src/statemachine/start.ts を実装する**

```typescript
import { getToken } from '../conoha/auth'
import { createServer, getServerStatus } from '../conoha/server'
import { notifyFollowup } from '../discord/notify'
import type { VpsJob, VpsState } from '../queue/types'

type StartResult = { requeue: true; nextState: VpsState } | { requeue: false }

export async function processStart(env: Env, job: VpsJob): Promise<StartResult> {
  const token = await getToken(env)

  const serverId = job.serverId ?? await createServer(env, token)
  const status = await getServerStatus(env, token, serverId)

  if (status === 'ACTIVE') {
    await notifyFollowup(env, job, `✅ VPS が起動しました（ID: \`${serverId}\`）\nゲームサーバーに接続できます。`)
    return { requeue: false }
  }

  return { requeue: true, nextState: 'starting' }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/statemachine.test.ts
```

期待: PASS (全テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/statemachine/start.ts test/statemachine.test.ts
git commit -m "feat: add start state machine (starting→ACTIVE)"
```

---

## Task 10: Consumer Worker

**Files:**
- Create: `src/consumer.ts`
- Create: `test/consumer.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// test/consumer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processQueue } from '../src/consumer'
import type { VpsJob } from '../src/queue/types'

vi.mock('../src/statemachine/stop', () => ({
  processStop: vi.fn().mockResolvedValue({ requeue: false }),
}))
vi.mock('../src/statemachine/start', () => ({
  processStart: vi.fn().mockResolvedValue({ requeue: false }),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
  notifyChannel: vi.fn().mockResolvedValue(undefined),
}))

import { processStop } from '../src/statemachine/stop'
import { processStart } from '../src/statemachine/start'
import { notifyFollowup } from '../src/discord/notify'

function makeJob(overrides: Partial<VpsJob> = {}): VpsJob {
  return {
    action: 'stop',
    state: 'stopping',
    serverId: 'srv-test',
    interactionToken: 'tok-test',
    channelId: 'ch-test',
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeMockMessage(job: VpsJob) {
  return {
    body: job,
    ack: vi.fn(),
    retry: vi.fn(),
  }
}

const mockEnv = {
  VPS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
} as unknown as Env

describe('processQueue', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('stop ジョブは processStop を呼ぶ', async () => {
    const msg = makeMockMessage(makeJob({ action: 'stop', state: 'stopping' }))
    await processQueue([msg], mockEnv)
    expect(processStop).toHaveBeenCalledWith(mockEnv, msg.body)
    expect(msg.ack).toHaveBeenCalled()
  })

  it('start ジョブは processStart を呼ぶ', async () => {
    const msg = makeMockMessage(makeJob({ action: 'start', state: 'starting' }))
    await processQueue([msg], mockEnv)
    expect(processStart).toHaveBeenCalledWith(mockEnv, msg.body)
    expect(msg.ack).toHaveBeenCalled()
  })

  it('タイムアウト済みジョブはエラー通知してスキップする', async () => {
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const msg = makeMockMessage(makeJob({ enqueuedAt: old }))
    await processQueue([msg], mockEnv)
    expect(notifyFollowup).toHaveBeenCalledWith(
      mockEnv,
      expect.anything(),
      expect.stringContaining('タイムアウト')
    )
    expect(processStop).not.toHaveBeenCalled()
    expect(msg.ack).toHaveBeenCalled()
  })

  it('requeue=true のとき VPS_QUEUE.send を delaySeconds=30 で呼ぶ', async () => {
    vi.mocked(processStop).mockResolvedValue({ requeue: true, nextState: 'imaging' })
    const msg = makeMockMessage(makeJob({ action: 'stop', state: 'stopping' }))
    await processQueue([msg], mockEnv)
    expect((mockEnv.VPS_QUEUE as any).send).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'imaging' }),
      { delaySeconds: 30 }
    )
    expect(msg.ack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/consumer.test.ts
```

期待: FAIL — `processQueue` が存在しない

- [ ] **Step 3: src/consumer.ts を実装する**

```typescript
import { processStop } from './statemachine/stop'
import { processStart } from './statemachine/start'
import { notifyFollowup } from './discord/notify'
import type { VpsJob } from './queue/types'

type Message = { body: VpsJob; ack(): void; retry(): void }

export async function processQueue(
  messages: Message[],
  env: Env
): Promise<void> {
  for (const msg of messages) {
    const job = msg.body
    const elapsed = Date.now() - new Date(job.enqueuedAt).getTime()

    if (elapsed > 10 * 60 * 1000) {
      await notifyFollowup(env, job, '⚠️ タイムアウト：手動確認してください')
      msg.ack()
      continue
    }

    let result: { requeue: boolean; nextState?: VpsJob['state'] }

    if (job.action === 'stop') {
      result = await processStop(env, job)
    } else if (job.action === 'start') {
      result = await processStart(env, job)
    } else {
      msg.ack()
      continue
    }

    if (result.requeue && result.nextState) {
      await env.VPS_QUEUE.send(
        { ...job, state: result.nextState },
        { delaySeconds: 30 }
      )
    }

    msg.ack()
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/consumer.test.ts
```

期待: PASS (全4テスト)

- [ ] **Step 5: コミットする**

```bash
git add src/consumer.ts test/consumer.test.ts
git commit -m "feat: add Queue Consumer with timeout handling and re-enqueue"
```

---

## Task 11: Cron Trigger Worker

**Files:**
- Create: `src/cron.ts`

- [ ] **Step 1: src/cron.ts を実装する**

（Cron は外部 API 依存が強く、単体テストの価値が低いためスキップする。）

```typescript
import { getToken } from './conoha/auth'
import { getServerList } from './conoha/server'
import { notifyChannel } from './discord/notify'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

export async function handleScheduled(env: Env): Promise<void> {
  const token = await getToken(env)
  const servers = await getServerList(env, token)

  for (const server of servers) {
    if (server.status !== 'ACTIVE') continue

    const uptime = Date.now() - new Date(server.created).getTime()
    if (uptime >= TWELVE_HOURS_MS) {
      await notifyChannel(
        env,
        `⚠️ **VPS が12時間以上起動しています**（ID: \`${server.id}\`）\n` +
          '30分後に自動停止は行いません。不要であれば `/stop` で停止してください。'
      )
    }
  }
}
```

- [ ] **Step 2: コミットする**

```bash
git add src/cron.ts
git commit -m "feat: add Cron Trigger for 12h VPS uptime warning"
```

---

## Task 12: Interaction Handler + エントリーポイント統合

**Files:**
- Create: `src/index.ts`
- Create: `test/index.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// test/index.test.ts
import { describe, it, expect, vi } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import handler from '../src/index'

// 署名検証をバイパス
vi.mock('../src/discord/verify', () => ({
  verifyDiscordSignature: vi.fn().mockResolvedValue(true),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
}))

function makeDiscordRequest(body: object): Request {
  return new Request('http://localhost/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': 'fake',
      'X-Signature-Timestamp': '0',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /interactions', () => {
  it('PING (type:1) に対して PONG (type:1) を返す', async () => {
    const req = makeDiscordRequest({ type: 1 })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const json = await res.json<{ type: number }>()
    expect(json.type).toBe(1)
  })

  it('/start コマンドで type:5 を返す', async () => {
    const req = makeDiscordRequest({
      type: 2,
      data: { name: 'start' },
      token: 'tok-test',
      channel_id: 'ch-test',
    })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const json = await res.json<{ type: number }>()
    expect(json.type).toBe(5)
  })

  it('/stop コマンドで type:5 を返す', async () => {
    const req = makeDiscordRequest({
      type: 2,
      data: { name: 'stop' },
      token: 'tok-test',
      channel_id: 'ch-test',
    })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    const json = await res.json<{ type: number }>()
    expect(json.type).toBe(5)
  })

  it('署名検証失敗時は 401 を返す', async () => {
    const { verifyDiscordSignature } = await import('../src/discord/verify')
    vi.mocked(verifyDiscordSignature).mockResolvedValueOnce(false)
    const req = makeDiscordRequest({ type: 1 })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run test/index.test.ts
```

期待: FAIL — `src/index.ts` が存在しない

- [ ] **Step 3: src/index.ts を実装する**

```typescript
import { Hono } from 'hono'
import { verifyDiscordSignature } from './discord/verify'
import { processQueue } from './consumer'
import { handleScheduled } from './cron'
import type { VpsJob } from './queue/types'

const app = new Hono<{ Bindings: Env }>()

app.post('/interactions', async (c) => {
  const verified = await verifyDiscordSignature(c)
  if (!verified) return c.json({ error: 'Unauthorized' }, 401)

  const bodyText = await c.req.text()
  const body = JSON.parse(bodyText) as {
    type: number
    data?: { name: string }
    token?: string
    channel_id?: string
  }

  if (body.type === 1) return c.json({ type: 1 })

  if (body.type === 2 && body.data && body.token && body.channel_id) {
    const action = body.data.name as VpsJob['action']
    const job: VpsJob = {
      action,
      state: action === 'stop' ? 'stopping' : 'starting',
      interactionToken: body.token,
      channelId: body.channel_id,
      enqueuedAt: new Date().toISOString(),
    }
    await c.env.VPS_QUEUE.send(job)
  }

  return c.json({ type: 5 })
})

export default {
  fetch: app.fetch.bind(app),

  async queue(batch: MessageBatch<VpsJob>, env: Env): Promise<void> {
    await processQueue(
      batch.messages.map(m => ({
        body: m.body,
        ack: () => m.ack(),
        retry: () => m.retry(),
      })),
      env
    )
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env)
  },
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run test/index.test.ts
```

期待: PASS (全4テスト)

- [ ] **Step 5: 全テストを通す**

```bash
npm test
```

期待: 全テスト PASS

- [ ] **Step 6: コミットする**

```bash
git add src/index.ts test/index.test.ts
git commit -m "feat: add Interaction Handler and wire all Workers entry points"
```

---

## Task 13: CI/CD パイプライン

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: .github/workflows/ci.yml を作成する**

```bash
mkdir -p .github/workflows
```

```yaml
# .github/workflows/ci.yml
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

- [ ] **Step 2: .github/workflows/deploy.yml を作成する**

```yaml
# .github/workflows/deploy.yml
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

- [ ] **Step 3: コミットする**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions CI test and deploy workflows"
```

---

## セルフレビュー

### 仕様カバレッジ確認

| 要件 | 対応タスク |
|---|---|
| Interaction Handler (Hono, 署名検証, type:5) | Task 3, 12 |
| PING→PONG | Task 12 |
| /start /stop /stop Queue エンキュー | Task 12 |
| Consumer Worker | Task 10 |
| stop ステートマシン (stopping→imaging→deleting) | Task 8 |
| start ステートマシン (starting→ACTIVE) | Task 9 |
| タイムアウト検知 (10分) | Task 10 |
| re-enqueue delaySeconds=30 | Task 10 |
| ConoHa 認証 (Keystone トークン) | Task 5 |
| ConoHa サーバー操作 | Task 6 |
| ConoHa イメージ操作 | Task 7 |
| Discord Followup 通知 | Task 4 |
| Discord Channel 通知 | Task 4 |
| Cron Trigger (2時間ごと, 12時間警告) | Task 11 |
| CI/CD (ci.yml + deploy.yml) | Task 13 |
| 環境変数 (Secrets + vars) | Task 1 |
| worker-configuration.d.ts | Task 1 |

全要件をカバーしている。

### 型一貫性確認

- `VpsJob.state` は `VpsState`（Task 2）で定義し、stop.ts・start.ts・consumer.ts・index.ts で同じ型を使用
- `processStop` / `processStart` の戻り値は `{ requeue: true; nextState: VpsState } | { requeue: false }` で統一
- `notifyFollowup(env, job, content)` のシグネチャはすべてのテストと実装で一致
- `processQueue` は `{ body: VpsJob; ack(): void; retry(): void }[]` を受け取り、`MessageBatch` への依存を排除してテスタブルに

### プレースホルダースキャン

- "REPLACE_ME" が wrangler.toml に残っているが、これは環境固有の値であり、意図的なプレースホルダー（開発者が自分の値で埋める）
- コードにプレースホルダーなし ✅
