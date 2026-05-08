---
type: entity
title: "Cloudflare Workers"
created: 2026-05-08
updated: 2026-05-08
tags: [entity, cloudflare, serverless]
status: developing
sources: [wiki/sources/spec.md]
---

# Cloudflare Workers

## 役割

ginemishi-kun のサーバーレス実行環境。[[Hono]] で HTTP ルーティングを行い、[[Discord]] Webhook を受け取る。

## エントリーポイント

| ファイル | 役割 |
|---|---|
| `src/index.ts` | Interaction Handler（HTTP リクエスト） |
| `src/consumer.ts` | Queue Consumer（Queue メッセージ処理） |
| `src/cron.ts` | Cron Trigger（定期実行） |

## 重要な制約

- HTTP ハンドラは **3秒以内**に応答しなければならない（Discord の要件）
- CPU 時間・メモリなどの Workers 制約あり

## ローカル開発

```bash
npm run dev  # wrangler dev でローカルサーバー起動
```

## 型定義

```bash
npm run types  # wrangler types → worker-configuration.d.ts を自動生成
```

`Env` 型はこのファイルを参照することで binding・env vars の型安全を保つ。

## 関連

- [[Cloudflare Queues]]
- [[domains/architecture]]
- [[domains/deployment]]
