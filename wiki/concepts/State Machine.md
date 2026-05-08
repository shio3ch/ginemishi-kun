---
type: concept
title: "State Machine"
created: 2026-05-08
updated: 2026-05-08
tags: [concept, statemachine, async]
status: developing
---

# State Machine

## 概要

Consumer Worker (`src/consumer.ts`) は[[concepts/Queue-based Processing|キューベースのステートマシン]]として動作する。[[Cloudflare Queues]] の自己再エンキューにより、非同期ポーリングをシミュレートする。

## stop フロー

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

## start フロー

```
starting
  │ ConoHa API: POST /servers（イメージから復元）
  │ GET /servers/{id} でステータス確認
  ├─ ACTIVE でない  → { state: "starting" } を delaySeconds=30 で再エンキュー
  └─ ACTIVE         → Discord に起動完了・接続情報を通知
```

## タイムアウト処理

各ジョブは `enqueuedAt`（ISO 8601）を持つ。10分超過で異常とみなし、[[Discord]] に警告して終了。

```typescript
const elapsed = Date.now() - new Date(job.enqueuedAt).getTime()
if (elapsed > 10 * 60 * 1000) {
  await notifyDiscord(env, job, '⚠️ タイムアウト：手動確認してください')
  msg.ack()
  return
}
```

## ステート型

```typescript
type VpsState = 'starting' | 'stopping' | 'imaging' | 'deleting' | 'done'
```

## 関連

- [[Cloudflare Queues]]
- [[concepts/Queue-based Processing]]
- [[concepts/VPS Lifecycle]]
- [[domains/architecture]]
