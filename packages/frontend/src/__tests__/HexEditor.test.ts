import { beforeEach, describe, expect, it, vi } from "vitest";

import { HexEditor } from "../HexEditor";

describe("HexEditor", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("constructor", () => {
    it("should create a HexEditor instance", () => {
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const editor = new HexEditor(container, data, false);
      expect(editor).toBeInstanceOf(HexEditor);
    });

    it("should render hex data in the container", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, false);
      expect(container.textContent).toContain("48");
      expect(container.textContent).toContain("65");
    });

    it("should render in read-only mode when editable is false", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, false);
      const inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(0);
    });

    it("should render in editable mode when editable is true", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, true);
      const inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(2);
    });
  });

  describe("setData", () => {
    it("should update the displayed data", () => {
      const initialData = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, initialData, false);

      const newData = new Uint8Array([0x41, 0x42]);
      editor.setData(newData);

      expect(container.textContent).toContain("41");
      expect(container.textContent).toContain("42");
    });

    it("should preserve a copy of the data", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, false);

      // Modify the original array
      data[0] = 0xff;

      // The editor should still show the original value
      expect(container.textContent).toContain("48");
    });
  });

  describe("setEditable", () => {
    it("should switch from read-only to editable mode", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, false);

      let inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(0);

      editor.setEditable(true);
      inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(2);
    });

    it("should switch from editable to read-only mode", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, true);

      let inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(2);

      editor.setEditable(false);
      inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(0);
    });
  });

  describe("editable mode", () => {
    it("should display bytes in uppercase hex format", () => {
      const data = new Uint8Array([0xab, 0xcd]);
      const editor = new HexEditor(container, data, true);
      const inputs = container.querySelectorAll("input");

      expect((inputs[0] as HTMLInputElement).value).toBe("AB");
      expect((inputs[1] as HTMLInputElement).value).toBe("CD");
    });

    it("should pad single digit hex values with zero", () => {
      const data = new Uint8Array([0x05, 0x0f]);
      const editor = new HexEditor(container, data, true);
      const inputs = container.querySelectorAll("input");

      expect((inputs[0] as HTMLInputElement).value).toBe("05");
      expect((inputs[1] as HTMLInputElement).value).toBe("0F");
    });

    it("should emit change event when input is modified", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, true);

      const changeHandler = vi.fn();
      editor.addEventListener("change", changeHandler);

      const inputs = container.querySelectorAll("input");
      const firstInput = inputs[0] as HTMLInputElement;

      // Simulate user input
      firstInput.value = "FF";
      firstInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(changeHandler).toHaveBeenCalled();
    });

    it("should update internal data when input changes", () => {
      const data = new Uint8Array([0x48, 0x65]);
      const editor = new HexEditor(container, data, true);

      let updatedData: Uint8Array | undefined = undefined;
      editor.addEventListener("change", (event: Event) => {
        const customEvent = event as CustomEvent<Uint8Array>;
        updatedData = customEvent.detail;
      });

      const inputs = container.querySelectorAll("input");
      const firstInput = inputs[0] as HTMLInputElement;

      firstInput.value = "FF";
      firstInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(updatedData).toBeDefined();
      expect(updatedData![0]).toBe(0xff);
      expect(updatedData![1]).toBe(0x65);
    });

    it("should accept valid hexadecimal input", () => {
      const data = new Uint8Array([0x00]);
      const editor = new HexEditor(container, data, true);

      const inputs = container.querySelectorAll("input");
      const input = inputs[0] as HTMLInputElement;

      input.value = "A5";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(input.value).toBe("A5");
    });

    it("should handle empty input as zero", () => {
      const data = new Uint8Array([0xff]);
      const editor = new HexEditor(container, data, true);

      let updatedData: Uint8Array | undefined = undefined;
      editor.addEventListener("change", (event: Event) => {
        const customEvent = event as CustomEvent<Uint8Array>;
        updatedData = customEvent.detail;
      });

      const inputs = container.querySelectorAll("input");
      const input = inputs[0] as HTMLInputElement;

      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(updatedData).toBeDefined();
      expect(updatedData![0]).toBe(0x00);
    });
  });

  describe("rendering layout", () => {
    it("should render data in rows of 16 bytes", () => {
      // Create 32 bytes of data (should be 2 rows)
      const data = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        data[i] = i;
      }

      const editor = new HexEditor(container, data, false);
      // Select the container div, then count its child divs (rows)
      const innerContainer = container.querySelector("div");
      const rows = innerContainer?.querySelectorAll(":scope > div");

      expect(rows?.length).toBe(2);
    });

    it("should handle partial last row correctly", () => {
      // Create 20 bytes of data (1 full row + 4 bytes)
      const data = new Uint8Array(20);
      for (let i = 0; i < 20; i++) {
        data[i] = i;
      }

      const editor = new HexEditor(container, data, false);
      // Select the container div, then count its child divs (rows)
      const innerContainer = container.querySelector("div");
      const rows = innerContainer?.querySelectorAll(":scope > div");

      expect(rows?.length).toBe(2);
    });

    it("should use monospace font family", () => {
      const data = new Uint8Array([0x48]);
      const editor = new HexEditor(container, data, false);

      const innerContainer = container.querySelector("div");
      expect(innerContainer?.style.fontFamily).toBe("monospace");
    });
  });

  describe("edge cases", () => {
    it("should handle empty data array", () => {
      const data = new Uint8Array([]);
      const editor = new HexEditor(container, data, false);

      expect(container.innerHTML).toBeTruthy();
    });

    it("should handle single byte", () => {
      const data = new Uint8Array([0x42]);
      const editor = new HexEditor(container, data, false);

      expect(container.textContent).toContain("42");
    });

    it("should handle maximum byte value", () => {
      const data = new Uint8Array([0xff]);
      const editor = new HexEditor(container, data, true);
      const inputs = container.querySelectorAll("input");

      expect(inputs.length).toBeGreaterThan(0);
      expect((inputs[0] as HTMLInputElement).value).toBe("FF");
    });

    it("should handle minimum byte value", () => {
      const data = new Uint8Array([0x00]);
      const editor = new HexEditor(container, data, true);
      const inputs = container.querySelectorAll("input");

      expect(inputs.length).toBeGreaterThan(0);
      expect((inputs[0] as HTMLInputElement).value).toBe("00");
    });
  });
});
