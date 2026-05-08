---
type: concept
title: "Queue-based Processing"
created: 2026-05-08
updated: 2026-05-08
tags: [concept, queue, async, pattern]
status: developing
---

# Queue-based Processing

## 概要

[[Cloudflare Queues]] を使ったキューベースの非同期処理パターン。[[concepts/Deferred Response Pattern]] と組み合わせて、[[Discord]] の3秒制約を突破する。

## 自己再エンキューパターン

Consumer Worker は処理完了まで自分自身をキューに再投入する。

```
メッセージ受信
  │
  ├─ タイムアウト確認（10分超 → 異常終了）
  │
  ├─ 現在のステートを処理
  │   ├─ 処理完了 → Discord 通知 → msg.ack()
  │   └─ 未完了  → 次ステート or 同ステートを delaySeconds=30 で再エンキュー → msg.ack()
  │
  └─ msg.ack()（必ず呼ぶ）
```

**`max_retries = 0` との組み合わせ**: Cloudflare のリトライ機能は使わず、自前でステートを保持したまま再エンキューする。これにより再開ポイントが明確。

## VpsJob スキーマ

```typescript
type VpsJob = {
  action: VpsAction
  state: VpsState
  serverId?: string
  imageId?: string
  interactionToken: string
  channelId: string
  enqueuedAt: string  // タイムアウト管理の基準時刻
}
```

## 利点

- ステートレスな Worker で複数ステップの処理を実現
- 各ステートで失敗しても `enqueuedAt` と `state` があるため再開可能
- 自然なポーリング間隔（30秒）を `delaySeconds` で制御

## 関連

- [[Cloudflare Queues]]
- [[concepts/State Machine]]
- [[concepts/Deferred Response Pattern]]
