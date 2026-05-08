import { describe, it, expect } from 'vitest'
import { verifyEd25519 } from '../src/discord/verify'

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
