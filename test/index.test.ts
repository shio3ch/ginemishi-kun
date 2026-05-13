import { describe, it, expect, vi } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import handler from '../src/index'

vi.mock('../src/discord/verify', () => ({
  verifyDiscordSignature: vi.fn().mockResolvedValue(true),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/consumer', () => ({
  processQueue: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/cron', () => ({
  handleScheduled: vi.fn().mockResolvedValue(undefined),
}))

function makeDiscordRequest(body: object): Request {
  return new Request('http://localhost/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': 'fake',
      'X-Signature-Timestamp': '0',
    },
    body: JSON.stringify(body),
  })
}

/**
 * POST /interactions — Discord Interaction エンドポイントの統合テスト
 * テスト観点:
 *   - PING (type:1) に対して即座に PONG (type:1) を返すこと（Discord の疎通確認）
 *   - スラッシュコマンド (type:2) に対して Deferred Response (type:5) を返すこと
 *   - 署名検証失敗時は 401 を返し、それ以上の処理をしないこと
 *
 * verify / consumer / cron はモック済み（ユニット境界での統合テスト）
 */
describe('POST /interactions', () => {
  /** PING: Discord がエンドポイントの生存確認に送る type:1 は即時 PONG で応答すること */
  it('PING (type:1) に対して PONG (type:1) を返す', async () => {
    const req = makeDiscordRequest({ type: 1 })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const json = await res.json<{ type: number }>()
    expect(json.type).toBe(1)
  })

  /** /start コマンド: VPS 起動ジョブをエンキューし、3 秒制約内に type:5 で即応すること */
  it('/start コマンドで type:5 を返す', async () => {
    const req = makeDiscordRequest({
      type: 2,
      data: { name: 'start' },
      token: 'tok-test',
      channel_id: 'ch-test',
    })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const json = await res.json<{ type: number }>()
    expect(json.type).toBe(5)
  })

  /** /stop コマンド: VPS 停止ジョブをエンキューし、3 秒制約内に type:5 で即応すること */
  it('/stop コマンドで type:5 を返す', async () => {
    const req = makeDiscordRequest({
      type: 2,
      data: { name: 'stop' },
      token: 'tok-test',
      channel_id: 'ch-test',
    })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    const json = await res.json<{ type: number }>()
    expect(json.type).toBe(5)
  })

  /** セキュリティ: 署名検証失敗時は 401 を返し、コマンド処理には進まないこと */
  it('署名検証失敗時は 401 を返す', async () => {
    const { verifyDiscordSignature } = await import('../src/discord/verify')
    vi.mocked(verifyDiscordSignature).mockResolvedValueOnce(false)
    const req = makeDiscordRequest({ type: 1 })
    const ctx = createExecutionContext()
    const res = await handler.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })
})
