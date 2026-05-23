import { describe, expect, it } from "vitest";

import {
  asciiToHex,
  ensureCRLF,
  hexToAscii,
  parseHttpRaw,
  detectFileSignature,
  formatBytes,
  findHttpBodyOffset,
  encodeUtf8WithLimit,
  sanitizeFilename,
  parseContentDispositionFilename,
} from "../utils";

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

    it("should detect GIF87a signature", () => {
      const data = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
      expect(detectFileSignature(data)).toBe("GIF87a");
    });

    it("should detect BMP signature", () => {
      const data = new Uint8Array([0x42, 0x4d, 0x36, 0x00]);
      expect(detectFileSignature(data)).toBe("BMP");
    });

    it("should detect ICO signature", () => {
      const data = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
      expect(detectFileSignature(data)).toBe("ICO");
    });

    it("should detect TIFF (BE) signature", () => {
      const data = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]);
      expect(detectFileSignature(data)).toBe("TIFF (BE)");
    });

    it("should detect TIFF (LE) signature", () => {
      const data = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
      expect(detectFileSignature(data)).toBe("TIFF (LE)");
    });

    it("should detect RAR signature", () => {
      const data = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
      expect(detectFileSignature(data)).toBe("RAR");
    });

    it("should detect 7z signature", () => {
      const data = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
      expect(detectFileSignature(data)).toBe("7z");
    });

    it("should detect TAR signature at offset 257", () => {
      // TAR has a "ustar" magic at byte offset 257
      const data = new Uint8Array(512);
      data[257] = 0x75;
      data[258] = 0x73;
      data[259] = 0x74;
      data[260] = 0x61;
      data[261] = 0x72;
      expect(detectFileSignature(data)).toBe("TAR");
    });

    it("should not detect TAR when buffer is shorter than offset", () => {
      const data = new Uint8Array([0x75, 0x73, 0x74, 0x61, 0x72]);
      expect(detectFileSignature(data)).toBeNull();
    });

    it("should detect Mach-O (32) signature", () => {
      const data = new Uint8Array([0xfe, 0xed, 0xfa, 0xce]);
      expect(detectFileSignature(data)).toBe("Mach-O (32)");
    });

    it("should detect Mach-O (64) signature", () => {
      const data = new Uint8Array([0xfe, 0xed, 0xfa, 0xcf]);
      expect(detectFileSignature(data)).toBe("Mach-O (64)");
    });

    it("should detect WASM signature", () => {
      const data = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]);
      expect(detectFileSignature(data)).toBe("WASM");
    });

    it("should detect SQLite signature", () => {
      const data = new Uint8Array([
        0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
        0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
      ]);
      expect(detectFileSignature(data)).toBe("SQLite");
    });

    it("should detect FLAC signature", () => {
      const data = new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
      expect(detectFileSignature(data)).toBe("FLAC");
    });

    it("should detect OGG signature", () => {
      const data = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
      expect(detectFileSignature(data)).toBe("OGG");
    });

    it("should detect MP3 (ID3) signature", () => {
      const data = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
      expect(detectFileSignature(data)).toBe("MP3 (ID3)");
    });

    it("should not detect WebP when buffer is shorter than 12 bytes", () => {
      // Starts with RIFF but truncated before WEBP marker
      const data = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      expect(detectFileSignature(data)).toBeNull();
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

    it("should pad hex column to align ASCII when last row is partial", () => {
      // 5 bytes, 16 bytes per row -> hex column should be padded
      const result = formatBytes(hello, "hexdump", 16);
      // Hex column width is bytesPerRow * 3 - 1 = 47 chars; ascii follows after two spaces
      const lines = result.split("\n");
      expect(lines.length).toBe(1);
      // The ascii portion should appear at the same offset regardless of row fill level
      expect(lines[0]?.endsWith("Hello")).toBe(true);
    });

    it("should format hexdump offset in 8-digit hex", () => {
      const data = new Uint8Array(20);
      const result = formatBytes(data, "hexdump", 16);
      const lines = result.split("\n");
      expect(lines[0]?.startsWith("00000000")).toBe(true);
      expect(lines[1]?.startsWith("00000010")).toBe(true);
    });
  });

  describe("findHttpBodyOffset", () => {
    it("returns -1 when no CRLFCRLF boundary is present", () => {
      const data = new TextEncoder().encode("GET / HTTP/1.1\r\nHost: x\r\n");
      expect(findHttpBodyOffset(data)).toBe(-1);
    });

    it("returns the byte offset just past the boundary", () => {
      const headers = "GET / HTTP/1.1\r\nHost: x\r\n\r\n";
      const raw = headers + "body";
      const data = new TextEncoder().encode(raw);
      expect(findHttpBodyOffset(data)).toBe(headers.length);
    });

    it("returns -1 for buffers shorter than the marker", () => {
      expect(findHttpBodyOffset(new Uint8Array([0x0d, 0x0a]))).toBe(-1);
    });

    it("finds only the first boundary when multiple are present", () => {
      const raw = "A\r\n\r\nB\r\n\r\n";
      const data = new TextEncoder().encode(raw);
      expect(findHttpBodyOffset(data)).toBe(5); // "A\r\n\r\n" -> 5
    });
  });

  describe("encodeUtf8WithLimit", () => {
    it("returns the full encoding when under the limit", () => {
      const result = encodeUtf8WithLimit("hello", 100);
      expect(Array.from(result)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it("disables truncation when maxBytes <= 0", () => {
      const result = encodeUtf8WithLimit("hello", 0);
      expect(result.length).toBe(5);
    });

    it("truncates ASCII to exactly maxBytes", () => {
      const result = encodeUtf8WithLimit("abcdef", 3);
      expect(Array.from(result)).toEqual([0x61, 0x62, 0x63]);
    });

    it("never splits a multi-byte UTF-8 sequence", () => {
      // "한" is 3 bytes in UTF-8: ed 95 9c
      const result = encodeUtf8WithLimit("한가", 4);
      // We must back off the partial 3-byte sequence; only "한" fits in 4 bytes.
      expect(result.length).toBe(3);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(result);
      expect(decoded).toBe("한");
    });

    it("returns an empty result when the limit falls inside the first multi-byte char", () => {
      const result = encodeUtf8WithLimit("한", 2);
      expect(result.length).toBe(0);
    });

    it("handles supplementary plane chars (4-byte sequences)", () => {
      // "😀" is 4 bytes: f0 9f 98 80
      const result = encodeUtf8WithLimit("😀x", 3);
      expect(result.length).toBe(0);
      const result2 = encodeUtf8WithLimit("😀x", 4);
      expect(result2.length).toBe(4);
    });
  });

  describe("sanitizeFilename", () => {
    it("strips control characters", () => {
      expect(sanitizeFilename("foo\r\nbar\x00.txt")).toBe("foobar.txt");
    });

    it("replaces path separators", () => {
      expect(sanitizeFilename("a/b\\c.txt")).toBe("a_b_c.txt");
    });

    it("falls back when input is empty after sanitization", () => {
      expect(sanitizeFilename("\x00\x01", "fallback.bin")).toBe("fallback.bin");
    });

    it("strips leading dots to avoid hidden / traversal names", () => {
      expect(sanitizeFilename("...file.txt")).toBe("file.txt");
      expect(sanitizeFilename("..", "f.bin")).toBe("f.bin");
    });

    it("caps overly long names", () => {
      const long = "a".repeat(500) + ".bin";
      expect(sanitizeFilename(long).length).toBe(255);
    });
  });

  describe("parseContentDispositionFilename", () => {
    it("parses a plain filename= value", () => {
      expect(parseContentDispositionFilename("attachment; filename=report.csv"))
        .toBe("report.csv");
    });

    it("parses a quoted filename= value", () => {
      expect(
        parseContentDispositionFilename('attachment; filename="report v2.csv"'),
      ).toBe("report v2.csv");
    });

    it("prefers RFC 5987 filename*= over filename=", () => {
      const header =
        "attachment; filename=fallback.bin; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf";
      expect(parseContentDispositionFilename(header)).toBe("résumé.pdf");
    });

    it("returns null when no filename token is present", () => {
      expect(parseContentDispositionFilename("attachment")).toBeNull();
    });

    it("strips CRLF injection from filename values", () => {
      const header = 'attachment; filename="foo\r\nSet-Cookie: x.txt"';
      const result = parseContentDispositionFilename(header);
      expect(result).not.toBeNull();
      expect(result).not.toContain("\r");
      expect(result).not.toContain("\n");
    });

    it("strips path separators from filename values", () => {
      const header = 'attachment; filename="../../etc/passwd"';
      const result = parseContentDispositionFilename(header);
      expect(result).not.toContain("/");
      expect(result).not.toContain("\\");
    });

    it("falls back to legacy filename= when filename*= is malformed", () => {
      const header =
        "attachment; filename=legacy.txt; filename*=UTF-8''%E0%A4%A";
      // The percent sequence is invalid; decoder throws, and we fall back.
      expect(parseContentDispositionFilename(header)).toBe("legacy.txt");
    });
  });
});
