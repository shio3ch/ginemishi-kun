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
  getServerList: vi.fn().mockResolvedValue([{ id: 'srv-found', status: 'ACTIVE', created: new Date().toISOString() }]),
}))
vi.mock('../src/conoha/image', () => ({
  createImage: vi.fn().mockResolvedValue('img-new'),
  getImageStatus: vi.fn(),
}))
vi.mock('../src/discord/notify', () => ({
  notifyFollowup: vi.fn().mockResolvedValue(undefined),
}))

import { getServerStatus, createServer, getServerList } from '../src/conoha/server'
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

/**
 * processStop - stopping ステート
 * VPS がシャットダウン完了するまで polling するステート。
 * テスト観点:
 *   - SHUTOFF でない場合はステートを維持して再エンキューすること
 *   - SHUTOFF になった場合は imaging ステートへ遷移すること
 *   - 毎回ステータスを確認してから stopServer を呼ぶこと（冪等性）
 *   - serverId が未設定の場合はサーバー一覧を検索して対象を特定すること（初回エンキュー時）
 */
describe('processStop - stopping ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  /** ACTIVE のまま: まだシャットダウン中なので stopping を維持して再エンキュー */
  it('SHUTOFF でない場合は serverId 付きで { requeue: true, nextState: "stopping" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('ACTIVE')
    const result = await processStop(mockEnv, makeJob('stopping'))
    expect(result).toEqual({ requeue: true, nextState: 'stopping', serverId: 'srv-test' })
  })

  /** SHUTOFF 確認: シャットダウン完了を検知したら次の imaging ステートへ遷移 */
  it('SHUTOFF の場合は serverId 付きで { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('SHUTOFF')
    const result = await processStop(mockEnv, makeJob('stopping'))
    expect(result).toEqual({ requeue: true, nextState: 'imaging', serverId: 'srv-test' })
  })

  /** serverId なし（初回エンキュー）: getServerList で ACTIVE サーバーを検索して serverId を取得する */
  it('serverId がない場合はサーバー一覧から対象を検索して stopping を継続する', async () => {
    vi.mocked(getServerStatus).mockResolvedValue('ACTIVE')
    const result = await processStop(mockEnv, makeJob('stopping', { serverId: undefined }))
    expect(getServerList).toHaveBeenCalled()
    expect(result).toEqual({ requeue: true, nextState: 'stopping', serverId: 'srv-found' })
  })

  /** serverId なし・サーバーなし: 停止対象が存在しない場合は Discord に通知して終了する */
  it('serverId がなくサーバーも見つからない場合は { requeue: false } を返す', async () => {
    vi.mocked(getServerList).mockResolvedValueOnce([])
    const result = await processStop(mockEnv, makeJob('stopping', { serverId: undefined }))
    expect(result).toEqual({ requeue: false })
  })
})

/**
 * processStop - imaging ステート
 * サーバーのスナップショットイメージを作成し、保存完了を待つステート。
 * テスト観点:
 *   - imageId がある場合は createImage を呼ばず既存 ID を使い続けること（重複作成防止）
 *   - imageId がない場合は createImage を呼んで取得した ID を返すこと
 *   - イメージが active になったら deleting ステートへ遷移すること
 */
describe('processStop - imaging ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  /** saving 中 (imageId あり): 既存 imageId を引き継ぎ imaging を継続 */
  it('イメージが active でない場合は imageId を含めて { requeue: true, nextState: "imaging" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('saving')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'imaging', imageId: 'img-001' })
  })

  /** saving 中 (imageId なし): 初回は createImage を呼び、取得した ID を返す */
  it('imageId がない場合は createImage を呼んで imageId を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('saving')
    const result = await processStop(mockEnv, makeJob('imaging'))
    expect(createImage).toHaveBeenCalled()
    expect(result).toEqual({ requeue: true, nextState: 'imaging', imageId: 'img-new' })
  })

  /** active 確認: イメージ保存完了で deleting ステートへ遷移 */
  it('イメージが active の場合は { requeue: true, nextState: "deleting" } を返す', async () => {
    vi.mocked(getImageStatus).mockResolvedValue('active')
    const result = await processStop(mockEnv, makeJob('imaging', { imageId: 'img-001' }))
    expect(result).toEqual({ requeue: true, nextState: 'deleting', imageId: 'img-001' })
  })
})

/**
 * processStop - deleting ステート
 * イメージ保存完了後にサーバー本体を削除し、ユーザーに完了通知するステート。
 * テスト観点:
 *   - deleteServer の後に Discord 完了通知が送られること
 *   - { requeue: false } を返して処理を終了すること
 */
describe('processStop - deleting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  /** 正常系: サーバー削除 → Discord 通知 → 処理完了 */
  it('削除完了後に Discord 通知を送り { requeue: false } を返す', async () => {
    const result = await processStop(mockEnv, makeJob('deleting'))
    expect(notifyFollowup).toHaveBeenCalledWith(mockEnv, expect.anything(), '✅ VPS を停止・保存・削除しました')
    expect(result).toEqual({ requeue: false })
  })
})

/**
 * processStart - starting ステート
 * サーバーを起動し ACTIVE になるまで polling するステート。
 * テスト観点:
 *   - serverId がある場合はそのサーバーのステータスを確認すること
 *   - serverId がない場合は createServer で新規作成してから polling を開始すること
 *   - ACTIVE になったら Discord に完了通知を送り処理を終了すること
 */
describe('processStart - starting ステート', () => {
  beforeEach(() => { vi.clearAllMocks() })

  /** BUILD 中: まだ起動中なので starting を維持し serverId を引き継いで再エンキュー */
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
    expect(result).toEqual({ requeue: true, nextState: 'starting', serverId: 'srv-existing' })
  })

  /** ACTIVE 確認: 起動完了を検知したら Discord に通知して処理終了 */
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

  /** 新規作成: serverId がない場合は createServer を呼び、返却された ID を次ジョブに渡すこと */
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
    expect(result).toEqual({ requeue: true, nextState: 'starting', serverId: 'new-srv-id' })
  })
})
