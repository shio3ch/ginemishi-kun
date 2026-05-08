---
type: entity
title: "ConoHa VPS"
created: 2026-05-08
updated: 2026-05-08
tags: [entity, conoha, vps, openstack]
status: developing
sources: [wiki/sources/spec.md]
---

# ConoHa VPS

## 役割

ginemishi-kun が制御するゲームサーバーの実行基盤。ConoHa for Games の VPS インスタンス。

## API

OpenStack REST API（Compute API v2）。

### 認証

Keystone (`POST /tokens`) でトークンを取得し、`X-Auth-Token` ヘッダとして付与する。

### 主要操作

| 操作 | メソッド | パス |
|---|---|---|
| トークン取得 | POST | `/tokens` |
| サーバー一覧 | GET | `/servers` |
| サーバー詳細 | GET | `/servers/{id}` |
| サーバー作成 | POST | `/servers` |
| サーバー停止 | POST | `/servers/{id}/action` (`"os-stop": null`) |
| サーバー削除 | DELETE | `/servers/{id}` |
| イメージ作成 | POST | `/images` |
| イメージ詳細 | GET | `/images/{id}` |

参考: https://doc.conoha.jp/reference/api-vps3/

## VPS ライフサイクル

→ [[concepts/VPS Lifecycle]] 参照

## 環境変数

| 変数 | 種別 |
|---|---|
| `CONOHA_USERNAME` | Secret |
| `CONOHA_PASSWORD` | Secret |
| `CONOHA_TENANT_ID` | var |
| `CONOHA_IDENTITY_ENDPOINT` | var |
| `CONOHA_COMPUTE_ENDPOINT` | var |
| `CONOHA_IMAGE_ENDPOINT` | var |
| `GAME_SERVER_IMAGE_ID` | var |
| `GAME_SERVER_FLAVOR_ID` | var |

## インスタンスのステータス

- `ACTIVE`: 起動中
- `SHUTOFF`: 停止中
- イメージ: `active` が完成状態
