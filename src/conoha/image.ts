function imageUrl(env: Env, path: string): string {
  return `${env.CONOHA_IMAGE_ENDPOINT}${path}`
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': token }
}

export async function createImage(
  env: Env,
  token: string,
  serverId: string
): Promise<string> {
  const res = await fetch(imageUrl(env, '/v2/images'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      server_id: serverId,
      name: `vps-snapshot-${new Date().toISOString()}`,
    }),
  })
  if (!res.ok) throw new Error(`createImage failed: ${res.status} ${await res.text()}`)
  const data = await res.json<{ image: { id: string } }>()
  return data.image.id
}

export async function getImageStatus(
  env: Env,
  token: string,
  imageId: string
): Promise<string> {
  const res = await fetch(imageUrl(env, `/v2/images/${imageId}`), {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`getImageStatus failed: ${res.status} ${await res.text()}`)
  const data = await res.json<{ image: { id: string; status: string } }>()
  return data.image.status
}
