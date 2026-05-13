function computeUrl(env: Env, path: string): string {
  return `${env.CONOHA_COMPUTE_ENDPOINT}${path}`
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': token }
}

export async function getServerStatus(
  env: Env,
  token: string,
  serverId: string
): Promise<string> {
  const res = await fetch(computeUrl(env, `/servers/${serverId}`), {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`getServerStatus failed: ${res.status} ${await res.text()}`)
  const data = await res.json<{ server: { id: string; status: string } }>()
  return data.server.status
}

export async function createServer(env: Env, token: string): Promise<string> {
  const res = await fetch(computeUrl(env, '/servers'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      server: {
        imageRef: env.GAME_SERVER_IMAGE_ID,
        flavorRef: env.GAME_SERVER_FLAVOR_ID,
      },
    }),
  })
  if (!res.ok) throw new Error(`createServer failed: ${res.status} ${await res.text()}`)
  const data = await res.json<{ server: { id: string } }>()
  return data.server.id
}

export async function stopServer(
  env: Env,
  token: string,
  serverId: string
): Promise<void> {
  const res = await fetch(computeUrl(env, `/servers/${serverId}/action`), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ 'os-stop': null }),
  })
  if (!res.ok) throw new Error(`stopServer failed: ${res.status} ${await res.text()}`)
}

export async function deleteServer(
  env: Env,
  token: string,
  serverId: string
): Promise<void> {
  const res = await fetch(computeUrl(env, `/servers/${serverId}`), {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 404) throw new Error(`deleteServer failed: ${res.status} ${await res.text()}`)
}

export async function getServerList(
  env: Env,
  token: string
): Promise<Array<{ id: string; status: string; created: string }>> {
  const res = await fetch(computeUrl(env, '/servers/detail'), {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`getServerList failed: ${res.status} ${await res.text()}`)
  const data = await res.json<{ servers: Array<{ id: string; status: string; created: string }> }>()
  return data.servers
}
