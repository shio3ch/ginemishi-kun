---
type: concept
title: "Deferred Response Pattern"
created: 2026-05-08
updated: 2026-05-08
tags: [concept, discord, pattern]
status: developing
---

# Deferred Response Pattern

## 問題

[[Discord]] は Interaction Webhook に対して **3秒以内**に HTTP レスポンスを返すことを要求する。しかし [[ConoHa VPS]] の API 呼び出しやポーリングには数分かかる場合がある。

## 解決策

```
1. Interaction Handler が即座に type:5 (deferred) を返す
   → Discord に「処理中...」表示が出る

2. 実際の処理を Cloudflare Queues に委譲

3. Consumer Worker が処理完了後に interactionToken で Followup 通知
   → Discord に結果メッセージが送られる
```

## Followup 通知のフォールバック

`interactionToken` の有効期限は **15分**。長時間処理（10分超）が想定される場合:

- `channelId` への直接 Webhook にフォールバック
- `DISCORD_BOT_TOKEN` を使用

## コード例（Interaction Handler 側）

```typescript
// type:5 で即時返却
return c.json({ type: 5 })

// 非同期でキューにエンキュー
await c.env.VPS_QUEUE.send({
  action: body.data.name,
  state: body.data.name === 'stop' ? 'stopping' : 'starting',
  interactionToken: body.token,
  channelId: body.channel_id,
  enqueuedAt: new Date().toISOString(),
} satisfies VpsJob)
```

## 関連

- [[entities/Discord]]
- [[Cloudflare Queues]]
- [[concepts/Queue-based Processing]]
