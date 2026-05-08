---
type: concept
title: "VPS Lifecycle"
created: 2026-05-08
updated: 2026-05-08
tags: [concept, vps, lifecycle]
status: developing
---

# VPS Lifecycle

## 概要

ginemishi-kun の VPS は「使う時だけ起動・終了時にイメージ保存して削除」というサイクルで動作する。これによりコストを最小化する。

## 起動フロー（/start）

```
1. 保存済みイメージ (GAME_SERVER_IMAGE_ID) からインスタンスを作成
   POST /servers { imageRef: IMAGE_ID, flavorRef: FLAVOR_ID }

2. インスタンスが ACTIVE になるまでポーリング（30秒間隔）

3. ACTIVE になったら Discord に接続情報を通知
```

## 停止フロー（/stop）

```
1. インスタンスを停止
   POST /servers/{id}/action { "os-stop": null }
   → SHUTOFF になるまでポーリング（30秒間隔）

2. イメージを作成（スナップショット）
   POST /images
   → active になるまでポーリング（30秒間隔）

3. インスタンスを削除
   DELETE /servers/{id}

4. Discord に完了通知
```

## タイムアウト

各フローは `enqueuedAt` から **10分**でタイムアウト。[[State Machine|ステートマシン]]が検知して Discord に警告。

## Cron 監視

2時間ごとに VPS ステータスを確認。**12時間以上**起動していれば Discord に警告通知（自動停止はしない）。

## 関連

- [[concepts/State Machine]]
- [[entities/ConoHa VPS]]
- [[domains/api-integration]]
