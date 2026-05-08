import { describe, it, expect, vi } from "vitest";
import consumer from "../src/consumer";

vi.mock("../src/statemachine/start", () => ({
  runStartFlow: vi.fn().mockResolvedValue("起動しました"),
}));

vi.mock("../src/statemachine/stop", () => ({
  runStopFlow: vi.fn().mockResolvedValue("停止しました"),
}));

describe("Queue Consumer", () => {
  it("start ジョブを正常に処理する", async () => {
    const env = {} as unknown as Env;

    const message = {
      body: { type: "start" as const, serverId: "server-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };

    const batch = {
      messages: [message],
    } as unknown as MessageBatch<import("../src/queue/types").VpsJob>;

    await consumer.queue(batch, env);
    expect(message.ack).toHaveBeenCalled();
  });

  it("stop ジョブを正常に処理する", async () => {
    const env = {} as unknown as Env;

    const message = {
      body: { type: "stop" as const, serverId: "server-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };

    const batch = {
      messages: [message],
    } as unknown as MessageBatch<import("../src/queue/types").VpsJob>;

    await consumer.queue(batch, env);
    expect(message.ack).toHaveBeenCalled();
  });
});
