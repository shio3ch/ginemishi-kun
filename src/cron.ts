import { getToken } from './conoha/auth'
import { getServerList } from './conoha/server'
import { notifyChannel } from './discord/notify'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

export async function handleScheduled(env: Env): Promise<void> {
  const token = await getToken(env)
  const servers = await getServerList(env, token)

  for (const server of servers) {
    if (server.status !== 'ACTIVE') continue

    const uptime = Date.now() - new Date(server.created).getTime()
    if (uptime >= TWELVE_HOURS_MS) {
      await notifyChannel(
        env,
        `⚠️ **VPS が12時間以上起動しています**（ID: \`${server.id}\`）\n` +
          '30分後に自動停止は行いません。不要であれば `/stop` で停止してください。'
      )
    }
  }
}
