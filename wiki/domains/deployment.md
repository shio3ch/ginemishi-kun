---
type: domain
title: "デプロイ・CI/CD"
created: 2026-05-08
updated: 2026-05-08
tags: [domain, deployment, cicd, cloudflare]
status: developing
---

# デプロイ・CI/CD

## コマンド

```bash
npm run dev       # ローカル開発サーバー (wrangler dev)
npm run deploy    # Cloudflare Workers へデプロイ (wrangler deploy)
npm run types     # Env 型定義を自動生成 (wrangler types)
npm test          # テスト実行 (vitest run)
```

## CI/CD フロー

```
PR 作成 / feature ブランチ push
  └─ ci.yml → vitest 実行 → 失敗時はマージ不可

main ブランチへの merge (push)
  └─ deploy.yml → vitest → wrangler deploy → Cloudflare Workers
```

## 環境変数管理

### Secrets（`wrangler secret put` で登録）

```bash
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put CONOHA_USERNAME
wrangler secret put CONOHA_PASSWORD
```

### vars（`wrangler.toml` に記載）

`DISCORD_APPLICATION_ID`, `CONOHA_TENANT_ID`, `CONOHA_IDENTITY_ENDPOINT`, `CONOHA_COMPUTE_ENDPOINT`, `CONOHA_IMAGE_ENDPOINT`, `GAME_SERVER_IMAGE_ID`, `GAME_SERVER_FLAVOR_ID`, `DISCORD_NOTIFY_CHANNEL_ID`

### GitHub Secrets（deploy.yml 用）

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## wrangler.toml 要点

```toml
[[queues.consumers]]
queue          = "vps-jobs"
max_batch_size = 1
max_retries    = 0   # 自前管理

[triggers]
crons = ["0 */2 * * *"]
```

## Branch Protection（main）

- PR 必須
- `test` ジョブ (ci.yml) の pass が必須
- 最新ブランチ状態必須
