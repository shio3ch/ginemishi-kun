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

describe('getToken', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

  it('認証失敗時にエラーをスローする', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    )
    await expect(getToken(mockEnv)).rejects.toThrow('ConoHa auth failed: 401')
  })
})

describe('getServerStatus', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

describe('createServer', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

describe('stopServer', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

describe('deleteServer', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

describe('getServerList', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

describe('createImage', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

describe('getImageStatus', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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
