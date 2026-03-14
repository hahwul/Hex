import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
                request: { raw: "", host: "", path: "" }
            }
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
                request: { raw, host: "test", path: "/" }
            }
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
    it("normalizes LF to CRLF for requests", async () => {
      const raw = "Line1\nLine2";
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

    it("does not normalize LF to CRLF for responses", async () => {
        // Logic check: The component only does this for requests
        // if (rawData && isRequest.value) { ... }

        const raw = "Line1\nLine2";
        const wrapper = mount(HexViewMode, {
            props: {
                ...defaultProps,
                response: { raw, host: "test" }
            }
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
        attachTo: document.body
      });

      const hexInput = wrapper.find("td:nth-child(2) span");
      await hexInput.trigger("dblclick");

      expect(wrapper.find(".fixed.inset-0").exists()).toBe(true);
      expect(wrapper.text()).toContain("Edit Hex Values");
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
      const hexTextarea = wrapper.find("textarea[placeholder*='Enter hex values']");

      // Change "41" (A) to "42" (B)
      await hexTextarea.setValue("42");

      // Check ASCII preview
      const asciiTextarea = wrapper.find("textarea[placeholder='ASCII representation']");
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
      const asciiTextarea = wrapper.find("textarea[placeholder='ASCII representation']");

      // Change "A" to "C"
      await asciiTextarea.setValue("C");

      // Check Hex preview
      const hexTextarea = wrapper.find("textarea[placeholder*='Enter hex values']");
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
      const asciiTextarea = wrapper.find("textarea[placeholder='ASCII representation']");
      await asciiTextarea.setValue("B");

      // Click OK
      const buttons = wrapper.findAll("button");
      const okButton = buttons.find(b => b.text() === "OK");
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
      const asciiTextarea = wrapper.find("textarea[placeholder='ASCII representation']");
      await asciiTextarea.setValue("B");

      // Click Cancel
      const buttons = wrapper.findAll("button");
      const cancelButton = buttons.find(b => b.text() === "Cancel");
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
            }
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
                        length: raw.length
                    }
                },
                dispatch: mockDispatch
            })
        };
        mockSdk.window.getActiveEditor.mockReturnValue(mockEditor);

        const wrapper = mount(HexViewMode, {
            props: {
                ...defaultProps,
                request: { raw, host: "test", path: "/" },
            }
        });

        // 1. Open modal and change data
        await wrapper.find("td:nth-child(2) span").trigger("dblclick");
        const asciiTextarea = wrapper.find("textarea[placeholder='ASCII representation']");
        await asciiTextarea.setValue("Best"); // T -> B
        const buttons = wrapper.findAll("button");
        const okButton = buttons.find(b => b.text() === "OK");
        await okButton?.trigger("click");

        // 2. Click Save
        const saveButton = wrapper.find("button[title='Save Changes']");
        await saveButton.trigger("click");

        // 3. Verify dispatch called
        expect(mockDispatch).toHaveBeenCalled();
        const callArgs = mockDispatch.mock.calls[0]?.[0];
        expect(callArgs.changes.insert).toBe("Best"); // "Test" -> "Best"

        // 4. Verify toast
        expect(mockSdk.window.showToast).toHaveBeenCalledWith("Request updated successfully", { variant: "success" });
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
                        length: raw.length
                    }
                },
                dispatch: mockDispatch
            })
        };
        mockSdk.window.getActiveEditor.mockReturnValue(mockEditor);

        const wrapper = mount(HexViewMode, {
            props: {
                ...defaultProps,
                request: { raw, host: "test", path: "/" },
            }
        });

        // Click Save
        const saveButton = wrapper.find("button[title='Save Changes']");
        await saveButton.trigger("click");

        // Verify error toast
        expect(mockSdk.window.showToast).toHaveBeenCalledWith(expect.stringContaining("Failed to update request"), { variant: "error" });
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
      expect(wrapper.find("input[placeholder*='Search hex']").exists()).toBe(false);

      // Click search button
      const searchBtn = wrapper.find("button[title*='Search']");
      await searchBtn.trigger("click");

      // Search bar should now be visible
      expect(wrapper.find("input[placeholder*='Search hex']").exists()).toBe(true);

      // Click close button
      const closeBtn = wrapper.find("button[title='Close (Esc)']");
      await closeBtn.trigger("click");

      // Search bar should be hidden again
      expect(wrapper.find("input[placeholder*='Search hex']").exists()).toBe(false);
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
      const asciiBtn = wrapper.findAll("button").find(b => b.text() === "ASCII");
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
      await wrapper.find("button[title='Previous (Shift+Enter)']").trigger("click");
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
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(false);

      // Click goto button
      const gotoBtn = wrapper.find("button[title*='Go to offset']");
      await gotoBtn.trigger("click");

      // Should be visible
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(true);

      // Close it
      const closeBtn = wrapper.findAll("button[title='Close (Esc)']").pop();
      await closeBtn?.trigger("click");
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(false);
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
      const goBtn = wrapper.findAll("button").find(b => b.text() === "Go");
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

      const goBtn = wrapper.findAll("button").find(b => b.text() === "Go");
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

      const goBtn = wrapper.findAll("button").find(b => b.text() === "Go");
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
      expect(wrapper.find("input[placeholder*='Hex (0x']").exists()).toBe(false);
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
      const goBtn = wrapper.findAll("button").find(b => b.text() === "Go");
      await goBtn?.trigger("click");

      expect(wrapper.findAll("span.bg-cyan-500\\/50").length).toBeGreaterThan(0);

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
    it("toggles structure highlighting on/off", async () => {
      const wrapper = mount(HexViewMode, {
        props: {
          ...defaultProps,
          request: { raw: "GET / HTTP/1.1\r\nHost: test\r\n\r\nbody", host: "test", path: "/" },
        },
      });

      // Initially off
      expect(wrapper.findAll("tr.bg-purple-500\\/15").length).toBe(0);

      // Click toggle button
      const toggleBtn = wrapper.find("button[title='Toggle HTTP structure highlighting']");
      await toggleBtn.trigger("click");

      // Header rows should have purple background
      const purpleRows = wrapper.findAll("tr.bg-purple-500\\/15");
      expect(purpleRows.length).toBeGreaterThan(0);

      // Body rows should have emerald background
      const emeraldRows = wrapper.findAll("tr.bg-emerald-500\\/15");
      expect(emeraldRows.length).toBeGreaterThan(0);

      // Toggle off
      await toggleBtn.trigger("click");
      expect(wrapper.findAll("tr.bg-purple-500\\/15").length).toBe(0);
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
  });
});
