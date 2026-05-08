import { Hono } from 'hono'
import { verifyDiscordSignature } from './discord/verify'
import { processQueue } from './consumer'
import { handleScheduled } from './cron'
import type { VpsJob } from './queue/types'

const app = new Hono<{ Bindings: Env }>()

app.post('/interactions', async (c) => {
  const verified = await verifyDiscordSignature(c)
  if (!verified) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    type: number
    data?: { name: string }
    token?: string
    channel_id?: string
  }>()

  if (body.type === 1) return c.json({ type: 1 })

  if (body.type === 2 && body.data && body.token && body.channel_id) {
    const action = body.data.name as VpsJob['action']
    c.executionCtx.waitUntil(
      c.env.VPS_QUEUE.send({
        action,
        state: action === 'stop' ? 'stopping' : 'starting',
        interactionToken: body.token,
        channelId: body.channel_id,
        enqueuedAt: new Date().toISOString(),
      })
    )
  }

  return c.json({ type: 5 })
})

export default {
  fetch: app.fetch.bind(app),

  async queue(batch: MessageBatch<VpsJob>, env: Env): Promise<void> {
    await processQueue(
      batch.messages.map((m) => ({
        body: m.body,
        ack: () => m.ack(),
        retry: () => m.retry(),
      })),
      env
    )
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env)
  },
}
