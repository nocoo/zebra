import { describe, it, expect, vi, afterEach } from "vitest";

describe("version", () => {
  const origEnv = process.env.NEXT_PUBLIC_APP_VERSION;

  afterEach(() => {
    vi.resetModules();
    if (origEnv !== undefined) {
      process.env.NEXT_PUBLIC_APP_VERSION = origEnv;
    } else {
      delete process.env.NEXT_PUBLIC_APP_VERSION;
    }
  });

  it("should export APP_VERSION from env when set", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.2.3";
    const { APP_VERSION } = await import("@/lib/version");
    expect(APP_VERSION).toBe("1.2.3");
  });

  it("should fallback to 0.3.0 when env is not set", async () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    const { APP_VERSION } = await import("@/lib/version");
    expect(APP_VERSION).toBe("0.3.0");
  });
});
