# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Discord Slash Command (`/start`, `/stop`, `/status`) で ConoHa for Games の VPS インスタンスを遠隔操作するシステム。Cloudflare Workers 上で動作し、使用時のみ VPS を起動してコストを最小化する。

詳細仕様は `wiki/` を参照:
- `wiki/index.md` — 全体インデックス
- `wiki/overview.md` — システム全体像
- `wiki/domains/architecture.md` — Worker エントリーポイント・キュー設計
- `wiki/domains/api-integration.md` — Discord / ConoHa API 詳細
- `wiki/domains/testing.md` — テスト戦略
- `wiki/domains/deployment.md` — デプロイ・CI/CD
- `wiki/concepts/State Machine.md` — Consumer のステート遷移
- `wiki/concepts/Deferred Response Pattern.md` — 3秒制約の解決策
- `wiki/concepts/VPS Lifecycle.md` — 起動・停止フロー

## コマンド

```bash
npm run dev       # ローカル開発サーバー起動 (wrangler dev)
npm test          # テスト実行 (vitest run)
npm run deploy    # Cloudflare Workers へデプロイ (wrangler deploy)
npm run types     # Env 型定義を自動生成 (wrangler types → worker-configuration.d.ts)
```

単一テストファイルの実行:
```bash
npx vitest run test/consumer.test.ts
```

## 環境変数

機密情報は `wrangler secret put <KEY>` で登録し、コードには含めない。`Env` 型は `npm run types` で自動生成される `worker-configuration.d.ts` を参照する。

Secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `CONOHA_USERNAME`, `CONOHA_PASSWORD`

vars（`wrangler.toml` に記載）: `DISCORD_APPLICATION_ID`, `CONOHA_TENANT_ID`, 各 API エンドポイント, `GAME_SERVER_IMAGE_ID`, `GAME_SERVER_FLAVOR_ID`, `DISCORD_NOTIFY_CHANNEL_ID`
