import { Hono } from "hono";
import { verifyDiscordSignature } from "./discord/verify";
import { runStartFlow } from "./statemachine/start";
import { runStopFlow } from "./statemachine/stop";

const app = new Hono<{ Bindings: Env }>();

// Discord Interaction エンドポイント
app.post("/interactions", async (c) => {
  // 署名検証
  const isValid = await verifyDiscordSignature(
    c.req.raw.clone(),
    c.env.DISCORD_PUBLIC_KEY,
  );
  if (!isValid) {
    return c.text("Unauthorized", 401);
  }

  const body = await c.req.json<{ type: number; data?: { name: string; options?: { name: string; value: string }[] }; token?: string }>();

  // PING (type: 1)
  if (body.type === 1) {
    return c.json({ type: 1 });
  }

  // APPLICATION_COMMAND (type: 2)
  if (body.type === 2) {
    const commandName = body.data?.name;

    if (commandName === "start" || commandName === "stop") {
      const serverId = body.data?.options?.find((o) => o.name === "server_id")?.value;
      if (!serverId) {
        return c.json({ type: 4, data: { content: "server_id が指定されていません。" } });
      }

      // Queue にジョブを積んで即座に Deferred 応答を返す
      await c.env.VPS_QUEUE.send({ type: commandName, serverId });
      return c.json({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      });
    }

    return c.json({ type: 4, data: { content: "不明なコマンドです。" } });
  }

  return c.text("Bad Request", 400);
});

export default app;
