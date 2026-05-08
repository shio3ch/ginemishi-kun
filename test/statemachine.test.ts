import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processStop } from '../src/statemachine/stop'
import type { VpsJob } from '../src/queue/types'

// ConoHa モジュールをモック
vi.mock('../src/conoha/auth', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token'),
}))
vi.mock('../src/conoha/server', () => ({
  stopServer: vi.fn().mockResolvedValue(undefined),
  getServerStatus: vi.fn(),
  deleteServer: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/conoha/image', () => ({
  createImage: vi.fn().mockResolvedValue('img-new'),
  getImageStatus: vi.fn(),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
}))

import { getServerStatus } from '../src/conoha/server'
import { getImageStatus, createImage } from '../src/conoha/image'
import { notifyFollowup } from '../src/discord/notify'

const mockEnv = {} as Env

function makeJob(state: VpsJob['state'], overrides: Partial<VpsJob> = {}): VpsJob {
  return {
    action: 'stop',
    state,
    serverId: 'srv-test',
    imageId: undefined,
    interactionToken: 'tok-test',
    channelId: 'ch-test',
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('processStop - stopping ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('SHUTOFF でない場合は { requeue: true, nextState: "stopping" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('ACTIVE')
    const result = await processStop(mockEnv, makeJob('stopping'))
    expect(result).toEqual({ requeue: true, nextState: 'stopping' })
  })

  it('SHUTOFF の場合は { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('SHUTOFF')
    const result = await processStop(mockEnv, makeJob('stopping'))
    expect(result).toEqual({ requeue: true, nextState: 'imaging' })
  })
})

describe('processStop - imaging ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('イメージが active でない場合は { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('saving')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'imaging' })
  })

  it('イメージが active の場合は { requeue: true, nextState: "deleting" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('active')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'deleting' })
  })
})

describe('processStop - deleting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('削除完了後に Discord 通知を送り { requeue: false } を返す', async () => {
    const result = await processStop(mockEnv, makeJob('deleting'))
    expect(notifyFollowup).toHaveBeenCalled()
    expect(result).toEqual({ requeue: false })
  })
})
