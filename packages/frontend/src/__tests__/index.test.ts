import { describe, expect, it, vi } from "vitest";
import { init } from "../index";
import type { FrontendSDK } from "../types";
import HexViewMode from "../views/HexViewMode.vue";

describe("init", () => {
  it("should register Hex view mode for all SDK components (request and response)", () => {
    const httpHistoryReqMock = vi.fn();
    const httpHistoryResMock = vi.fn();
    const replayReqMock = vi.fn();
    const replayResMock = vi.fn();
    const searchReqMock = vi.fn();
    const searchResMock = vi.fn();
    const sitemapReqMock = vi.fn();
    const sitemapResMock = vi.fn();

    const sdk: FrontendSDK = {
      httpHistory: { addRequestViewMode: httpHistoryReqMock, addResponseViewMode: httpHistoryResMock },
      replay: { addRequestViewMode: replayReqMock, addResponseViewMode: replayResMock },
      search: { addRequestViewMode: searchReqMock, addResponseViewMode: searchResMock },
      sitemap: { addRequestViewMode: sitemapReqMock, addResponseViewMode: sitemapResMock },
    } as unknown as FrontendSDK;

    init(sdk);

    const allMocks = [
      httpHistoryReqMock, httpHistoryResMock,
      replayReqMock, replayResMock,
      searchReqMock, searchResMock,
      sitemapReqMock, sitemapResMock,
    ];

    allMocks.forEach((mock) => {
      expect(mock).toHaveBeenCalledTimes(1);
      const options = mock.mock.calls[0]?.[0];

      expect(options).toBeDefined();
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
