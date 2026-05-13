import { getToken } from '../conoha/auth'
import { getServerStatus, getServerList, stopServer, deleteServer } from '../conoha/server'
import { createImage, getImageStatus } from '../conoha/image'
import { notifyFollowup } from '../discord/notify'
import type { VpsJob, VpsState } from '../queue/types'

export type StopResult = { requeue: true; nextState: VpsState; serverId?: string; imageId?: string } | { requeue: false }

export async function processStop(env: Env, job: VpsJob): Promise<StopResult> {
  const token = await getToken(env)

  switch (job.state) {
    case 'stopping': {
      let serverId = job.serverId
      if (!serverId) {
        const servers = await getServerList(env, token)
        const target = servers.find(s => s.status === 'ACTIVE' || s.status === 'SHUTOFF')
        if (!target) {
          await notifyFollowup(env, job, '⚠️ 停止対象のサーバーが見つかりません')
          return { requeue: false }
        }
        serverId = target.id
      }
      const status = await getServerStatus(env, token, serverId)
      if (status === 'SHUTOFF') return { requeue: true, nextState: 'imaging', serverId }
      await stopServer(env, token, serverId)
      return { requeue: true, nextState: 'stopping', serverId }
    }

    case 'imaging': {
      const imageId = job.imageId ?? await createImage(env, token, job.serverId!)
      const status = await getImageStatus(env, token, imageId)
      if (status === 'active') return { requeue: true, nextState: 'deleting', imageId }
      return { requeue: true, nextState: 'imaging', imageId }
    }

    case 'deleting': {
      await deleteServer(env, token, job.serverId!)
      await notifyFollowup(env, job, '✅ VPS を停止・保存・削除しました')
      return { requeue: false }
    }

    default:
      return { requeue: false }
  }
}
