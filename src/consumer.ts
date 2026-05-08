import { editOriginalMessage } from "./discord/notify";
import { runStartFlow } from "./statemachine/start";
import { runStopFlow } from "./statemachine/stop";
import type { VpsJob } from "./queue/types";

// Discord Application ID は wrangler.toml の vars または secret に追加予定
const DISCORD_APPLICATION_ID = "";

export default {
  async queue(batch: MessageBatch<VpsJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body;
      try {
        let result: string;

        if (job.type === "start") {
          result = await runStartFlow(env, job.serverId);
        } else {
          result = await runStopFlow(env, job.serverId);
        }

        console.log(`[queue] Job completed: ${result}`);
        message.ack();
      } catch (err) {
        console.error(`[queue] Job failed:`, err);
        message.retry();
      }
    }
  },
};
