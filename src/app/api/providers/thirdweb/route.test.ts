import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/providers/thirdweb", () => {
  afterEach(() => {
    delete process.env.THIRDWEB_SECRET_KEY;
  });

  it("returns 500 when THIRDWEB_SECRET_KEY is missing", async () => {
    delete process.env.THIRDWEB_SECRET_KEY;

    const response = await GET(
      new Request("https://unit.test/api/providers/thirdweb")
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: {
        provider: "thirdweb",
        code: "missing_upstream_config",
        message: "THIRDWEB_SECRET_KEY is not configured",
      },
    });
  });
});
