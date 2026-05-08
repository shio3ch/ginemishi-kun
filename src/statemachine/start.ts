import { getServer, startServer } from "../conoha/server";

/**
 * VPS 起動フローを処理する
 * サーバーが SHUTOFF の場合に起動する
 */
export async function runStartFlow(env: Env, serverId: string): Promise<string> {
  const server = await getServer(env, serverId);

  if (server.status === "ACTIVE") {
    return `サーバー "${server.name}" はすでに起動しています。`;
  }

  if (server.status !== "SHUTOFF") {
    return `サーバー "${server.name}" は起動できない状態です (status: ${server.status})。`;
  }

  await startServer(env, serverId);
  return `サーバー "${server.name}" の起動を開始しました。`;
}
