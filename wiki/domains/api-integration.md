---
type: domain
title: "API 連携"
created: 2026-05-08
updated: 2026-05-08
tags: [domain, api, discord, conoha]
status: developing
---

# API 連携

## Discord API

→ [[entities/Discord]] 参照

### Interaction Webhook

- エンドポイント: `POST /interactions`
- 署名検証: `X-Signature-Ed25519` / `X-Signature-Timestamp` ヘッダ
- 3秒以内に応答必須 → `type:5`（deferred）で即時返却

### Slash Commands

| コマンド | エンキューするジョブ |
|---|---|
| `/start` | `{ action: "start", state: "starting" }` |
| `/stop` | `{ action: "stop", state: "stopping" }` |
| `/status` | `{ action: "status" }` |

### Followup 通知

- `interactionToken` 有効期限: **15分**
- 長時間処理（10分超）では `channelId` への直接 Webhook にフォールバック

## ConoHa VPS API (OpenStack)

→ [[entities/ConoHa VPS]] 参照

### 認証フロー

1. `POST /tokens` でトークン取得（Keystone 認証）
2. レスポンスの `access.token.id` を `X-Auth-Token` ヘッダとして付与
3. トークン有効期限（通常24時間）を考慮して再取得

### 主要エンドポイント

| 操作 | メソッド | パス |
|---|---|---|
| トークン取得 | POST | `/tokens` |
| サーバー一覧 | GET | `/servers` |
| サーバー詳細 | GET | `/servers/{id}` |
| サーバー作成 | POST | `/servers` |
| サーバー停止 | POST | `/servers/{id}/action` |
| サーバー削除 | DELETE | `/servers/{id}` |
| イメージ作成 | POST | `/images` |
| イメージ詳細 | GET | `/images/{id}` |

### VPS Job スキーマ

```typescript
type VpsJob = {
  action: 'start' | 'stop' | 'status'
  state: 'starting' | 'stopping' | 'imaging' | 'deleting' | 'done'
  serverId?: string
  imageId?: string
  interactionToken: string
  channelId: string
  enqueuedAt: string  // ISO 8601、タイムアウト検知用
}
```
