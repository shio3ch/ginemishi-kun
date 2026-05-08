import type { VpsJob } from '../queue/types'

const DISCORD_API = 'https://discord.com/api/v10'

export async function notifyFollowup(
  env: Env,
  job: Pick<VpsJob, 'interactionToken'>,
  content: string
): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${job.interactionToken}/messages/@original`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Discord followup failed: ${res.status} ${await res.text()}`)
}

export async function notifyChannel(env: Env, content: string): Promise<void> {
  const url = `${DISCORD_API}/channels/${env.DISCORD_NOTIFY_CHANNEL_ID}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Discord channel notify failed: ${res.status} ${await res.text()}`)
}
