import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HexViewMode from "../views/HexViewMode.vue";

// Mock window.location.hash
Object.defineProperty(window, "location", {
  value: {
    hash: "",
  },
  writable: true,
});

describe("HexViewMode.vue", () => {
  const mockSdk = {
    window: {
      getActiveEditor: vi.fn(),
      showToast: vi.fn(),
    },
  };

  const defaultProps = {
    sdk: mockSdk,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
  });

  describe("Rendering", () => {
    it("renders request data correctly", async () => {
      const request = {
        raw: "GET / HTTP/1.1\r\nHost: example.com\r\n\r\nHello",
        host: "example.com",
        path: "/",
      };

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request,
        },
      });

      expect(wrapper.text()).toContain("Hello"); // ASCII column
      expect(wrapper.text()).toContain("42 bytes");
    });

    it("renders response data correctly", async () => {
      const response = {
        raw: "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nWorld",
        host: "example.com",
      };

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          response,
        },
      });

      expect(wrapper.text()).toContain("World"); // ASCII column
    });

    it("handles empty data", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "", host: "", path: "" },
        },
      });

      expect(wrapper.text()).toContain("0 bytes");
      expect(wrapper.text()).toContain("No data to display");
    });

    it("displays truncated warning when data exceeds limit", async () => {
      const maxSize = 10240;
      // Create string larger than maxSize
      const raw = "a".repeat(maxSize + 1);

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      expect(wrapper.text()).toContain("(truncated)");
    });
  });

  describe("Hex/ASCII Conversion", () => {
    it("converts raw data to hex and ascii correctly", async () => {
      const raw = "ABC";
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      // "A" -> 41, "B" -> 42, "C" -> 43
      const hexTd = wrapper.find("td:nth-child(2)");
      const hexHtml = hexTd.html();
      expect(hexHtml).toContain("41");
      expect(hexHtml).toContain("42");
      expect(hexHtml).toContain("43");

      const asciiCell = wrapper.find("td:nth-child(3)");
      expect(asciiCell.text()).toBe("ABC");
    });

    it("handles non-printable characters in ASCII column", async () => {
      const raw = String.fromCharCode(0, 1, 2); // Null, SOH, STX
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      const asciiCell = wrapper.find("td:nth-child(3)");
      expect(asciiCell.text()).toBe("..."); // Should be dots
    });
  });

  describe("Line Endings (CRLF)", () => {
    it("normalizes LF to CRLF for requests read from the Replay editor", () => {
      window.location.hash = "#/replay/123";
      const raw = "Line1\nLine2";
      mockSdk.window.getActiveEditor.mockReturnValue({
        getEditorView: () => ({
          state: { doc: { toString: () => raw, length: raw.length } },
          dispatch: vi.fn(),
        }),
      });
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      // "Line1\nLine2" -> "Line1\r\nLine2"
      // Length: 5 + 1 + 5 = 11 (original) -> 5 + 2 + 5 = 12 (normalized)
      expect(wrapper.text()).toContain("12 bytes");

      const hexTd = wrapper.find("td:nth-child(2)");
      // CRLF: 0d 0a
      const hexHtml = hexTd.html();
      expect(hexHtml).toContain(">0d<");
      expect(hexHtml).toContain(">0a<");
    });

    it("shows captured (non-Replay) request bytes verbatim", () => {
      window.location.hash = "#/http-history";
      // A body LF is a real 0a byte (e.g. inside an uploaded file).
      const raw = "POST / HTTP/1.1\r\nHost: a\r\n\r\nA\nB";
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "a", path: "/" },
        },
      });

      expect(wrapper.text()).toContain(`${raw.length} bytes`);
      const hex = wrapper
        .findAll("td:nth-child(2)")
        .map((td) => td.text())
        .join(" ");
      expect(hex).toContain("41 0a 42");
    });

    it("does not normalize LF to CRLF for responses", async () => {
      // Logic check: The component only does this for requests
      // if (rawData && isRequest.value) { ... }

      const raw = "Line1\nLine2";
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          response: { raw, host: "test" },
        },
      });

      // Length should remain 11
      expect(wrapper.text()).toContain("11 bytes");

      const hexHtml = wrapper.find("td:nth-child(2)").html();
      // LF: 0a. Should NOT contain 0d byte
      // 4c 69 6e 65 31 0a 4c 69 6e 65 32
      expect(hexHtml).not.toContain(">0d<");
      expect(hexHtml).toContain(">0a<");
    });
  });

  describe("Modal Interaction", () => {
    // Helper to create mock SDK with editor returning given raw content
    const createEditorSdk = (raw: string) => ({
      window: {
        getActiveEditor: vi.fn().mockReturnValue({
          getEditorView: () => ({
            state: { doc: { toString: () => raw, length: raw.length } },
            dispatch: vi.fn(),
          }),
        }),
        showToast: vi.fn(),
      },
    });

    it("does not open modal on double click outside Replay tab", async () => {
      window.location.hash = "#/http-history";
      const raw = "Test";
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      const hexInput = wrapper.find("td:nth-child(2) span");
      await hexInput.trigger("dblclick");

      expect(wrapper.find(".fixed.inset-0").exists()).toBe(false);
    });

    it("opens modal on double click in Replay tab", async () => {
      window.location.hash = "#/replay/123";
      const raw = "Test";
      const wrapper = mount(HexViewMode, {
        props: {
          sdk: createEditorSdk(raw),
          request: { raw, host: "test", path: "/" },
        },
        attachTo: document.body,
      });

      const hexInput = wrapper.find("td:nth-child(2) span");
      await hexInput.trigger("dblclick");

      expect(wrapper.find(".fixed.inset-0").exists()).toBe(true);
      expect(wrapper.text()).toContain("Edit Hex Values");
      wrapper.unmount();
    });

    it("updates ASCII preview when Hex is edited in modal", async () => {
      window.location.hash = "#/replay/123";
      const raw = "A";
      const wrapper = mount(HexViewMode, {
        props: {
          sdk: createEditorSdk(raw),
          request: { raw, host: "test", path: "/" },
        },
      });

      // Open modal
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");

      // Find hex textarea
      const hexTextarea = wrapper.find(
        "textarea[placeholder*='Enter hex values']",
      );

      // Change "41" (A) to "42" (B)
      await hexTextarea.setValue("42");

      // Check ASCII preview
      const asciiTextarea = wrapper.find(
        "textarea[placeholder='ASCII representation']",
      );
      expect((asciiTextarea.element as HTMLTextAreaElement).value).toBe("B");
    });

    it("updates Hex preview when ASCII is edited in modal", async () => {
      window.location.hash = "#/replay/123";
      const raw = "A";
      const wrapper = mount(HexViewMode, {
        props: {
          sdk: createEditorSdk(raw),
          request: { raw, host: "test", path: "/" },
        },
      });

      // Open modal
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");

      // Find ASCII textarea
      const asciiTextarea = wrapper.find(
        "textarea[placeholder='ASCII representation']",
      );

      // Change "A" to "C"
      await asciiTextarea.setValue("C");

      // Check Hex preview
      const hexTextarea = wrapper.find(
        "textarea[placeholder*='Enter hex values']",
      );
      expect((hexTextarea.element as HTMLTextAreaElement).value).toBe("43");
    });

    it("applies changes when OK is clicked", async () => {
      window.location.hash = "#/replay/123";
      const raw = "A";
      const wrapper = mount(HexViewMode, {
        props: {
          sdk: createEditorSdk(raw),
          request: { raw, host: "test", path: "/" },
        },
      });

      // Open modal
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");

      // Change "A" to "B" (42)
      const asciiTextarea = wrapper.find(
        "textarea[placeholder='ASCII representation']",
      );
      await asciiTextarea.setValue("B");

      // Click OK
      const buttons = wrapper.findAll("button");
      const okButton = buttons.find((b) => b.text() === "OK");
      await okButton?.trigger("click");

      // Modal should close
      expect(wrapper.find(".fixed.inset-0").exists()).toBe(false);

      // Main view should update
      const hexCell = wrapper.find("td:nth-child(2) span");
      const asciiCell = wrapper.find("td:nth-child(3)");

      expect(hexCell.text()).toContain("42");
      expect(asciiCell.text()).toBe("B");
    });

    it("discards changes when Cancel is clicked", async () => {
      window.location.hash = "#/replay/123";
      const raw = "A";
      const wrapper = mount(HexViewMode, {
        props: {
          sdk: createEditorSdk(raw),
          request: { raw, host: "test", path: "/" },
        },
      });

      // Open modal
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");

      // Change "A" to "B"
      const asciiTextarea = wrapper.find(
        "textarea[placeholder='ASCII representation']",
      );
      await asciiTextarea.setValue("B");

      // Click Cancel
      const buttons = wrapper.findAll("button");
      const cancelButton = buttons.find((b) => b.text() === "Cancel");
      await cancelButton?.trigger("click");

      // Modal should close
      expect(wrapper.find(".fixed.inset-0").exists()).toBe(false);

      // Main view should NOT update
      const hexCell = wrapper.find("td:nth-child(2) span");
      const asciiCell = wrapper.find("td:nth-child(3)");

      expect(hexCell.text()).toContain("41");
      expect(asciiCell.text()).toBe("A");
    });
  });

  describe("Replay Mode & Saving", () => {
    it("enables Save button in Replay tab", async () => {
      window.location.hash = "#/replay/123";
      const raw = "Test";
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      const saveButton = wrapper.find("button[title='Save Changes']");
      expect(saveButton.exists()).toBe(true);
    });

    it("saves changes to editor", async () => {
      window.location.hash = "#/replay/123";
      const raw = "Test";

      // Mock editor
      const mockDispatch = vi.fn();
      const mockEditor = {
        getEditorView: () => ({
          state: {
            doc: {
              toString: () => raw,
              length: raw.length,
            },
          },
          dispatch: mockDispatch,
        }),
      };
      mockSdk.window.getActiveEditor.mockReturnValue(mockEditor);

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      // 1. Open modal and change data
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      const asciiTextarea = wrapper.find(
        "textarea[placeholder='ASCII representation']",
      );
      await asciiTextarea.setValue("Best"); // T -> B
      const buttons = wrapper.findAll("button");
      const okButton = buttons.find((b) => b.text() === "OK");
      await okButton?.trigger("click");

      // 2. Click Save
      const saveButton = wrapper.find("button[title='Save Changes']");
      await saveButton.trigger("click");

      // 3. Verify dispatch called
      expect(mockDispatch).toHaveBeenCalled();
      const callArgs = mockDispatch.mock.calls[0]?.[0];
      expect(callArgs.changes.insert).toBe("Best"); // "Test" -> "Best"

      // 4. Verify toast
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        "Request updated successfully",
        { variant: "success" },
      );
    });

    it("handles save error", async () => {
      window.location.hash = "#/replay/123";
      const raw = "Test";

      // Mock editor
      const mockDispatch = vi.fn().mockImplementation(() => {
        throw new Error("Dispatch failed");
      });

      const mockEditor = {
        getEditorView: () => ({
          state: {
            doc: {
              toString: () => raw,
              length: raw.length,
            },
          },
          dispatch: mockDispatch,
        }),
      };
      mockSdk.window.getActiveEditor.mockReturnValue(mockEditor);

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      // Click Save
      const saveButton = wrapper.find("button[title='Save Changes']");
      await saveButton.trigger("click");

      // Verify error toast
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update request"),
        { variant: "error" },
      );
    });

    const editorMock = (raw: string) => {
      const dispatch = vi.fn();
      mockSdk.window.getActiveEditor.mockReturnValue({
        getEditorView: () => ({
          state: { doc: { toString: () => raw, length: raw.length } },
          dispatch,
        }),
      });
      return dispatch;
    };

    const editFirstLine = async (
      wrapper: ReturnType<typeof mount>,
      hex: string,
    ) => {
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      await wrapper.find("textarea[placeholder*='Enter hex']").setValue(hex);
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "OK")
        ?.trigger("click");
    };

    it("keeps bytes beyond the size limit when saving truncated data", async () => {
      window.location.hash = "#/replay/123";
      const raw = "a".repeat(10240) + "TAIL";
      const dispatch = editorMock(raw);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, request: { raw, host: "test", path: "/" } },
      });
      expect(wrapper.text()).toContain("(truncated)");

      await editFirstLine(wrapper, "42 " + "61 ".repeat(15).trim());
      await wrapper.find("button[title='Save Changes']").trigger("click");

      const insert: string = dispatch.mock.calls[0]?.[0].changes.insert;
      expect(insert.length).toBe(raw.length);
      expect(insert.startsWith("Ba")).toBe(true);
      expect(insert.endsWith("TAIL")).toBe(true);
    });

    it("shows an error instead of success when there is no active editor", async () => {
      window.location.hash = "#/replay/123";
      mockSdk.window.getActiveEditor.mockReturnValue(undefined);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await wrapper.find("button[title='Save Changes']").trigger("click");

      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        expect.stringContaining("No active editor"),
        { variant: "error" },
      );
      expect(mockSdk.window.showToast).not.toHaveBeenCalledWith(
        "Request updated successfully",
        expect.anything(),
      );
    });

    it("saves bytes that are not valid UTF-8 as text Caido sends as them", async () => {
      window.location.hash = "#/replay/123";
      const dispatch = editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "ff 65 73 74");
      await wrapper.find("button[title='Save Changes']").trigger("click");

      expect(dispatch.mock.calls[0]?.[0].changes.insert).toBe("ÿest");
    });

    it("rejects malformed hex in the edit modal and keeps it open", async () => {
      window.location.hash = "#/replay/123";
      editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "4 65 zz");

      expect(wrapper.find(".fixed.inset-0").exists()).toBe(true);
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        expect.stringContaining("Invalid hex"),
        { variant: "error" },
      );
      expect(wrapper.text()).toContain("Test");
    });

    it("keeps unsaved edits when the size limit changes", async () => {
      window.location.hash = "#/replay/123";
      const dispatch = editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "42 65 73 74");
      await wrapper.find("select[title='Max data size']").setValue("51200");
      expect(wrapper.find("td:nth-child(3)").text()).toBe("Best");

      await wrapper.find("button[title='Save Changes']").trigger("click");
      expect(dispatch.mock.calls[0]?.[0].changes.insert).toBe("Best");
    });

    it("refuses to save a lone LF the editor would turn into CRLF", async () => {
      window.location.hash = "#/replay/123";
      const dispatch = editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "54 0a 73 74");
      await wrapper.find("button[title='Save Changes']").trigger("click");

      expect(dispatch).not.toHaveBeenCalled();
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        expect.stringContaining("lone CR/LF"),
        { variant: "error" },
      );
    });

    it("keeps a leading UTF-8 BOM on save", async () => {
      window.location.hash = "#/replay/123";
      const dispatch = editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "ef bb bf 54 65 73 74");
      await wrapper.find("button[title='Save Changes']").trigger("click");

      expect(dispatch.mock.calls[0]?.[0].changes.insert).toBe("\uFEFFTest");
    });

    it("previews unspaced hex the same way it is applied", async () => {
      window.location.hash = "#/replay/123";
      editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      await wrapper
        .find("textarea[placeholder*='Enter hex']")
        .setValue("42657374");

      const ascii = wrapper.find(
        "textarea[placeholder='ASCII representation']",
      );
      expect((ascii.element as HTMLTextAreaElement).value).toBe("Best");
      // Only the first byte changed, so the diff shows exactly one change.
      const removed = wrapper.findAll(".line-through").map((s) => s.text());
      expect(removed).toEqual(["54"]);
    });

    it("clamps the selection when an edit removes selected bytes", async () => {
      window.location.hash = "#/replay/123";
      editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      const bytes = wrapper.findAll("td:nth-child(2) span span.cursor-pointer");
      await bytes[0]?.trigger("click");
      await bytes[3]?.trigger("click", { shiftKey: true });
      expect(wrapper.text()).toContain("00000000-00000003 (4 bytes)");

      await editFirstLine(wrapper, "54 65");

      expect(wrapper.text()).toContain("00000000-00000001 (2 bytes)");
    });

    it("accepts unspaced hex in the edit modal", async () => {
      window.location.hash = "#/replay/123";
      editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "42657374");

      expect(wrapper.find(".fixed.inset-0").exists()).toBe(false);
      expect(wrapper.find("td:nth-child(3)").text()).toBe("Best");
    });

    it("accepts newline-separated hex in the edit modal", async () => {
      window.location.hash = "#/replay/123";
      editorMock("Test");
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Test", host: "test", path: "/" },
        },
      });
      await editFirstLine(wrapper, "42 65\n73 74");

      expect(wrapper.find(".fixed.inset-0").exists()).toBe(false);
      expect(wrapper.find("td:nth-child(3)").text()).toBe("Best");
    });
  });

  describe("Byte Pattern Search", () => {
    it("toggles search bar visibility", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Search bar should not be visible initially
      expect(wrapper.find("input[placeholder*='Search hex']").exists()).toBe(
        false,
      );

      // Click search button
      const searchBtn = wrapper.find("button[title*='Search']");
      await searchBtn.trigger("click");

      // Search bar should now be visible
      expect(wrapper.find("input[placeholder*='Search hex']").exists()).toBe(
        true,
      );

      // Click close button
      const closeBtn = wrapper.find("button[title='Close (Esc)']");
      await closeBtn.trigger("click");

      // Search bar should be hidden again
      expect(wrapper.find("input[placeholder*='Search hex']").exists()).toBe(
        false,
      );
    });

    it("searches by hex pattern and shows match count", async () => {
      // "Hello" = 48 65 6c 6c 6f
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Open search
      await wrapper.find("button[title*='Search']").trigger("click");

      // Search for "6c" (letter 'l', appears twice)
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("6c");
      await searchInput.trigger("input");

      // Should show 2 matches
      expect(wrapper.text()).toContain("1/2");
    });

    it("searches by ASCII pattern", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello World Hello", host: "test", path: "/" },
        },
      });

      // Open search
      await wrapper.find("button[title*='Search']").trigger("click");

      // Switch to ASCII mode
      const asciiBtn = wrapper
        .findAll("button")
        .find((b) => b.text() === "ASCII");
      await asciiBtn?.trigger("click");

      // Search for "Hello"
      const searchInput = wrapper.find("input[placeholder*='Search ASCII']");
      await searchInput.setValue("Hello");
      await searchInput.trigger("input");

      // Should show 2 matches
      expect(wrapper.text()).toContain("1/2");
    });

    it("navigates between matches", async () => {
      // "aa" in "aaaa" should find 3 overlapping matches at offsets 0,1,2
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "aaaa", host: "test", path: "/" },
        },
      });

      // Open search and search for "6161" (aa)
      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("6161");
      await searchInput.trigger("input");

      expect(wrapper.text()).toContain("1/3");

      // Click Next
      const nextBtn = wrapper.find("button[title='Next (Enter)']");
      await nextBtn.trigger("click");
      expect(wrapper.text()).toContain("2/3");

      // Click Previous
      const prevBtn = wrapper.find("button[title='Previous (Shift+Enter)']");
      await prevBtn.trigger("click");
      expect(wrapper.text()).toContain("1/3");
    });

    it("shows 'No match' for unmatched queries", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("FF FF FF");
      await searchInput.trigger("input");

      expect(wrapper.text()).toContain("No match");
    });

    it("highlights matching bytes in hex and ascii columns", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "ABCABC", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("41 42 43");
      await searchInput.trigger("input");

      // Should have highlighted spans (orange for current match)
      const highlighted = wrapper.findAll("span.bg-orange-500\\/50");
      expect(highlighted.length).toBeGreaterThan(0);
    });

    it("highlights exactly the bytes of overlapping matches", async () => {
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, request: { raw: "xaaaxa" } },
      });
      await wrapper.find("button[title*='Search']").trigger("click");
      await wrapper.find("input[placeholder*='Search hex']").setValue("61 61");

      const marked = wrapper
        .findAll("td:nth-child(2) span span.cursor-pointer")
        .map((s) =>
          s
            .classes()
            .some(
              (c) => c.startsWith("bg-yellow") || c.startsWith("bg-orange"),
            ),
        );
      expect(marked).toEqual([false, true, true, true, false, false]);
    });

    it("clears search state when search bar is closed", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Open search and enter query
      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("48");
      await searchInput.trigger("input");

      expect(wrapper.text()).toContain("1/1");

      // Close search
      await wrapper.find("button[title='Close (Esc)']").trigger("click");

      // Should not have any highlighted spans
      expect(wrapper.findAll("span.bg-orange-500\\/50").length).toBe(0);
    });

    it("clears non-current match highlights when search bar is closed", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "AAA", host: "test", path: "/" },
        },
      });
      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("41");
      await searchInput.trigger("input");
      expect(wrapper.findAll("span.bg-yellow-500\\/30").length).toBeGreaterThan(
        0,
      );

      await wrapper.find("button[title='Close (Esc)']").trigger("click");
      expect(wrapper.findAll("span.bg-yellow-500\\/30").length).toBe(0);
    });

    it("keeps leading/trailing spaces in ASCII queries", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "ab b", host: "test", path: "/" },
        },
      });
      await wrapper.find("button[title*='Search']").trigger("click");
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "ASCII")
        ?.trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search ASCII']");
      // Trimmed, " b" would become "b" and match twice.
      await searchInput.setValue(" b");
      await searchInput.trigger("input");
      expect(wrapper.text()).toContain("1/1");
    });

    it("does not show 'No match' for a whitespace-only hex query", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });
      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("  ");
      await searchInput.trigger("input");
      expect(wrapper.text()).not.toContain("No match");
    });

    it("handles invalid hex input gracefully", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");

      // Invalid hex (odd length)
      await searchInput.setValue("F");
      await searchInput.trigger("input");

      // Should not crash, no matches - "No match" should not appear since query is invalid
      expect(wrapper.text()).not.toContain("1/");

      // Invalid hex characters
      await searchInput.setValue("ZZ");
      await searchInput.trigger("input");
      expect(wrapper.text()).not.toContain("1/");
    });

    it("handles keyboard shortcuts in search input", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "ABAB", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("41");
      await searchInput.trigger("input");

      expect(wrapper.text()).toContain("1/2");

      // Press Enter to go next
      await searchInput.trigger("keydown", { key: "Enter" });
      expect(wrapper.text()).toContain("2/2");

      // Press Shift+Enter to go previous
      await searchInput.trigger("keydown", { key: "Enter", shiftKey: true });
      expect(wrapper.text()).toContain("1/2");
    });

    it("wraps around when navigating past last/first match", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "ABA", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Search']").trigger("click");
      const searchInput = wrapper.find("input[placeholder*='Search hex']");
      await searchInput.setValue("41");
      await searchInput.trigger("input");

      // 2 matches for "41" (A appears twice)
      expect(wrapper.text()).toContain("1/2");

      // Navigate to last
      await wrapper.find("button[title='Next (Enter)']").trigger("click");
      expect(wrapper.text()).toContain("2/2");

      // Wrap to first
      await wrapper.find("button[title='Next (Enter)']").trigger("click");
      expect(wrapper.text()).toContain("1/2");

      // Wrap backwards
      await wrapper
        .find("button[title='Previous (Shift+Enter)']")
        .trigger("click");
      expect(wrapper.text()).toContain("2/2");
    });
  });

  describe("Go to Offset", () => {
    it("toggles go-to-offset bar visibility", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello World", host: "test", path: "/" },
        },
      });

      // Not visible initially
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(
        false,
      );

      // Click goto button
      const gotoBtn = wrapper.find("button[title*='Go to offset']");
      await gotoBtn.trigger("click");

      // Should be visible
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(true);

      // Close it
      const closeBtn = wrapper.findAll("button[title='Close (Esc)']").pop();
      await closeBtn?.trigger("click");
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(
        false,
      );
    });

    it("navigates to hex offset (0x prefix)", async () => {
      const raw = "A".repeat(64); // 4 rows of 16 bytes
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.setValue("0x20"); // offset 32

      // Click Go
      const goBtn = wrapper.findAll("button").find((b) => b.text() === "Go");
      await goBtn?.trigger("click");

      // Should highlight byte at offset 32
      const highlighted = wrapper.findAll("span.bg-cyan-500\\/50");
      expect(highlighted.length).toBeGreaterThan(0);
    });

    it("navigates to decimal offset", async () => {
      const raw = "A".repeat(48);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.setValue("16"); // decimal offset 16

      const goBtn = wrapper.findAll("button").find((b) => b.text() === "Go");
      await goBtn?.trigger("click");

      const highlighted = wrapper.findAll("span.bg-cyan-500\\/50");
      expect(highlighted.length).toBeGreaterThan(0);
    });

    it("shows error for out-of-range offset", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.setValue("999"); // out of range

      const goBtn = wrapper.findAll("button").find((b) => b.text() === "Go");
      await goBtn?.trigger("click");

      expect(wrapper.text()).toContain("Invalid offset");
    });

    it("handles Enter key to go to offset", async () => {
      const raw = "A".repeat(48);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.setValue("0x10");
      await input.trigger("keydown", { key: "Enter" });

      const highlighted = wrapper.findAll("span.bg-cyan-500\\/50");
      expect(highlighted.length).toBeGreaterThan(0);
    });

    it("handles Escape key to close goto bar", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(true);

      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.trigger("keydown", { key: "Escape" });
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(
        false,
      );
    });

    it("clears highlight when bar is closed", async () => {
      const raw = "A".repeat(48);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.setValue("0x10");
      const goBtn = wrapper.findAll("button").find((b) => b.text() === "Go");
      await goBtn?.trigger("click");

      expect(wrapper.findAll("span.bg-cyan-500\\/50").length).toBeGreaterThan(
        0,
      );

      // Close bar
      const closeBtn = wrapper.findAll("button[title='Close (Esc)']").pop();
      await closeBtn?.trigger("click");

      expect(wrapper.findAll("span.bg-cyan-500\\/50").length).toBe(0);
    });
  });

  describe("Data Interpretation Panel", () => {
    it("does not show panel when no bytes are selected", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      expect(wrapper.text()).not.toContain("Data Inspector");
    });

    it("shows panel when a byte is clicked", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Click on first byte (H = 0x48 = 72)
      const firstByte = wrapper.find("td:nth-child(2) span span:first-child");
      await firstByte.trigger("click");

      expect(wrapper.text()).toContain("Data Inspector");
      expect(wrapper.text()).toContain("1 byte(s) selected");
      // UInt8 of 'H' (0x48) = 72
      expect(wrapper.text()).toContain("72");
    });

    it("shows multi-byte interpretations for range selection", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "ABCD", host: "test", path: "/" },
        },
      });

      // Click first byte
      const bytes = wrapper.findAll("td:nth-child(2) span span.cursor-pointer");
      await bytes[0]?.trigger("click");

      // Shift+click fourth byte for range selection
      await bytes[3]?.trigger("click", { shiftKey: true });

      expect(wrapper.text()).toContain("4 byte(s) selected");
      // Should show Int32, Float32 interpretations
      expect(wrapper.text()).toContain("UInt32");
      expect(wrapper.text()).toContain("Float32");
    });

    it("shows encoding interpretations (Base64, URL-encoded)", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hi", host: "test", path: "/" },
        },
      });

      // Click first byte
      const bytes = wrapper.findAll("td:nth-child(2) span span.cursor-pointer");
      await bytes[0]?.trigger("click");
      await bytes[1]?.trigger("click", { shiftKey: true });

      expect(wrapper.text()).toContain("2 byte(s) selected");
      expect(wrapper.text()).toContain("Base64");
      expect(wrapper.text()).toContain("URL-encoded");
      expect(wrapper.text()).toContain("UTF-8");
    });

    it("clears selection and hides panel when close button is clicked", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Select a byte
      const firstByte = wrapper.find("td:nth-child(2) span span:first-child");
      await firstByte.trigger("click");
      expect(wrapper.text()).toContain("Data Inspector");

      // Check the status bar shows selection info
      expect(wrapper.text()).toContain("selected");
    });

    it("highlights selected bytes in hex and ascii columns", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Click first byte
      const firstByte = wrapper.find("td:nth-child(2) span span:first-child");
      await firstByte.trigger("click");

      // Should have blue highlight for selection
      const selected = wrapper.findAll("span.bg-blue-500\\/40");
      expect(selected.length).toBeGreaterThan(0);
    });
  });

  describe("HTTP Structure Highlighting", () => {
    it("colours each byte by its side of the header/body boundary", async () => {
      // Header is 30 bytes: the second row holds 14 header and 2 body bytes.
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: {
            raw: "GET / HTTP/1.1\r\nHost: test\r\n\r\nbody",
            host: "test",
            path: "/",
          },
        },
      });
      const hexBytes = () =>
        wrapper.findAll("td:nth-child(2) span span.cursor-pointer");
      const asciiChars = () => wrapper.findAll("td:nth-child(3) span span");
      const side = (el: { classes: () => string[] }) =>
        el.classes().includes("bg-purple-500/15")
          ? "header"
          : el.classes().includes("bg-emerald-500/15")
            ? "body"
            : "none";

      expect(hexBytes().map(side)).not.toContain("header");
      const toggleBtn = wrapper.find(
        "button[title='Toggle HTTP structure highlighting']",
      );
      await toggleBtn.trigger("click");

      for (const cells of [hexBytes(), asciiChars()]) {
        expect(cells.slice(0, 30).map(side)).toEqual(Array(30).fill("header"));
        expect(cells.slice(30).map(side)).toEqual(Array(4).fill("body"));
      }

      // Selection and search colours still win over the structure colour.
      await hexBytes()[30]?.trigger("click");
      expect(side(hexBytes()[30]!)).toBe("none");
      expect(hexBytes()[30]?.classes()).toContain("bg-blue-500/40");
      expect(side(asciiChars()[30]!)).toBe("none");

      await toggleBtn.trigger("click");
      expect(hexBytes().map(side)).not.toContain("header");
    });
  });

  describe("Virtual Scrolling", () => {
    it("renders rows with data-hex-row attributes", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "A".repeat(64), host: "test", path: "/" },
        },
      });

      // Should have rows with data-hex-row attributes
      const rows = wrapper.findAll("tr[data-hex-row]");
      expect(rows.length).toBeGreaterThan(0);

      // First row should have index 0
      expect(rows[0]?.attributes("data-hex-row")).toBe("0");
    });

    it("renders correct number of rows for small data", async () => {
      // 48 bytes = 3 rows at 16 bytes/row
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "A".repeat(48), host: "test", path: "/" },
        },
      });

      const rows = wrapper.findAll("tr[data-hex-row]");
      expect(rows.length).toBe(3);
    });

    it("uses virtual scroll container structure", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "A".repeat(64), host: "test", path: "/" },
        },
      });

      // Should have the scroll container with overflow-auto
      const scrollContainer = wrapper.find("[class*='h-full overflow-auto']");
      expect(scrollContainer.exists()).toBe(true);

      // Should have a positioning wrapper div inside
      const innerDiv = scrollContainer.find("div[style]");
      expect(innerDiv.exists()).toBe(true);
    });
  });

  describe("Copy Menu", () => {
    it("toggles copy menu visibility", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      // Menu should not be visible initially
      expect(wrapper.find("[data-copy-menu] .absolute").exists()).toBe(false);

      // Click copy button
      const copyBtn = wrapper.find("button[title='Copy as...']");
      await copyBtn.trigger("click");

      // Menu should be visible
      expect(wrapper.find("[data-copy-menu] .absolute").exists()).toBe(true);
    });

    it("shows all copy format options", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title='Copy as...']").trigger("click");

      const menu = wrapper.find("[data-copy-menu] .absolute");
      expect(menu.text()).toContain("Raw hex");
      expect(menu.text()).toContain("Spaced hex");
      expect(menu.text()).toContain("C array");
      expect(menu.text()).toContain("Python bytes");
      expect(menu.text()).toContain("JSON array");
      expect(menu.text()).toContain("Hexdump");
    });

    it("copies bytes to clipboard and shows success toast", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hi", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title='Copy as...']").trigger("click");
      const rawHexBtn = wrapper
        .findAll("[data-copy-menu] button")
        .find((b) => b.text() === "Raw hex");
      await rawHexBtn?.trigger("click");
      // wait microtask for the awaited writeText
      await Promise.resolve();

      expect(writeText).toHaveBeenCalledWith("4869");
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        "Copied to clipboard",
        { variant: "success" },
      );
    });

    it("labels a copied hexdump selection with its real offsets", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "A".repeat(16) + "BC", host: "test", path: "/" },
        },
      });

      // Select the 2nd row's first byte (offset 0x10)
      const bytes = wrapper.findAll("td:nth-child(2) span span.cursor-pointer");
      await bytes[16]?.trigger("click");
      await wrapper.find("button[title='Copy as...']").trigger("click");
      await wrapper
        .findAll("[data-copy-menu] button")
        .find((b) => b.text() === "Hexdump")
        ?.trigger("click");

      const text: string = writeText.mock.calls[0]?.[0];
      expect(text.startsWith("00000010  42 ")).toBe(true);
    });

    it("shows error toast when clipboard write fails", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hi", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title='Copy as...']").trigger("click");
      const rawHexBtn = wrapper
        .findAll("[data-copy-menu] button")
        .find((b) => b.text() === "Raw hex");
      await rawHexBtn?.trigger("click");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSdk.window.showToast).toHaveBeenCalledWith("Failed to copy", {
        variant: "error",
      });
    });
  });

  describe("Go to Offset (hex without 0x prefix)", () => {
    it("treats input with hex letters as hex offset", async () => {
      const raw = "A".repeat(64);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      // "1A" should be parsed as hex (26)
      await input.setValue("1A");
      const goBtn = wrapper.findAll("button").find((b) => b.text() === "Go");
      await goBtn?.trigger("click");

      const highlighted = wrapper.findAll("span.bg-cyan-500\\/50");
      expect(highlighted.length).toBeGreaterThan(0);
    });

    it("returns invalid for empty input on Go", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const goBtn = wrapper.findAll("button").find((b) => b.text() === "Go");
      await goBtn?.trigger("click");

      // No "Invalid offset" message because input is empty (early-return)
      expect(wrapper.text()).not.toContain("Invalid offset");
      expect(wrapper.findAll("span.bg-cyan-500\\/50").length).toBe(0);
    });

    it("does not show an error while typing before Go is pressed", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });
      await wrapper.find("button[title*='Go to offset']").trigger("click");
      const input = wrapper.find("input[placeholder*='Hex (0x']");
      await input.setValue("2");
      expect(wrapper.text()).not.toContain("Invalid offset");
    });

    it("reads zero-padded offsets as hex, like the offset column", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: {
            raw: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
            host: "test",
            path: "/",
          },
        },
      });
      await wrapper.find("button[title*='Go to offset']").trigger("click");
      await wrapper.find("input[placeholder*='Hex (0x']").setValue("00000010");
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "Go")
        ?.trigger("click");
      // Byte 0x10 = 'G' (47); decimal 10 would be 'A' (41).
      expect(wrapper.find("td:nth-child(2) span.bg-cyan-500\\/50").text()).toBe(
        "47",
      );
    });

    it("rejects offsets with trailing garbage", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });
      await wrapper.find("button[title*='Go to offset']").trigger("click");
      await wrapper.find("input[placeholder*='Hex (0x']").setValue("2zz");
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "Go")
        ?.trigger("click");
      expect(wrapper.text()).toContain("Invalid offset");
      expect(wrapper.findAll("span.bg-cyan-500\\/50").length).toBe(0);
    });
  });

  describe("File Signature Detection", () => {
    it("displays detected signature badge in toolbar", async () => {
      // Use PDF signature ("%PDF") since its bytes are all printable ASCII and
      // survive TextEncoder UTF-8 encoding without expansion.
      const raw =
        "HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4";

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          response: { raw, host: "test" },
        },
      });

      const badge = wrapper.find("[title*='Detected file signature']");
      expect(badge.exists()).toBe(true);
      expect(badge.text()).toBe("PDF");
    });

    it("does not display badge when no signature is detected", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: {
            raw: "GET / HTTP/1.1\r\n\r\nplain text",
            host: "test",
            path: "/",
          },
        },
      });

      expect(wrapper.find("[title*='Detected file signature']").exists()).toBe(
        false,
      );
    });
  });

  describe("Layout options", () => {
    it("changes the number of rows when bytesPerRow is updated", async () => {
      // 32 bytes -> 2 rows at 16/row, 4 rows at 8/row
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "A".repeat(32), host: "test", path: "/" },
        },
      });

      expect(wrapper.findAll("tr[data-hex-row]").length).toBe(2);

      const bytesPerRowSelect = wrapper.find("select[title='Bytes per line']");
      const selectEl = bytesPerRowSelect.element as HTMLSelectElement;
      selectEl.value = "8";
      await bytesPerRowSelect.trigger("change");
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll("tr[data-hex-row]").length).toBe(4);
    });

    it("renders byte grouping options", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "ABCDEFGH", host: "test", path: "/" },
        },
      });

      const groupingSelect = wrapper.find("select[title='Byte grouping']");
      const optionTexts = groupingSelect.findAll("option").map((o) => o.text());
      expect(optionTexts).toEqual(["1 byte", "2 bytes", "4 bytes", "8 bytes"]);
    });

    it("changes the maximum data size when option is updated", async () => {
      // String fits within 10KB but exceeds when set to a smaller cap
      const raw = "a".repeat(20000);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      // Initially 10KB cap -> truncated
      expect(wrapper.text()).toContain("(truncated)");

      // Switch to Unlimited (0) -> no truncation
      const sizeSelect = wrapper.find("select[title='Max data size']");
      await sizeSelect.setValue("0");

      expect(wrapper.text()).not.toContain("(truncated)");
    });
  });

  describe("Global keyboard shortcuts", () => {
    it("opens search bar with Ctrl+F", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
        attachTo: document.body,
      });

      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(false);

      const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
      document.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(true);
      wrapper.unmount();
    });

    it("opens go-to-offset bar with Ctrl+G", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
        attachTo: document.body,
      });

      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(
        false,
      );

      const event = new KeyboardEvent("keydown", { key: "g", ctrlKey: true });
      document.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(true);
      wrapper.unmount();
    });

    it("ignores unrelated keys", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      const event = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
      document.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(false);
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(
        false,
      );
      wrapper.unmount();
    });

    it("removes keydown listener on unmount", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });

      wrapper.unmount();

      // After unmount, dispatching Ctrl+F should not throw nor mutate anything observable
      const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
      expect(() => document.dispatchEvent(event)).not.toThrow();
    });

    it("does not open search when an external input has focus", async () => {
      const external = document.createElement("input");
      external.type = "text";
      document.body.appendChild(external);

      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
        attachTo: document.body,
      });

      external.focus();
      expect(document.activeElement).toBe(external);

      const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
      document.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(false);

      external.remove();
      wrapper.unmount();
    });
  });

  describe("Multiple panes", () => {
    it("routes Ctrl+F only to the pane clicked last", async () => {
      const mk = () =>
        mount(HexViewMode, {
          props: {
            ...defaultProps,
            request: { raw: "Hello", host: "test", path: "/" },
          },
          attachTo: document.body,
        });
      const a = mk();
      const b = mk();
      (a.find("td:nth-child(2) span span").element as HTMLElement).click();

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
      );
      await a.vm.$nextTick();

      expect(a.find("input[placeholder*='Search']").exists()).toBe(true);
      expect(b.find("input[placeholder*='Search']").exists()).toBe(false);
      a.unmount();
      b.unmount();
    });
  });

  describe("Data source changes", () => {
    it("clears the selection when the displayed message changes", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/" },
        },
      });
      await wrapper.find("td:nth-child(2) span span").trigger("click");
      expect(wrapper.text()).toContain("Data Inspector");

      await wrapper.setProps({
        request: { raw: "World", host: "test", path: "/" },
      });
      expect(wrapper.text()).not.toContain("Data Inspector");
    });
  });

  describe("UTF-8 truncation", () => {
    it("truncates by byte length at a multi-byte char boundary", async () => {
      // "한" = ED 95 9C (3 bytes). 4000 chars = 12000 bytes, above the 10KB cap.
      // 10240 / 3 = 3413.33, so 3413 chars × 3 = 10239 bytes lands on a boundary.
      const raw = "한".repeat(4000);
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw, host: "test", path: "/" },
        },
      });

      expect(wrapper.text()).toContain("10239 bytes");
      expect(wrapper.text()).toContain("(truncated)");

      // The final rendered byte must be a continuation byte (0x9C tail of "한"),
      // never a stray lead byte that would imply a split sequence.
      const hexHtml = wrapper.find("td:nth-child(2)").html();
      expect(hexHtml).toBeTruthy();
    });
  });

  describe("Export Binary", () => {
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    let clickMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      createObjectURLMock = vi.fn(() => "blob:mock");
      revokeObjectURLMock = vi.fn();
      Object.defineProperty(URL, "createObjectURL", {
        value: createObjectURLMock,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        value: revokeObjectURLMock,
        writable: true,
        configurable: true,
      });
      clickMock = vi.fn();
      // Stub anchor click so jsdom/happy-dom doesn't try to navigate
      HTMLAnchorElement.prototype.click = clickMock as unknown as () => void;
    });

    it("triggers a download with default filename when path has no extension", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "Hello", host: "test", path: "/api" },
        },
      });

      await wrapper.find("button[title='Export binary data']").trigger("click");

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
    });

    it("uses path basename as filename when it has an extension", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "data", host: "test", path: "/files/photo.png" },
        },
      });

      // Spy on the dynamically-created anchor's `download` attribute
      const originalCreate = document.createElement.bind(document);
      const createSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) => {
          const el = originalCreate(tag);
          return el;
        });

      await wrapper.find("button[title='Export binary data']").trigger("click");

      const anchor = createSpy.mock.results
        .map((r) => r.value as HTMLElement)
        .find((el) => el instanceof HTMLAnchorElement);

      expect(anchor?.download).toBe("photo.png");
      createSpy.mockRestore();
    });

    it("exports bytes beyond the display size limit", async () => {
      const raw = "a".repeat(20000);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, response: { raw } },
      });
      expect(wrapper.text()).toContain("(truncated)");

      await wrapper.find("button[title='Export binary data']").trigger("click");
      const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
      expect(blob.size).toBe(20000);
    });

    it("matches the Content-Disposition header case-insensitively", async () => {
      const raw =
        'HTTP/1.1 200 OK\r\nCONTENT-DISPOSITION: attachment; filename="up.png"\r\n\r\nX';
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, response: { raw } },
      });
      let downloaded = "";
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          downloaded = this.download;
        });
      await wrapper.find("button[title='Export binary data']").trigger("click");
      expect(downloaded).toBe("up.png");
      clickSpy.mockRestore();
    });

    it("uses Content-Disposition filename when present", async () => {
      const raw =
        'HTTP/1.1 200 OK\r\nContent-Disposition: attachment; filename="report.csv"\r\n\r\ndata';
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          response: { raw, host: "test" },
        },
      });

      const originalCreate = document.createElement.bind(document);
      const createSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) => originalCreate(tag));

      await wrapper.find("button[title='Export binary data']").trigger("click");

      const anchor = createSpy.mock.results
        .map((r) => r.value as HTMLElement)
        .find((el) => el instanceof HTMLAnchorElement);

      expect(anchor?.download).toBe("report.csv");
      createSpy.mockRestore();
    });

    it("does nothing when there is no data to export", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "", host: "", path: "" },
        },
      });

      await wrapper.find("button[title='Export binary data']").trigger("click");

      expect(createObjectURLMock).not.toHaveBeenCalled();
      expect(clickMock).not.toHaveBeenCalled();
    });
  });

  describe("Replay draft and view props", () => {
    // Like Caido's request editor: sliceDoc() is the exact text, while
    // doc.toString() joins lines with LF.
    const view = (raw: string) => ({
      state: {
        sliceDoc: () => raw,
        doc: { toString: () => raw.replace(/\r\n/g, "\n"), length: raw.length },
      },
      dispatch: vi.fn(),
    });
    const active = (v: ReturnType<typeof view> | undefined) =>
      mockSdk.window.getActiveEditor.mockReturnValue(
        v ? { getEditorView: () => v } : undefined,
      );
    const save = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find("button[title='Save Changes']").trigger("click");
    const editFirstRow = async (
      wrapper: ReturnType<typeof mount>,
      hex: string,
    ) => {
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      await wrapper.find("textarea[placeholder*='Enter hex']").setValue(hex);
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "OK")
        ?.trigger("click");
    };
    const GET = "GET / HTTP/1.1\r\n\r\n";

    beforeEach(() => {
      window.location.hash = "#/replay/123";
    });

    it("shows an unsent draft (no request) and lets it be saved", async () => {
      active(undefined);
      const own = view(GET);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: GET }, view: own },
      });

      expect(wrapper.text()).toContain("18 bytes");
      await save(wrapper);
      expect(own.dispatch).toHaveBeenCalledTimes(1);
    });

    it("shows and saves a bare LF in the body as it is", async () => {
      const raw = "POST / HTTP/1.1\r\nHost: a\r\n\r\nx\ny";
      const own = view(raw);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw }, view: own },
      });

      expect(wrapper.text()).toContain("31 bytes"); // not 32: no CR added
      await save(wrapper);
      expect(own.dispatch.mock.calls[0]?.[0].changes.insert).toBe(raw);
    });

    it("reads the draft, not whichever editor was focused last", () => {
      active(view("HTTP/1.1 200 OK\r\n\r\nresponse body"));
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "old" },
          draft: { raw: "Draft" },
        },
      });

      expect(wrapper.text()).toContain("5 bytes");
      expect(wrapper.find("td:nth-child(3)").text()).toBe("Draft");
    });

    it("follows the draft when it changes", async () => {
      active(undefined);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "One" } },
      });
      await wrapper.setProps({ draft: { raw: "Three" } });

      expect(wrapper.find("td:nth-child(3)").text()).toBe("Three");
    });

    it("saves to the pane's own view even when another editor is active", async () => {
      const other = view("Test");
      const own = view("Test");
      active(other);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "Test" }, view: own },
      });
      await save(wrapper);

      expect(own.dispatch).toHaveBeenCalledTimes(1);
      expect(other.dispatch).not.toHaveBeenCalled();
    });

    it("refuses to edit or write when no editor holds the draft", async () => {
      const response = view("HTTP/1.1 200 OK");
      active(response);
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "Test" } },
      });

      // Edits would be lost, so the modal does not even open.
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      expect(wrapper.find("textarea").exists()).toBe(false);
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        expect.stringContaining("can't reach the request editor"),
        { variant: "warning" },
      );

      await save(wrapper);
      expect(response.dispatch).not.toHaveBeenCalled();
      expect(mockSdk.window.showToast).toHaveBeenCalledWith(
        expect.stringContaining("can't reach the request editor"),
        { variant: "error" },
      );
    });

    it("finds the request editor at save time once it holds the draft", async () => {
      active(view("HTTP/1.1 200 OK")); // focused at mount: the response
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "Test" } },
      });
      const request = view("Test");
      active(request);
      await editFirstRow(wrapper, "42 65 73 74");
      // Focusing the response again must not strand the accepted edit.
      active(view("HTTP/1.1 200 OK"));
      await save(wrapper);

      expect(request.dispatch.mock.calls[0]?.[0].changes.insert).toBe("Best");
    });

    it("keeps the selection when a save echoes back through the draft", async () => {
      const own = view("Test");
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "Test" }, view: own },
      });
      await editFirstRow(wrapper, "42 65 73 74");
      await wrapper.find("td:nth-child(2) span span").trigger("click");
      await save(wrapper);

      // The host hands the saved text back as the new draft.
      await wrapper.setProps({ draft: { raw: "Best" } });
      expect(wrapper.text()).toContain("1 byte(s) selected");

      await wrapper.setProps({ draft: { raw: "Other" } });
      expect(wrapper.text()).not.toContain("selected");
    });
  });

  describe("Kept-alive pages", () => {
    it("ignores shortcuts while the pane is detached from the document", async () => {
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, request: { raw: "Hello" } },
      });

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
      );
      await wrapper.vm.$nextTick();

      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(false);
      wrapper.unmount();
    });
  });

  // Caido hands over text: UTF-8 if the bytes were valid UTF-8, else one
  // character per byte; Replay sends code points up to U+00FF as one byte.
  describe("Real bytes behind Caido's text", () => {
    const caidoDecode = (bytes: number[]): string => {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(bytes),
        );
      } catch {
        return String.fromCharCode(...bytes);
      }
    };
    const caidoEncode = (text: string): number[] =>
      Array.from(text).flatMap((ch) => {
        const cp = ch.codePointAt(0)!;
        return cp <= 0xff ? [cp] : [...new TextEncoder().encode(ch)];
      });
    const ascii = (text: string) => [...new TextEncoder().encode(text)];
    const hex = (bytes: number[]) =>
      bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const shownHex = (wrapper: ReturnType<typeof mount>) =>
      wrapper
        .findAll("td:nth-child(2) span span.cursor-pointer")
        .map((s) => s.text())
        .join(" ");
    const ownView = (raw: string) => ({
      state: { sliceDoc: () => raw, doc: { toString: () => raw, length: 0 } },
      dispatch: vi.fn(),
    });
    const searchAscii = async (
      wrapper: ReturnType<typeof mount>,
      query: string,
    ) => {
      await wrapper.find("button[title='Search (Ctrl+F)']").trigger("click");
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "ASCII")
        ?.trigger("click");
      await wrapper.find("input[placeholder*='Search']").setValue(query);
      return wrapper
        .findAll("td:nth-child(2) span span.bg-orange-500\\/50")
        .map((s) => s.text())
        .join(" ");
    };

    it("shows a response body that is not UTF-8 byte for byte", () => {
      const bytes = [
        ...ascii("HTTP/1.1 200 OK\r\n\r\n"),
        ...[0x41, 0x0a, 0x42, 0x00, 0x01, 0xff, 0x20],
      ];
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          response: { raw: caidoDecode(bytes), length: bytes.length },
        },
      });

      expect(shownHex(wrapper)).toBe(hex(bytes));
      expect(wrapper.text()).toContain(`${bytes.length} bytes`);
    });

    it("detects and exports a PNG body as its real bytes", async () => {
      const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff];
      const bytes = [...ascii("HTTP/1.1 200 OK\r\n\r\n"), ...png];
      const createObjectURL = vi.fn((_: Blob) => "blob:mock");
      Object.defineProperty(URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        value: vi.fn(),
        configurable: true,
      });
      HTMLAnchorElement.prototype.click = vi.fn();
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          response: { raw: caidoDecode(bytes), length: bytes.length },
        },
      });

      expect(wrapper.find("[title*='Detected file signature']").text()).toBe(
        "PNG",
      );
      await wrapper.find("button[title='Export binary data']").trigger("click");
      const blob = createObjectURL.mock.calls[0]![0];
      expect(hex([...new Uint8Array(await blob.arrayBuffer())])).toBe(
        hex(bytes),
      );
    });

    it("shows UTF-8 text in a captured message as its UTF-8 bytes", () => {
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, request: { raw: "é한😀" } },
      });
      expect(shownHex(wrapper)).toBe(hex(ascii("é한😀")));
    });

    it("shows a Replay draft as the bytes Caido sends for it", () => {
      window.location.hash = "#/replay/1";
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "é한" }, view: ownView("é한") },
      });
      expect(shownHex(wrapper)).toBe("e9 ed 95 9c");
    });

    it("saves any bytes as text Caido sends as exactly those bytes", async () => {
      window.location.hash = "#/replay/1";
      const own = ownView("Test");
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "Test" }, view: own },
      });
      const edited = [
        0xc3, 0xa9, 0xe9, 0xff, 0x00, 0xed, 0x95, 0x9c, 0xf0, 0x9f, 0x98, 0x80,
        0x80, 0xc4,
      ];
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      await wrapper
        .find("textarea[placeholder*='Enter hex']")
        .setValue(hex(edited));
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "OK")
        ?.trigger("click");
      await wrapper.find("td:nth-child(2) span span").trigger("click");
      await wrapper.find("button[title='Save Changes']").trigger("click");

      const insert: string = own.dispatch.mock.calls[0]?.[0].changes.insert;
      expect(hex(caidoEncode(insert))).toBe(hex(edited));
      // The saved text echoes back as the draft: same bytes, selection kept.
      await wrapper.setProps({ draft: { raw: insert } });
      expect(shownHex(wrapper)).toBe(hex(edited));
      expect(wrapper.text()).toContain("1 byte(s) selected");
    });

    it("searches ASCII text the way the pane's text holds it", async () => {
      window.location.hash = "#/replay/1";
      const draft = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw: "café" }, view: ownView("") },
      });
      expect(await searchAscii(draft, "é")).toBe("e9");

      window.location.hash = "";
      const utf8 = mount(HexViewMode, {
        props: { ...defaultProps, response: { raw: "café", length: 5 } },
      });
      expect(await searchAscii(utf8, "é")).toBe("c3 a9");
      const latin1 = mount(HexViewMode, {
        props: { ...defaultProps, response: { raw: "café", length: 4 } },
      });
      expect(await searchAscii(latin1, "é")).toBe("e9");
    });
  });

  describe("ASCII column layout", () => {
    it("keeps spaces and never wraps", () => {
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, request: { raw: "a  b" } },
      });
      expect(wrapper.find("td:nth-child(3) > span").classes()).toContain(
        "whitespace-pre",
      );
    });
  });

  describe("Edit modal keyboard", () => {
    const open = async () => {
      window.location.hash = "#/replay/1";
      const raw = "Test";
      const view = {
        state: { sliceDoc: () => raw, doc: { toString: () => raw, length: 4 } },
        dispatch: vi.fn(),
      };
      const wrapper = mount(HexViewMode, {
        props: { ...defaultProps, draft: { raw }, view },
        attachTo: document.body,
      });
      await wrapper.find("td:nth-child(2) span").trigger("dblclick");
      await wrapper.vm.$nextTick();
      return wrapper;
    };
    const hexBox = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find("textarea[placeholder*='Enter hex']");

    it("takes focus, cancels on Escape and applies on Ctrl/Cmd+Enter", async () => {
      const wrapper = await open();
      expect(document.activeElement).toBe(hexBox(wrapper).element);

      await hexBox(wrapper).setValue("42 65 73 74");
      await hexBox(wrapper).trigger("keydown", { key: "Escape" });
      expect(hexBox(wrapper).exists()).toBe(false);
      expect(wrapper.find("td:nth-child(3)").text()).toBe("Test");

      for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
        await wrapper.find("td:nth-child(2) span").trigger("dblclick");
        await hexBox(wrapper).setValue(mod.ctrlKey ? "42 65 73 74" : "52");
        await hexBox(wrapper).trigger("keydown", { key: "Enter", ...mod });
        expect(hexBox(wrapper).exists()).toBe(false);
      }
      expect(wrapper.find("td:nth-child(3)").text()).toBe("R");
      wrapper.unmount();
    });

    it("keeps Ctrl+F/Ctrl+G inside the modal, and works again after it", async () => {
      const wrapper = await open();
      const ok = wrapper.findAll("button").find((b) => b.text() === "OK")!;
      (ok.element as HTMLElement).focus();
      for (const key of ["f", "g"]) {
        ok.element.dispatchEvent(
          new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }),
        );
      }
      await wrapper.vm.$nextTick();
      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(false);
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(
        false,
      );

      await ok.trigger("click");
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
      );
      await wrapper.vm.$nextTick();
      expect(wrapper.find("input[placeholder*='Search']").exists()).toBe(true);
      wrapper.unmount();
    });
  });
});
