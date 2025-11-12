import { describe, expect, it } from "vitest";

import { asciiToHex, ensureCRLF, hexToAscii, parseHttpRaw } from "../utils";

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
});
