---
type: entity
title: "Discord"
created: 2026-05-08
updated: 2026-05-08
tags: [entity, discord, api]
status: developing
sources: [wiki/sources/spec.md]
---

# Discord

## 役割

ginemishi-kun のユーザーインターフェース。Slash Command (`/start`, `/stop`, `/status`) を通じてゲームサーバーを操作する。

## Interaction Webhook

Discord は Slash Command を受け取ると、登録された URL に `POST /interactions` を送信する。

**署名検証ヘッダ:**
- `X-Signature-Ed25519`
- `X-Signature-Timestamp`

Secret: `DISCORD_PUBLIC_KEY` で検証。

## レスポンス要件

- **3秒以内**に HTTP 応答を返さなければならない
- 処理が長引く場合は `type:5`（deferred channel message）を返して時間を確保 → [[concepts/Deferred Response Pattern]]

## Followup 通知

- `interactionToken` を使って処理完了後に追加メッセージを送信
- `interactionToken` の有効期限: **15分**
- 有効期限切れのフォールバック: `channelId` への直接 Webhook（`DISCORD_BOT_TOKEN` 使用）

## 環境変数

| 変数 | 種別 |
|---|---|
| `DISCORD_PUBLIC_KEY` | Secret |
| `DISCORD_BOT_TOKEN` | Secret |
| `DISCORD_APPLICATION_ID` | var |
| `DISCORD_NOTIFY_CHANNEL_ID` | var |
