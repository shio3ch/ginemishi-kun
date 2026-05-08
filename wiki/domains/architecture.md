---
type: domain
title: "アーキテクチャ"
created: 2026-05-08
updated: 2026-05-08
tags: [domain, architecture, cloudflare]
status: developing
---

# アーキテクチャ

## システムフロー

```
Discord クライアント
  │ /start, /stop, /status
  ▼
Discord API → POST /interactions (Webhook)
  ▼
Interaction Handler (src/index.ts) — [[Hono]] / [[Cloudflare Workers]]
  │ 署名検証 → type:5 deferred 応答（3秒以内）
  │ vps-jobs Queue にジョブをエンキュー
  ▼
[[Cloudflare Queues]] (vps-jobs)
  ▼
Consumer Worker (src/consumer.ts)
  │ [[concepts/State Machine]] で非同期処理
  │ 未完了 → delaySeconds=30 で自己再エンキュー
  ▼
[[ConoHa VPS]] API (OpenStack REST)
  ▼
ゲームサーバー VPS
```

**Cron Trigger** (src/cron.ts): 2時間ごとに VPS 起動時間を監視。12時間超で [[Discord]] に警告通知。

## 3つの Worker エントリーポイント

| ファイル | 役割 |
|---|---|
| `src/index.ts` | Interaction Handler。Webhook 受信・署名検証・Queue エンキュー |
| `src/consumer.ts` | Queue Consumer。ステートマシンで非同期処理 |
| `src/cron.ts` | Cron Trigger。VPS 起動時間の監視・通知 |

## ディレクトリ構成

```
src/
  index.ts              # Interaction Handler
  consumer.ts           # Queue Consumer
  cron.ts               # Cron Trigger
  conoha/
    auth.ts             # Keystone トークン管理
    server.ts           # サーバー操作 API
    image.ts            # イメージ操作 API
  discord/
    verify.ts           # 署名検証
    notify.ts           # Followup / Webhook 通知
  queue/
    types.ts            # VpsJob 型定義
  statemachine/
    stop.ts             # stop フロー
    start.ts            # start フロー
```

## 設計上の重要な判断

- **Interaction Handler は薄く保つ**: 3秒制約のため、実処理はすべて Queue に委譲
- **Queue の `max_retries = 0`**: リトライは自前の再エンキューで管理（ステート情報を持ちつつ再試行できる）
- **Cron は通知のみ**: 自動停止は誤操作防止のため実装しない

## 関連

- [[concepts/State Machine]]
- [[concepts/Deferred Response Pattern]]
- [[concepts/Queue-based Processing]]
- [[concepts/VPS Lifecycle]]
