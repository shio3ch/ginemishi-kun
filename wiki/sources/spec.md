---
type: source
title: "設計仕様書"
source_file: specs/spec.md
created: 2026-05-08
updated: 2026-05-08
tags: [source, spec, architecture]
status: active
---

# 設計仕様書

`specs/spec.md` の要約・整理。

## 概要

[[Discord]] Slash Command で [[ConoHa VPS]] を遠隔操作するシステム。週1〜2回・数時間の利用を想定し、使用時のみ VPS を起動してコストを最小化。

## アーキテクチャ概要

→ [[domains/architecture]] 参照

## コンポーネント

1. **[[concepts/Interaction Handler]]** (`src/index.ts`) — Webhook 受信・署名検証・deferred 応答・Queue エンキュー
2. **[[concepts/Consumer Worker]]** (`src/consumer.ts`) — [[concepts/State Machine]] によるステート遷移・ConoHa API 呼び出し
3. **Cron Trigger** (`src/cron.ts`) — 2時間ごとに VPS 起動時間を監視・警告通知

## 主要制約

- Interaction Handler: **3秒以内**に Discord へ応答（→ [[concepts/Deferred Response Pattern]]）
- `interactionToken` 有効期限: **15分**
- Queue `max_retries = 0`（自前リトライ）
- Cron は通知のみ（自動停止なし）

## 実装スタック

| 項目 | 技術 |
|---|---|
| 言語 | TypeScript |
| Web フレームワーク | [[Hono]] |
| テスト | Vitest + `@cloudflare/vitest-pool-workers` |
| 実行環境 | [[Cloudflare Workers]] |
| キュー | [[Cloudflare Queues]] |

## 環境変数

Secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `CONOHA_USERNAME`, `CONOHA_PASSWORD`

vars: `DISCORD_APPLICATION_ID`, `CONOHA_TENANT_ID`, 各 API エンドポイント, `GAME_SERVER_IMAGE_ID`, `GAME_SERVER_FLAVOR_ID`, `DISCORD_NOTIFY_CHANNEL_ID`
