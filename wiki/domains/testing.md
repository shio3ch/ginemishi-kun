---
type: domain
title: "テスト戦略"
created: 2026-05-08
updated: 2026-05-08
tags: [domain, testing, vitest]
status: developing
---

# テスト戦略

## テスト環境

`@cloudflare/vitest-pool-workers` を使い、Queue binding を含む [[Cloudflare Workers]] ランタイム環境をローカルで再現する。`vitest.config.ts` は `wrangler.toml` を参照して binding を解決する。

```typescript
// vitest.config.ts
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
})
```

## テストファイル

| ファイル | テスト対象 |
|---|---|
| `test/index.test.ts` | Interaction Handler |
| `test/consumer.test.ts` | Consumer Worker |
| `test/statemachine.test.ts` | ステートマシン |
| `test/conoha.test.ts` | ConoHa API クライアント |
| `test/discord.test.ts` | Discord 署名検証・通知 |

## モック方針

- [[ConoHa VPS]] API への HTTP 通信: `vi.mock` でモック
- ビジネスロジック層（ステートマシン・APIクライアント・署名検証）: 通常のユニットテスト

## 単一ファイルのテスト実行

```bash
npx vitest run test/consumer.test.ts
```
