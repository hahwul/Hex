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

      expect(wrapper.text()).toContain("GET");
      expect(wrapper.text()).toContain("example.com/");
      expect(wrapper.text()).toContain("Hello"); // ASCII column

      // Check byte count
      // "GET / HTTP/1.1\r\nHost: example.com\r\n\r\nHello"
      // Length: 14 + 2 + 17 + 2 + 2 + 5 = 42
      // The component ensures CRLF. The input already has CRLF.
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

      expect(wrapper.text()).toContain("Response");
      expect(wrapper.text()).toContain("example.com");
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
      const hexCell = wrapper.find("td:nth-child(2) input");
      expect((hexCell.element as HTMLInputElement).value).toContain("41 42 43");

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

      const hexCell = wrapper.find("td:nth-child(2) input");
      // "e" (65) -> "\r" (0d) -> "\n" (0a) -> "L" (4c)
      // Line1: 4c 69 6e 65 31
      // Line2: 4c 69 6e 65 32
      // CRLF: 0d 0a
      expect((hexCell.element as HTMLInputElement).value).toContain("0d 0a");
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

        const hexCell = wrapper.find("td:nth-child(2) input");
        // LF: 0a. Should NOT contain 0d before 0a (unless it was already there, which it isn't)
        // search for "0d 0a" might be false positive if 0d is end of line and 0a start of next?
        // But here it's continuous.
        // "0a" should be present. "0d 0a" should NOT be present (unless it coincidentally formed from data).
        // 4c 69 6e 65 31 0a 4c 69 6e 65 32
        expect((hexCell.element as HTMLInputElement).value).not.toContain("0d 0a");
        expect((hexCell.element as HTMLInputElement).value).toContain("0a");
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

      const hexInput = wrapper.find("td:nth-child(2) input");
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

      const hexInput = wrapper.find("td:nth-child(2) input");
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
      await wrapper.find("td:nth-child(2) input").trigger("dblclick");

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
      await wrapper.find("td:nth-child(2) input").trigger("dblclick");

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
      await wrapper.find("td:nth-child(2) input").trigger("dblclick");

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
      const hexCell = wrapper.find("td:nth-child(2) input");
      const asciiCell = wrapper.find("td:nth-child(3)");

      expect((hexCell.element as HTMLInputElement).value).toContain("42");
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
      await wrapper.find("td:nth-child(2) input").trigger("dblclick");

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
      const hexCell = wrapper.find("td:nth-child(2) input");
      const asciiCell = wrapper.find("td:nth-child(3)");

      expect((hexCell.element as HTMLInputElement).value).toContain("41");
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
        await wrapper.find("td:nth-child(2) input").trigger("dblclick");
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
});
