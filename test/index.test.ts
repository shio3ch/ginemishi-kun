import { describe, it, expect, vi } from "vitest";
import app from "../src/index";

describe("Interaction Handler", () => {
  it("PING に対して PONG を返す", async () => {
    const env = {
      DISCORD_PUBLIC_KEY: "a".repeat(64),
    } as unknown as Env;

    // 署名検証をモックする
    vi.spyOn(globalThis.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(globalThis.crypto.subtle, "verify").mockResolvedValue(true);

    const req = new Request("http://localhost/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature-ed25519": "a".repeat(128),
        "x-signature-timestamp": "1234567890",
      },
      body: JSON.stringify({ type: 1 }),
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const json = await res.json<{ type: number }>();
    expect(json.type).toBe(1);
  });

  it("署名が無効な場合は 401 を返す", async () => {
    const env = {
      DISCORD_PUBLIC_KEY: "a".repeat(64),
    } as unknown as Env;

    vi.spyOn(globalThis.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(globalThis.crypto.subtle, "verify").mockResolvedValue(false);

    const req = new Request("http://localhost/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature-ed25519": "invalid",
        "x-signature-timestamp": "1234567890",
      },
      body: JSON.stringify({ type: 1 }),
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });
});
