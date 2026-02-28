import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

describe("root page", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("redirects to /store", async () => {
    (globalThis as { React?: unknown }).React = {
      createElement: () => null,
      Fragment: Symbol.for("react.fragment"),
    };

    const { default: HomePage } = await import("./page");
    HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/store");
  });
});
