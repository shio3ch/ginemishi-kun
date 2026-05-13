import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getToken } from '../src/conoha/auth'
import {
  getServerStatus,
  createServer,
  stopServer,
  deleteServer,
  getServerList,
} from '../src/conoha/server'
import { createImage, getImageStatus } from '../src/conoha/image'

const mockEnv = {
  CONOHA_USERNAME: 'user',
  CONOHA_PASSWORD: 'pass',
  CONOHA_TENANT_ID: 'tenant-123',
  CONOHA_IDENTITY_ENDPOINT: 'https://identity.example.com/v2.0',
} as unknown as Env

const TOKEN = 'tok-test'
const SERVER_ID = 'srv-abc'

/**
 * getToken — ConoHa Keystone v2 API でパスワード認証しトークンを取得する関数
 * テスト観点: 正常取得・リクエスト内容（URL/ボディ）の正確性・認証失敗時のエラー伝播
 */
describe('getToken', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** 正常系: レスポンスの access.token.id がそのまま返り値になること */
  it('ConoHa Keystone からトークンを取得する', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access: {
            token: { id: 'tok-abc123' },
          },
        }),
        { status: 200 }
      )
    )
    const token = await getToken(mockEnv)
    expect(token).toBe('tok-abc123')
  })

  /** リクエスト内容: 正しい URL・credentials・tenantId が送信されること */
  it('正しいリクエストボディで POST する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access: { token: { id: 'tok-xyz' } } }),
        { status: 200 }
      )
    )
    await getToken(mockEnv)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://identity.example.com/v2.0/tokens')
    const body = JSON.parse(init.body as string)
    expect(body.auth.passwordCredentials.username).toBe('user')
    expect(body.auth.passwordCredentials.password).toBe('pass')
    expect(body.auth.tenantId).toBe('tenant-123')
  })

  /** 異常系: 4xx/5xx レスポンス時にエラーをスローすること（呼び出し元でハンドリングできるよう） */
  it('認証失敗時にエラーをスローする', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    )
    await expect(getToken(mockEnv)).rejects.toThrow('ConoHa auth failed: 401')
  })
})

/**
 * getServerStatus — 指定サーバーの現在ステータスを取得する関数
 * テスト観点: API レスポンスから status フィールドが正しく抽出されること
 */
describe('getServerStatus', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** 正常系: server.status がそのまま返ること */
  it('サーバーのステータスを返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ server: { id: SERVER_ID, status: 'ACTIVE' } }),
        { status: 200 }
      )
    )
    const envWithCompute = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
    } as unknown as Env
    const status = await getServerStatus(envWithCompute, TOKEN, SERVER_ID)
    expect(status).toBe('ACTIVE')
  })
})

/**
 * createServer — イメージとフレーバーを指定してサーバーを新規作成する関数
 * テスト観点: 作成完了後に新サーバーの ID が返ること
 */
describe('createServer', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** 正常系: 202 レスポンスから server.id が返ること */
  it('サーバーを作成して ID を返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ server: { id: 'new-srv-id' } }),
        { status: 202 }
      )
    )
    const envWithFlavor = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
      GAME_SERVER_IMAGE_ID: 'img-001',
      GAME_SERVER_FLAVOR_ID: 'flv-001',
    } as unknown as Env
    const id = await createServer(envWithFlavor, TOKEN)
    expect(id).toBe('new-srv-id')
  })
})

/**
 * stopServer — OpenStack の os-stop アクションでサーバーをシャットダウンする関数
 * テスト観点: 正しいエンドポイントに os-stop ペイロードが送信されること
 */
describe('stopServer', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** リクエスト内容: /servers/{id}/action に { "os-stop": null } が送信されること */
  it('os-stop アクションを送信する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 202 })
    )
    const envWithCompute = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
    } as unknown as Env
    await stopServer(envWithCompute, TOKEN, SERVER_ID)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/servers/${SERVER_ID}/action`)
    expect(JSON.parse(init.body as string)).toEqual({ 'os-stop': null })
  })
})

/**
 * deleteServer — サーバーを完全削除する関数
 * テスト観点: DELETE メソッドで正しいエンドポイントにリクエストが送信されること
 */
describe('deleteServer', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** リクエスト内容: DELETE /servers/{id} が送信されること */
  it('サーバー削除リクエストを送信する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 })
    )
    const envWithCompute = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
    } as unknown as Env
    await deleteServer(envWithCompute, TOKEN, SERVER_ID)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/servers/${SERVER_ID}`)
    expect((init as RequestInit).method).toBe('DELETE')
  })
})

/**
 * getServerList — 全サーバーの詳細一覧を取得する関数（Cron で起動中サーバーを検出するために使用）
 * テスト観点: 全サーバーが配列で返ること・/servers/detail エンドポイントが使われること
 */
describe('getServerList', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** 正常系: servers 配列がそのまま返り、/servers/detail が呼ばれること */
  it('サーバー一覧を返す', async () => {
    const servers = [
      { id: 'srv-1', status: 'ACTIVE', created: '2026-05-08T00:00:00Z' },
      { id: 'srv-2', status: 'SHUTOFF', created: '2026-05-07T00:00:00Z' },
    ]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ servers }), { status: 200 })
    )
    const envWithCompute = {
      ...mockEnv,
      CONOHA_COMPUTE_ENDPOINT: 'https://compute.example.com/v2/tenant',
    } as unknown as Env
    const result = await getServerList(envWithCompute, TOKEN)
    expect(result).toEqual(servers)
    expect(fetchSpy.mock.calls[0][0]).toContain('/servers/detail')
  })
})

const IMAGE_ID = 'img-xyz'

/**
 * createImage — 指定サーバーのスナップショットイメージを作成する関数
 * テスト観点: 作成完了後に新イメージの ID が返ること
 */
describe('createImage', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** 正常系: 201 レスポンスから image.id が返ること */
  it('イメージを作成して ID を返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ image: { id: 'new-img-id' } }),
        { status: 201 }
      )
    )
    const envWithImage = {
      ...mockEnv,
      CONOHA_IMAGE_ENDPOINT: 'https://image.example.com',
    } as unknown as Env
    const id = await createImage(envWithImage, TOKEN, SERVER_ID)
    expect(id).toBe('new-img-id')
  })
})

/**
 * getImageStatus — イメージの現在ステータスを取得する関数（saving → active を polling するために使用）
 * テスト観点: API レスポンスから status フィールドが正しく抽出されること
 */
describe('getImageStatus', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  /** 正常系: image.status がそのまま返ること */
  it('イメージのステータスを返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ image: { id: IMAGE_ID, status: 'active' } }),
        { status: 200 }
      )
    )
    const envWithImage = {
      ...mockEnv,
      CONOHA_IMAGE_ENDPOINT: 'https://image.example.com',
    } as unknown as Env
    const status = await getImageStatus(envWithImage, TOKEN, IMAGE_ID)
    expect(status).toBe('active')
  })
})
