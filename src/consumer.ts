import { processStop } from './statemachine/stop'
import { processStart } from './statemachine/start'
import { notifyFollowup } from './discord/notify'
import type { VpsJob, VpsState } from './queue/types'

type Message = { body: VpsJob; ack(): void; retry(): void }
type RequeueResult = { requeue: true; nextState: VpsState; serverId?: string; imageId?: string }
type DoneResult = { requeue: false }
type ProcessResult = RequeueResult | DoneResult

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

    let result: ProcessResult

    try {
      if (job.action === 'stop') {
        result = await processStop(env, job)
      } else if (job.action === 'start') {
        result = await processStart(env, job)
      } else {
        msg.ack()
        continue
      }
    } catch (err) {
      await notifyFollowup(env, job, `❌ エラーが発生しました: ${err instanceof Error ? err.message : String(err)}`)
      msg.ack()
      continue
    }

    if (result.requeue) {
      await env.VPS_QUEUE.send(
        {
          ...job,
          state: result.nextState,
          ...(result.serverId != null ? { serverId: result.serverId } : {}),
          ...(result.imageId != null ? { imageId: result.imageId } : {}),
        },
        { delaySeconds: 30 }
      )
    }

    msg.ack()
  }
}
