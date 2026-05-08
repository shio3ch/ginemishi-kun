---
type: entity
title: "Hono"
created: 2026-05-08
updated: 2026-05-08
tags: [entity, framework, typescript]
status: developing
sources: [wiki/sources/spec.md]
---

# Hono

## 役割

[[Cloudflare Workers]] 上で HTTP ルーティングを行う Web フレームワーク。Interaction Handler (`src/index.ts`) で使用。

## 選定理由

- Workers ネイティブ設計（Edge ランタイムに最適化）
- 軽量で型推論が強力
- TypeScript との親和性が高い

## 使用箇所

```typescript
import { Hono } from 'hono'
const app = new Hono<{ Bindings: Env }>()
app.post('/interactions', async (c) => { ... })
export default app
```

## 関連

- [[Cloudflare Workers]]
- [[domains/architecture]]
