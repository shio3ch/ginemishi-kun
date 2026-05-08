import { listServers } from "./conoha/server";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log("[cron] Running scheduled task");

    try {
      const servers = await listServers(env);
      console.log(`[cron] Found ${servers.length} servers`);
      // TODO: 定期的なサーバー監視ロジックをここに追加する
    } catch (err) {
      console.error("[cron] Failed to fetch servers:", err);
    }
  },
};
