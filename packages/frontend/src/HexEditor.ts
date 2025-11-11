export class HexEditor extends EventTarget {
  private element: HTMLElement;
  private data: Uint8Array;
  private editable: boolean;
  private inputs: HTMLInputElement[] = [];

  constructor(element: HTMLElement, data: Uint8Array, editable: boolean) {
    super();
    this.element = element;
    this.data = new Uint8Array(data);
    this.editable = editable;
    this.render();
  }

  setData(data: Uint8Array) {
    this.data = new Uint8Array(data);
    this.render();
  }

  setEditable(editable: boolean) {
    this.editable = editable;
    this.render();
  }

  private render() {
    this.element.innerHTML = "";
    this.inputs = [];

    const container = document.createElement("div");
    container.style.fontFamily = "monospace";
    container.style.whiteSpace = "pre-wrap";
    container.style.lineHeight = "1.5";

    for (let i = 0; i < this.data.length; i += 16) {
      const row = this.data.slice(i, i + 16);
      const rowDiv = document.createElement("div");

      row.forEach((byte, idx) => {
        if (this.editable) {
          const input = document.createElement("input");
          input.type = "text";
          input.value = byte.toString(16).padStart(2, "0").toUpperCase();
          input.style.width = "2ch";
          input.style.border = "none";
          input.style.background = "transparent";
          input.style.color = "inherit";
          input.style.fontFamily = "inherit";
          input.style.fontSize = "inherit";
          input.maxLength = 2;
          input.addEventListener("input", (e) => {
            const val = (e.target as HTMLInputElement).value;
            if (/^[0-9a-fA-F]{0,2}$/.test(val)) {
              const num = parseInt(val || "0", 16);
              this.data[i + idx] = num;
              this.dispatchEvent(
                new CustomEvent("change", {
                  detail: new Uint8Array(this.data),
                }),
              );
            }
          });
          rowDiv.appendChild(input);
          this.inputs.push(input);
        } else {
          const span = document.createElement("span");
          span.textContent = byte.toString(16).padStart(2, "0").toUpperCase();
          rowDiv.appendChild(span);
        }
        rowDiv.appendChild(document.createTextNode(" "));
      });

      container.appendChild(rowDiv);
    }

    this.element.appendChild(container);
  }
}
