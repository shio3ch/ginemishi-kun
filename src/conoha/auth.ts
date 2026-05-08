export interface ConoHaToken {
  id: string;
  expires: string;
}

/**
 * Keystoneトークンを取得する
 */
export async function getToken(env: Env): Promise<ConoHaToken> {
  const res = await fetch(`${env.CONOHA_IDENTITY_ENDPOINT}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: {
        passwordCredentials: {
          username: env.CONOHA_USERNAME,
          password: env.CONOHA_PASSWORD,
        },
        tenantId: env.CONOHA_TENANT_ID,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`ConoHa auth failed: ${res.status}`);
  }

  const data = (await res.json()) as { access: { token: { id: string; expires: string } } };
  return data.access.token;
}
