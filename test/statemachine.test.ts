import { describe, it, expect, vi, beforeEach } from "vitest";
import { runStartFlow } from "../src/statemachine/start";
import { runStopFlow } from "../src/statemachine/stop";

vi.mock("../src/conoha/server", () => ({
  getServer: vi.fn(),
  startServer: vi.fn(),
  stopServer: vi.fn(),
}));

import { getServer, startServer, stopServer } from "../src/conoha/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("State Machine - start フロー", () => {
  it("SHUTOFF のサーバーを起動する", async () => {
    vi.mocked(getServer).mockResolvedValue({ id: "s1", name: "test", status: "SHUTOFF" });
    vi.mocked(startServer).mockResolvedValue(undefined);

    const result = await runStartFlow({} as Env, "s1");
    expect(result).toContain("起動を開始");
    expect(startServer).toHaveBeenCalledWith({}, "s1");
  });

  it("ACTIVE のサーバーはすでに起動中と返す", async () => {
    vi.mocked(getServer).mockResolvedValue({ id: "s1", name: "test", status: "ACTIVE" });

    const result = await runStartFlow({} as Env, "s1");
    expect(result).toContain("すでに起動");
    expect(startServer).not.toHaveBeenCalled();
  });
});

describe("State Machine - stop フロー", () => {
  it("ACTIVE のサーバーを停止する", async () => {
    vi.mocked(getServer).mockResolvedValue({ id: "s1", name: "test", status: "ACTIVE" });
    vi.mocked(stopServer).mockResolvedValue(undefined);

    const result = await runStopFlow({} as Env, "s1");
    expect(result).toContain("停止を開始");
    expect(stopServer).toHaveBeenCalledWith({}, "s1");
  });

  it("SHUTOFF のサーバーはすでに停止中と返す", async () => {
    vi.mocked(getServer).mockResolvedValue({ id: "s1", name: "test", status: "SHUTOFF" });

    const result = await runStopFlow({} as Env, "s1");
    expect(result).toContain("すでに停止");
    expect(stopServer).not.toHaveBeenCalled();
  });
});
