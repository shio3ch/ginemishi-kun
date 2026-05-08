---
type: entity
title: "Cloudflare Queues"
created: 2026-05-08
updated: 2026-05-08
tags: [entity, cloudflare, queue]
status: developing
sources: [wiki/sources/spec.md]
---

# Cloudflare Queues

## 役割

[[Discord]] Webhook の3秒制約を突破するための非同期バッファ。[[Interaction Handler]] がジョブをエンキューし、[[Consumer Worker]] が非同期で処理する。

## キュー設定（vps-jobs）

```toml
[[queues.producers]]
queue   = "vps-jobs"
binding = "VPS_QUEUE"

[[queues.consumers]]
queue          = "vps-jobs"
max_batch_size = 1
max_retries    = 0
```

**`max_retries = 0` の理由**: リトライは Consumer Worker 自身が `delaySeconds=30` で自己再エンキューすることで管理。VpsJob にステート情報を持ち、失敗時の再開地点を明示できる。

## 自己再エンキューパターン

```
Consumer が処理中 → 未完了なら delaySeconds=30 で同じキューに再エンキュー
                 → 完了なら Discord に通知して終了
```

→ [[concepts/Queue-based Processing]] 参照

## 関連

- [[concepts/State Machine]]
- [[domains/architecture]]
