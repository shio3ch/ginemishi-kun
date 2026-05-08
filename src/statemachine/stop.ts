import { getToken } from '../conoha/auth'
import { getServerStatus, stopServer, deleteServer } from '../conoha/server'
import { createImage, getImageStatus } from '../conoha/image'
import { notifyFollowup } from '../discord/notify'
import type { VpsJob, VpsState } from '../queue/types'

type StopResult = { requeue: true; nextState: VpsState } | { requeue: false }

export async function processStop(env: Env, job: VpsJob): Promise<StopResult> {
  const token = await getToken(env)

  switch (job.state) {
    case 'stopping': {
      await stopServer(env, token, job.serverId!)
      const status = await getServerStatus(env, token, job.serverId!)
      if (status === 'SHUTOFF') return { requeue: true, nextState: 'imaging' }
      return { requeue: true, nextState: 'stopping' }
    }

    case 'imaging': {
      const imageId = job.imageId ?? await createImage(env, token, job.serverId!)
      const status = await getImageStatus(env, token, imageId)
      if (status === 'active') return { requeue: true, nextState: 'deleting' }
      return { requeue: true, nextState: 'imaging' }
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
