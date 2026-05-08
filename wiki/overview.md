---
type: overview
title: "ginemishi-kun 知識ベース"
created: 2026-05-08
updated: 2026-05-08
tags: [overview, project]
status: developing
---

# ginemishi-kun

Discord Slash Command (`/start`, `/stop`, `/status`) で [[ConoHa VPS]] インスタンスを遠隔操作するシステム。[[Cloudflare Workers]] 上で動作し、使用時のみ VPS を起動してコストを最小化する。

## 目的

週1〜2回・数時間の利用を想定したゲームサーバー管理。常時起動によるコスト発生を防ぐため、使用時のみ起動・終了時にイメージ保存して削除する。

## システム全体像

```
Discord クライアント
  │ /start, /stop, /status
  ▼
Discord API → Webhook → [[Interaction Handler]] (Cloudflare Workers / Hono)
  │ type:5 deferred（3秒以内）
  ▼
[[Cloudflare Queues]] (vps-jobs)
  ▼
[[Consumer Worker]] (ステートマシン)
  ▼
[[ConoHa VPS]] API (OpenStack REST)
  ▼
ゲームサーバー VPS
```

Cron Trigger が2時間ごとに監視し、12時間以上起動していれば Discord に警告通知。

## ドメイン

- [[domains/architecture|アーキテクチャ]] — Workerエントリーポイント・キュー設計
- [[domains/api-integration|API連携]] — Discord API・ConoHa API 詳細
- [[domains/deployment|デプロイ]] — Cloudflare Workers へのデプロイ・CI/CD
- [[domains/testing|テスト]] — vitest-pool-workers・モック戦略

## 主要エンティティ

- [[Discord]] — Slash Command・Webhook・署名検証
- [[Cloudflare Workers]] — サーバーレス実行環境
- [[Cloudflare Queues]] — 非同期ジョブキュー
- [[ConoHa VPS]] — ゲームサーバー VPS
- [[Hono]] — Web フレームワーク

## 主要コンセプト

- [[State Machine]] — Consumer Worker の状態遷移
- [[Deferred Response Pattern]] — 3秒制約の解決策
- [[VPS Lifecycle]] — 起動・停止・イメージ保存フロー
