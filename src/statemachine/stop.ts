import { getServer, stopServer } from "../conoha/server";

/**
 * VPS 停止フローを処理する
 * サーバーが ACTIVE の場合に停止する
 */
export async function runStopFlow(env: Env, serverId: string): Promise<string> {
  const server = await getServer(env, serverId);

  if (server.status === "SHUTOFF") {
    return `サーバー "${server.name}" はすでに停止しています。`;
  }

  if (server.status !== "ACTIVE") {
    return `サーバー "${server.name}" は停止できない状態です (status: ${server.status})。`;
  }

  await stopServer(env, serverId);
  return `サーバー "${server.name}" の停止を開始しました。`;
}
