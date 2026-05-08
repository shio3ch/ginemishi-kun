import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getToken } from '../src/conoha/auth'

const mockEnv = {
  CONOHA_USERNAME: 'user',
  CONOHA_PASSWORD: 'pass',
  CONOHA_TENANT_ID: 'tenant-123',
  CONOHA_IDENTITY_ENDPOINT: 'https://identity.example.com/v2.0',
} as unknown as Env

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
