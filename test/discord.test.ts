import { describe, it, expect, vi } from 'vitest'
import { verifyEd25519 } from '../src/discord/verify'
import { notifyFollowup, notifyChannel } from '../src/discord/notify'
import type { VpsJob } from '../src/queue/types'

describe('verifyEd25519', () => {
  it('有効な署名を受け入れる', async () => {
    // テスト用の Ed25519 鍵ペアを生成
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )
    const pubKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    const pubKeyHex = [...new Uint8Array(pubKeyBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const timestamp = '1234567890'
    const body = '{"type":1}'
    const message = new TextEncoder().encode(timestamp + body)
    const sigBuffer = await crypto.subtle.sign('Ed25519', keyPair.privateKey, message)
    const sigHex = [...new Uint8Array(sigBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const result = await verifyEd25519(sigHex, timestamp, body, pubKeyHex)
    expect(result).toBe(true)
  })

  it('無効な署名を拒否する', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )
    const pubKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    const pubKeyHex = [...new Uint8Array(pubKeyBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const result = await verifyEd25519(
      'a'.repeat(128),   // 無効な署名（64バイト hex）
      '1234567890',
      '{"type":1}',
      pubKeyHex
    )
    expect(result).toBe(false)
  })
})

const mockJob: VpsJob = {
  action: 'start',
  state: 'starting',
  interactionToken: 'test-token',
  channelId: 'test-channel',
  enqueuedAt: new Date().toISOString(),
}

const mockEnv = {
  DISCORD_APPLICATION_ID: 'app-123',
  DISCORD_BOT_TOKEN: 'bot-token',
} as unknown as Env

describe('notifyFollowup', () => {
  it('Discord Followup API を呼び出す', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    )
    await notifyFollowup(mockEnv, mockJob, '✅ 起動しました')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/webhooks/app-123/test-token/messages/@original'),
      expect.objectContaining({ method: 'PATCH' })
    )
    fetchSpy.mockRestore()
  })
})

describe('notifyChannel', () => {
  it('Discord Channel Webhook API を呼び出す', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    )
    const envWithChannel = { ...mockEnv, DISCORD_NOTIFY_CHANNEL_ID: 'ch-456' } as unknown as Env
    await notifyChannel(envWithChannel, '⚠️ 起動しっぱなし警告')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/channels/ch-456/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bot bot-token',
        }),
      })
    )
    fetchSpy.mockRestore()
  })
})
