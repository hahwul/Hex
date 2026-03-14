import { describe, expect, it } from "vitest";

import { asciiToHex, ensureCRLF, hexToAscii, parseHttpRaw, detectFileSignature, formatBytes } from "../utils";

describe("utils", () => {
  describe("hexToAscii", () => {
    it("should convert hex string to ASCII", () => {
      const hex = "48 65 6c 6c 6f"; // "Hello"
      expect(hexToAscii(hex)).toBe("Hello");
    });

    it("should handle uppercase hex values", () => {
      const hex = "48 45 4C 4C 4F"; // "HELLO"
      expect(hexToAscii(hex)).toBe("HELLO");
    });

    it("should replace non-printable characters with dots", () => {
      const hex = "00 01 02 03"; // Non-printable
      expect(hexToAscii(hex)).toBe("....");
    });

    it("should handle mixed printable and non-printable characters", () => {
      const hex = "48 00 65 01 6c"; // "H.e.l"
      expect(hexToAscii(hex)).toBe("H.e.l");
    });

    it("should handle empty hex string", () => {
      expect(hexToAscii("")).toBe("");
    });

    it("should handle hex values with extra spaces", () => {
      const hex = "48  65  6c"; // Extra spaces
      expect(hexToAscii(hex)).toBe("Hel");
    });

    it("should ignore invalid hex values", () => {
      const hex = "48 ZZ 65"; // ZZ is invalid
      expect(hexToAscii(hex)).toBe("He");
    });

    it("should handle DEL character (127) as non-printable", () => {
      const hex = "7f"; // DEL character
      expect(hexToAscii(hex)).toBe(".");
    });

    it("should handle space character (32) as printable", () => {
      const hex = "20"; // Space
      expect(hexToAscii(hex)).toBe(" ");
    });
  });

  describe("asciiToHex", () => {
    it("should convert ASCII string to hex", () => {
      const ascii = "Hello";
      expect(asciiToHex(ascii)).toBe("48 65 6c 6c 6f");
    });

    it("should handle uppercase letters", () => {
      const ascii = "HELLO";
      expect(asciiToHex(ascii)).toBe("48 45 4c 4c 4f");
    });

    it("should handle special characters", () => {
      const ascii = "!@#";
      expect(asciiToHex(ascii)).toBe("21 40 23");
    });

    it("should handle space character", () => {
      const ascii = "A B";
      expect(asciiToHex(ascii)).toBe("41 20 42");
    });

    it("should handle empty string", () => {
      expect(asciiToHex("")).toBe("");
    });

    it("should handle dot placeholder without original hex", () => {
      const ascii = "A.B";
      expect(asciiToHex(ascii)).toBe("41 2e 42");
    });

    it("should preserve original byte for dot placeholder when original hex provided", () => {
      const ascii = "A.B";
      const originalHex = "41 00 42"; // Middle byte is null
      expect(asciiToHex(ascii, originalHex)).toBe("41 00 42");
    });

    it("should use dot ASCII code when original hex is shorter", () => {
      const ascii = "A..";
      const originalHex = "41"; // Only one byte
      expect(asciiToHex(ascii, originalHex)).toBe("41 2e 2e");
    });

    it("should handle numbers", () => {
      const ascii = "123";
      expect(asciiToHex(ascii)).toBe("31 32 33");
    });
  });

  describe("parseHttpRaw", () => {
    it("should parse a basic HTTP request", () => {
      const raw =
        "GET /path HTTP/1.1\r\nHost: example.com\r\nUser-Agent: test\r\n\r\nbody";
      const result = parseHttpRaw(raw);

      expect(result).not.toBeNull();
      expect(result?.method).toBe("GET");
      expect(result?.headers["Host"]).toBe("example.com");
      expect(result?.headers["User-Agent"]).toBe("test");
      expect(result?.body).toBe("body");
    });

    it("should parse POST request", () => {
      const raw =
        'POST /api HTTP/1.1\r\nHost: example.com\r\n\r\n{"key":"value"}';
      const result = parseHttpRaw(raw);

      expect(result?.method).toBe("POST");
      expect(result?.body).toBe('{"key":"value"}');
    });

    it("should handle multiple header values", () => {
      const raw =
        "GET / HTTP/1.1\r\nHost: example.com\r\nAccept: text/html\r\nAccept-Language: en-US\r\n\r\n";
      const result = parseHttpRaw(raw);

      expect(result?.headers["Host"]).toBe("example.com");
      expect(result?.headers["Accept"]).toBe("text/html");
      expect(result?.headers["Accept-Language"]).toBe("en-US");
    });

    it("should handle empty body", () => {
      const raw = "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n";
      const result = parseHttpRaw(raw);

      expect(result?.body).toBe("");
    });

    it("should handle body with multiple CRLF sequences", () => {
      const raw =
        "POST / HTTP/1.1\r\nHost: example.com\r\n\r\nline1\r\n\r\nline2";
      const result = parseHttpRaw(raw);

      expect(result?.body).toBe("line1\r\n\r\nline2");
    });

    it("should return null for empty input", () => {
      expect(parseHttpRaw("")).toBeNull();
    });

    it("should return null for invalid format (no CRLF separator)", () => {
      const raw = "GET / HTTP/1.1\r\nHost: example.com";
      expect(parseHttpRaw(raw)).toBeNull();
    });

    it("should handle headers with colons in values", () => {
      const raw =
        "GET / HTTP/1.1\r\nAuthorization: Bearer token:with:colons\r\n\r\n";
      const result = parseHttpRaw(raw);

      expect(result?.headers["Authorization"]).toBe("Bearer token:with:colons");
    });

    it("should trim whitespace from header names and values", () => {
      const raw = "GET / HTTP/1.1\r\nHost:   example.com   \r\n\r\n";
      const result = parseHttpRaw(raw);

      expect(result?.headers["Host"]).toBe("example.com");
    });

    it("should return UNKNOWN method for unrecognized request line", () => {
      const raw = "INVALID\r\n\r\n";
      const result = parseHttpRaw(raw);

      expect(result?.method).toBe("UNKNOWN");
    });
  });

  describe("ensureCRLF", () => {
    it("should convert LF to CRLF", () => {
      const input = "line1\nline2\nline3";
      expect(ensureCRLF(input)).toBe("line1\r\nline2\r\nline3");
    });

    it("should not double-convert existing CRLF", () => {
      const input = "line1\r\nline2\r\nline3";
      expect(ensureCRLF(input)).toBe("line1\r\nline2\r\nline3");
    });

    it("should handle mixed line endings", () => {
      const input = "line1\nline2\r\nline3\n";
      expect(ensureCRLF(input)).toBe("line1\r\nline2\r\nline3\r\n");
    });

    it("should handle empty string", () => {
      expect(ensureCRLF("")).toBe("");
    });

    it("should handle string without line breaks", () => {
      const input = "single line";
      expect(ensureCRLF(input)).toBe("single line");
    });

    it("should handle multiple consecutive line breaks", () => {
      const input = "line1\n\nline2";
      expect(ensureCRLF(input)).toBe("line1\r\n\r\nline2");
    });
  });

  describe("detectFileSignature", () => {
    it("should detect PNG signature", () => {
      const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectFileSignature(data)).toBe("PNG");
    });

    it("should detect JPEG signature", () => {
      const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      expect(detectFileSignature(data)).toBe("JPEG");
    });

    it("should detect GIF89a signature", () => {
      const data = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectFileSignature(data)).toBe("GIF89a");
    });

    it("should detect PDF signature", () => {
      const data = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
      expect(detectFileSignature(data)).toBe("PDF");
    });

    it("should detect ZIP signature", () => {
      const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      expect(detectFileSignature(data)).toBe("ZIP");
    });

    it("should detect GZIP signature", () => {
      const data = new Uint8Array([0x1f, 0x8b, 0x08]);
      expect(detectFileSignature(data)).toBe("GZIP");
    });

    it("should detect ELF signature", () => {
      const data = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
      expect(detectFileSignature(data)).toBe("ELF");
    });

    it("should detect PE signature", () => {
      const data = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
      expect(detectFileSignature(data)).toBe("PE");
    });

    it("should return null for unknown data", () => {
      const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      expect(detectFileSignature(data)).toBeNull();
    });

    it("should return null for empty data", () => {
      const data = new Uint8Array([]);
      expect(detectFileSignature(data)).toBeNull();
    });

    it("should detect WebP signature", () => {
      // RIFF....WEBP
      const data = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
      expect(detectFileSignature(data)).toBe("WebP");
    });

    it("should not detect WebP for non-WebP RIFF", () => {
      // RIFF....WAVE (not WebP)
      const data = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      expect(detectFileSignature(data)).not.toBe("WebP");
    });
  });

  describe("formatBytes", () => {
    // "Hello" = [72, 101, 108, 108, 111]
    const hello = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);

    it("should format as raw hex", () => {
      expect(formatBytes(hello, "raw-hex")).toBe("48656c6c6f");
    });

    it("should format as spaced hex", () => {
      expect(formatBytes(hello, "spaced-hex")).toBe("48 65 6c 6c 6f");
    });

    it("should format as C array", () => {
      expect(formatBytes(hello, "c-array")).toBe("\\x48\\x65\\x6c\\x6c\\x6f");
    });

    it("should format as Python bytes", () => {
      expect(formatBytes(hello, "python-bytes")).toBe("b'\\x48\\x65\\x6c\\x6c\\x6f'");
    });

    it("should format as JSON array", () => {
      expect(formatBytes(hello, "json-array")).toBe("[72, 101, 108, 108, 111]");
    });

    it("should format as hexdump", () => {
      const result = formatBytes(hello, "hexdump", 16);
      expect(result).toContain("00000000");
      expect(result).toContain("48 65 6c 6c 6f");
      expect(result).toContain("Hello");
    });

    it("should format hexdump with custom bytes per row", () => {
      const data = new Uint8Array([0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48]);
      const result = formatBytes(data, "hexdump", 4);
      const lines = result.split("\n");
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain("41 42 43 44");
      expect(lines[1]).toContain("45 46 47 48");
    });

    it("should return empty string for empty bytes", () => {
      expect(formatBytes(new Uint8Array(), "raw-hex")).toBe("");
    });

    it("should handle non-printable characters in hexdump ASCII", () => {
      const data = new Uint8Array([0x00, 0x41, 0x7f]);
      const result = formatBytes(data, "hexdump");
      expect(result).toContain(".A.");
    });
  });
});
