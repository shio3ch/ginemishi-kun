import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processStop } from '../src/statemachine/stop'
import { processStart } from '../src/statemachine/start'
import type { VpsJob } from '../src/queue/types'

// ConoHa モジュールをモック
vi.mock('../src/conoha/auth', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token'),
}))
vi.mock('../src/conoha/server', () => ({
  stopServer: vi.fn().mockResolvedValue(undefined),
  getServerStatus: vi.fn(),
  deleteServer: vi.fn().mockResolvedValue(undefined),
  createServer: vi.fn().mockResolvedValue('new-srv-id'),
}))
vi.mock('../src/conoha/image', () => ({
  createImage: vi.fn().mockResolvedValue('img-new'),
  getImageStatus: vi.fn(),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
}))

import { getServerStatus, createServer } from '../src/conoha/server'
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

  it('イメージが active でない場合は imageId を含めて { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('saving')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'imaging', imageId: 'img-001' })
  })

  it('imageId がない場合は createImage を呼んで imageId を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('saving')
    const result = await processStop(mockEnv, makeJob('imaging'))
    expect(createImage).toHaveBeenCalled()
    expect(result).toEqual({ requeue: true, nextState: 'imaging', imageId: 'img-new' })
  })

  it('イメージが active の場合は { requeue: true, nextState: "deleting" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('active')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'deleting', imageId: 'img-001' })
  })
})

describe('processStop - deleting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('削除完了後に Discord 通知を送り { requeue: false } を返す', async () => {
    const result = await processStop(mockEnv, makeJob('deleting'))
    expect(notifyFollowup).toHaveBeenCalledWith(mockEnv, expect.anything(), '✅ VPS を停止・保存・削除しました')
    expect(result).toEqual({ requeue: false })
  })
})

describe('processStart - starting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ACTIVE でない場合は { requeue: true, nextState: "starting" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('BUILD')
    const job: VpsJob = {
      action: 'start',
      state: 'starting',
      serverId: 'srv-existing',
      interactionToken: 'tok-test',
      channelId: 'ch-test',
      enqueuedAt: new Date().toISOString(),
    }
    const result = await processStart(mockEnv, job)
    expect(result).toEqual({ requeue: true, nextState: 'starting' })
  })

  it('ACTIVE の場合は Discord 通知を送り { requeue: false } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('ACTIVE')
    const job: VpsJob = {
      action: 'start',
      state: 'starting',
      serverId: 'srv-existing',
      interactionToken: 'tok-test',
      channelId: 'ch-test',
      enqueuedAt: new Date().toISOString(),
    }
    const result = await processStart(mockEnv, job)
    expect(notifyFollowup).toHaveBeenCalledWith(
      mockEnv,
      expect.anything(),
      expect.stringContaining('✅')
    )
    expect(result).toEqual({ requeue: false })
  })

  it('serverId がない場合はサーバーを新規作成する', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('BUILD')
    const job: VpsJob = {
      action: 'start',
      state: 'starting',
      interactionToken: 'tok-test',
      channelId: 'ch-test',
      enqueuedAt: new Date().toISOString(),
    }
    const result = await processStart(mockEnv, job)
    expect(createServer).toHaveBeenCalled()
    expect(result).toEqual({ requeue: true, nextState: 'starting' })
  })
})
