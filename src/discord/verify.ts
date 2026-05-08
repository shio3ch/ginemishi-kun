import type { Context } from 'hono'

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function verifyEd25519(
  signature: string,
  timestamp: string,
  body: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const pubKey = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKeyHex),
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    const message = new TextEncoder().encode(timestamp + body)
    return await crypto.subtle.verify('Ed25519', pubKey, hexToBytes(signature), message)
  } catch {
    return false
  }
}

export async function verifyDiscordSignature(
  c: Context<{ Bindings: Env }>
): Promise<boolean> {
  const signature = c.req.header('X-Signature-Ed25519') ?? ''
  const timestamp  = c.req.header('X-Signature-Timestamp') ?? ''
  const body = await c.req.text()
  return verifyEd25519(signature, timestamp, body, c.env.DISCORD_PUBLIC_KEY)
}
