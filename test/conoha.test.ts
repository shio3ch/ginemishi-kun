import { describe, it, expect, vi } from "vitest";
import { getToken } from "../src/conoha/auth";
import { listServers, startServer, stopServer, getServer } from "../src/conoha/server";

const mockEnv = {
  CONOHA_IDENTITY_ENDPOINT: "https://identity.example.com",
  CONOHA_COMPUTE_ENDPOINT: "https://compute.example.com",
  CONOHA_IMAGE_ENDPOINT: "https://image.example.com",
  CONOHA_TENANT_ID: "tenant-1",
  CONOHA_USERNAME: "user",
  CONOHA_PASSWORD: "pass",
} as unknown as Env;

describe("ConoHa Auth", () => {
  it("トークンを取得できる", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access: { token: { id: "token-abc", expires: "2099-01-01T00:00:00Z" } },
      }),
    } as Response);

    const token = await getToken(mockEnv);
    expect(token.id).toBe("token-abc");
  });

  it("認証失敗時にエラーを投げる", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(getToken(mockEnv)).rejects.toThrow("ConoHa auth failed");
  });
});

describe("ConoHa Server", () => {
  it("サーバー一覧を取得できる", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access: { token: { id: "tok", expires: "" } } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ servers: [{ id: "s1", name: "server1", status: "ACTIVE" }] }),
      } as Response);

    const servers = await listServers(mockEnv);
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe("s1");
  });
});
