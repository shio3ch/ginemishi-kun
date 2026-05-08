import { getToken } from '../conoha/auth'
import { createServer, getServerStatus } from '../conoha/server'
import { notifyFollowup } from '../discord/notify'
import type { VpsJob, VpsState } from '../queue/types'

export type StartResult = { requeue: true; nextState: VpsState; serverId?: string } | { requeue: false }

export async function processStart(env: Env, job: VpsJob): Promise<StartResult> {
  const token = await getToken(env)

  const serverId = job.serverId ?? await createServer(env, token)
  const status = await getServerStatus(env, token, serverId)

  if (status === 'ACTIVE') {
    await notifyFollowup(env, job, `✅ VPS が起動しました（ID: \`${serverId}\`）\nゲームサーバーに接続できます。`)
    return { requeue: false }
  }

  return { requeue: true, nextState: 'starting' }
}
