import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processQueue } from '../src/consumer'
import type { VpsJob } from '../src/queue/types'

vi.mock('../src/statemachine/stop', () => ({
  processStop: vi.fn().mockResolvedValue({ requeue: false }),
}))
vi.mock('../src/statemachine/start', () => ({
  processStart: vi.fn().mockResolvedValue({ requeue: false }),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
  notifyChannel: vi.fn().mockResolvedValue(undefined),
}))

import { processStop } from '../src/statemachine/stop'
import { processStart } from '../src/statemachine/start'
import { notifyFollowup } from '../src/discord/notify'

function makeJob(overrides: Partial<VpsJob> = {}): VpsJob {
  return {
    action: 'stop',
    state: 'stopping',
    serverId: 'srv-test',
    interactionToken: 'tok-test',
    channelId: 'ch-test',
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeMockMessage(job: VpsJob) {
  return {
    body: job,
    ack: vi.fn(),
    retry: vi.fn(),
  }
}

const mockEnv = {
  VPS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
} as unknown as Env

/**
 * processQueue — Queue から受け取ったジョブを処理し、ステートマシンへ委譲する Consumer
 * テスト観点:
 *   - action に応じた正しいステートマシン関数が呼ばれること
 *   - タイムアウト（10分超）したジョブは即通知して終了すること
 *   - requeue=true のとき 30 秒遅延で再エンキューされること
 *   - 再エンキュー時に serverId / imageId が次ジョブに引き継がれること
 *   - 処理後は必ず ack() が呼ばれること
 */
describe('processQueue', () => {
  beforeEach(() => { vi.clearAllMocks() })

  /** action: 'stop' のジョブは processStop に委譲されること */
  it('stop ジョブは processStop を呼ぶ', async () => {
    const msg = makeMockMessage(makeJob({ action: 'stop', state: 'stopping' }))
    await processQueue([msg], mockEnv)
    expect(processStop).toHaveBeenCalledWith(mockEnv, msg.body)
    expect(msg.ack).toHaveBeenCalled()
  })

  /** action: 'start' のジョブは processStart に委譲されること */
  it('start ジョブは processStart を呼ぶ', async () => {
    const msg = makeMockMessage(makeJob({ action: 'start', state: 'starting' }))
    await processQueue([msg], mockEnv)
    expect(processStart).toHaveBeenCalledWith(mockEnv, msg.body)
    expect(msg.ack).toHaveBeenCalled()
  })

  /** タイムアウト: エンキューから 10 分以上経過したジョブはスキップして Discord に警告すること */
  it('タイムアウト済みジョブはエラー通知してスキップする', async () => {
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const msg = makeMockMessage(makeJob({ enqueuedAt: old }))
    await processQueue([msg], mockEnv)
    expect(notifyFollowup).toHaveBeenCalledWith(
      mockEnv,
      expect.anything(),
      expect.stringContaining('タイムアウト')
    )
    expect(processStop).not.toHaveBeenCalled()
    expect(msg.ack).toHaveBeenCalled()
  })

  /** 再エンキュー: requeue=true のとき nextState・imageId を引き継いで 30 秒後に再送すること */
  it('requeue=true のとき VPS_QUEUE.send を delaySeconds=30 で呼ぶ', async () => {
    vi.mocked(processStop).mockResolvedValue({ requeue: true, nextState: 'imaging', imageId: 'img-001' })
    const job = makeJob({ action: 'stop', state: 'stopping' })
    const msg = makeMockMessage(job)
    await processQueue([msg], mockEnv)
    expect((mockEnv.VPS_QUEUE as any).send).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'imaging', imageId: 'img-001' }),
      { delaySeconds: 30 }
    )
    expect(msg.ack).toHaveBeenCalled()
  })

  /** 再エンキュー: start の requeue=true では serverId が次ジョブに引き継がれること（新規作成時のIDを維持するため） */
  it('start requeue=true のとき serverId を引き継ぐ', async () => {
    vi.mocked(processStart).mockResolvedValue({ requeue: true, nextState: 'starting', serverId: 'new-srv-id' })
    const job = makeJob({ action: 'start', state: 'starting', serverId: undefined })
    const msg = makeMockMessage(job)
    await processQueue([msg], mockEnv)
    expect((mockEnv.VPS_QUEUE as any).send).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'starting', serverId: 'new-srv-id' }),
      { delaySeconds: 30 }
    )
  })
})
