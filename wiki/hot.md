---
type: meta
title: "Hot Cache"
updated: 2026-05-08
---

# Hot Cache

直近のセッションで把握したコンテキスト。将来のセッションで素早く状況を把握するために使う。

## 現在の状態

- **フェーズ**: 設計完了・実装前（specs/spec.md が基準文書）
- **実装済み**: なし（src/ ディレクトリ未作成）
- **直近の作業**: wiki vault を初期構築

## キー情報

- Consumer Worker はステートマシン設計。`delaySeconds=30` の自己再エンキューでポーリングを代替
- Interaction Handler の3秒制約 → `type:5` deferred + Queue エンキューで解決
- stop フロー: `stopping → imaging → deleting`、start フロー: `starting → ACTIVE確認`
- タイムアウト: `enqueuedAt` から10分超過で異常扱い
- `interactionToken` 有効期限15分 → 長時間処理は `channelId` への直接 Webhook にフォールバック
- Queue は `max_retries = 0`（自前管理）

## 未解決・要確認事項

- 実装はこれから開始
- ConoHa API の実際のエンドポイントは `wrangler.toml` vars で管理
