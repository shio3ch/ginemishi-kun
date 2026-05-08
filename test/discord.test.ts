import { describe, it, expect, vi } from "vitest";
import { verifyDiscordSignature } from "../src/discord/verify";
import { sendFollowupMessage, editOriginalMessage } from "../src/discord/notify";

describe("Discord 署名検証", () => {
  it("有効な署名は true を返す", async () => {
    vi.spyOn(globalThis.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(globalThis.crypto.subtle, "verify").mockResolvedValue(true);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: {
        "x-signature-ed25519": "a".repeat(128),
        "x-signature-timestamp": "1234567890",
      },
      body: "{}",
    });

    const result = await verifyDiscordSignature(req, "a".repeat(64));
    expect(result).toBe(true);
  });

  it("署名ヘッダーが無い場合は false を返す", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "{}",
    });

    const result = await verifyDiscordSignature(req, "a".repeat(64));
    expect(result).toBe(false);
  });
});

describe("Discord Notify", () => {
  it("Followup メッセージを送信できる", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    await expect(
      sendFollowupMessage("app-id", "interaction-token", "テスト", "bot-token"),
    ).resolves.not.toThrow();
  });

  it("送信失敗時にエラーを投げる", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(
      sendFollowupMessage("app-id", "interaction-token", "テスト", "bot-token"),
    ).rejects.toThrow("Failed to send followup message");
  });
});
