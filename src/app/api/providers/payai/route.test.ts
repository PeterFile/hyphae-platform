import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/providers/payai", () => {
  afterEach(() => {
    delete process.env.PAYAI_RPC_URL;
    delete process.env.PAYAI_PROGRAM_ID;
  });

  it("returns 500 when PAYAI_RPC_URL is missing", async () => {
    delete process.env.PAYAI_RPC_URL;
    process.env.PAYAI_PROGRAM_ID = "Program11111111111111111111111111111111111";

    const response = await GET(
      new Request("https://unit.test/api/providers/payai")
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: {
        provider: "payai",
        code: "missing_upstream_config",
        message: "PAYAI_RPC_URL is not configured",
      },
    });
  });
});
