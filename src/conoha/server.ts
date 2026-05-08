import { getToken } from "./auth";

export interface ServerDetail {
  id: string;
  name: string;
  status: string;
}

/**
 * サーバー一覧を取得する
 */
export async function listServers(env: Env): Promise<ServerDetail[]> {
  const token = await getToken(env);
  const res = await fetch(`${env.CONOHA_COMPUTE_ENDPOINT}/servers/detail`, {
    headers: { "X-Auth-Token": token.id },
  });

  if (!res.ok) {
    throw new Error(`Failed to list servers: ${res.status}`);
  }

  const data = (await res.json()) as { servers: ServerDetail[] };
  return data.servers;
}

/**
 * サーバーを起動する
 */
export async function startServer(env: Env, serverId: string): Promise<void> {
  const token = await getToken(env);
  const res = await fetch(
    `${env.CONOHA_COMPUTE_ENDPOINT}/servers/${serverId}/action`,
    {
      method: "POST",
      headers: {
        "X-Auth-Token": token.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ "os-start": null }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to start server: ${res.status}`);
  }
}

/**
 * サーバーを停止する
 */
export async function stopServer(env: Env, serverId: string): Promise<void> {
  const token = await getToken(env);
  const res = await fetch(
    `${env.CONOHA_COMPUTE_ENDPOINT}/servers/${serverId}/action`,
    {
      method: "POST",
      headers: {
        "X-Auth-Token": token.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ "os-stop": null }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to stop server: ${res.status}`);
  }
}

/**
 * サーバーの詳細を取得する
 */
export async function getServer(env: Env, serverId: string): Promise<ServerDetail> {
  const token = await getToken(env);
  const res = await fetch(
    `${env.CONOHA_COMPUTE_ENDPOINT}/servers/${serverId}`,
    { headers: { "X-Auth-Token": token.id } },
  );

  if (!res.ok) {
    throw new Error(`Failed to get server: ${res.status}`);
  }

  const data = (await res.json()) as { server: ServerDetail };
  return data.server;
}
