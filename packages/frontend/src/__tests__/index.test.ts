import { describe, expect, it, vi } from "vitest";
import { init } from "../index";
import type { FrontendSDK } from "../types";
import HexViewMode from "../views/HexViewMode.vue";

describe("init", () => {
  it("should register Hex view mode for all SDK components", () => {
    const httpHistoryMock = vi.fn();
    const replayMock = vi.fn();
    const searchMock = vi.fn();
    const sitemapMock = vi.fn();

    const sdk: FrontendSDK = {
      httpHistory: { addRequestViewMode: httpHistoryMock },
      replay: { addRequestViewMode: replayMock },
      search: { addRequestViewMode: searchMock },
      sitemap: { addRequestViewMode: sitemapMock },
    } as unknown as FrontendSDK;

    init(sdk);

    const mocks = [httpHistoryMock, replayMock, searchMock, sitemapMock];

    mocks.forEach((mock) => {
      expect(mock).toHaveBeenCalledTimes(1);
      const options = mock.mock.calls[0][0];

      expect(options.label).toBe("Hex");
      expect(options.view.component).toBe(HexViewMode);

      // Test condition
      expect(options.condition({ raw: "data" })).toBe(true);
      expect(options.condition({ raw: "" })).toBe(false);
      expect(options.condition({})).toBe(false);
      expect(options.condition(null)).toBe(false);
    });
  });
});
