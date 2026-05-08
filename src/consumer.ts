import { processStop } from './statemachine/stop'
import { processStart } from './statemachine/start'
import { notifyFollowup } from './discord/notify'
import type { VpsJob } from './queue/types'

type Message = { body: VpsJob; ack(): void; retry(): void }

export async function processQueue(
  messages: Message[],
  env: Env
): Promise<void> {
  for (const msg of messages) {
    const job = msg.body
    const elapsed = Date.now() - new Date(job.enqueuedAt).getTime()

    if (elapsed > 10 * 60 * 1000) {
      await notifyFollowup(env, job, '⚠️ タイムアウト：手動確認してください')
      msg.ack()
      continue
    }

    let result: { requeue: boolean; nextState?: VpsJob['state']; serverId?: string; imageId?: string }

    if (job.action === 'stop') {
      result = await processStop(env, job)
    } else if (job.action === 'start') {
      result = await processStart(env, job)
    } else {
      msg.ack()
      continue
    }

    if (result.requeue && result.nextState) {
      await env.VPS_QUEUE.send(
        {
          ...job,
          state: result.nextState,
          ...('serverId' in result ? { serverId: result.serverId } : {}),
          ...('imageId' in result ? { imageId: result.imageId } : {}),
        },
        { delaySeconds: 30 }
      )
    }

    msg.ack()
  }
}
