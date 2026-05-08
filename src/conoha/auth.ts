export async function getToken(env: Env): Promise<string> {
  const res = await fetch(`${env.CONOHA_IDENTITY_ENDPOINT}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth: {
        passwordCredentials: {
          username: env.CONOHA_USERNAME,
          password: env.CONOHA_PASSWORD,
        },
        tenantId: env.CONOHA_TENANT_ID,
      },
    }),
  })
  if (!res.ok) throw new Error(`ConoHa auth failed: ${res.status}`)
  const data = await res.json<{ access: { token: { id: string } } }>()
  return data.access.token.id
}
