/**
 * Utility functions for hex and ASCII conversion
 */

/**
 * Convert hex string to ASCII string
 * @param hex - Space-separated hex string (e.g., "48 65 6c 6c 6f")
 * @returns ASCII representation with non-printable characters as "."
 */
export const hexToAscii = (hex: string): string => {
  const hexParts = hex.split(" ").filter((h) => h.length === 2);
  const bytes = hexParts.map((h) => parseInt(h, 16)).filter((b) => !isNaN(b));
  return bytes
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
    .join("");
};

/**
 * Convert ASCII string to hex string
 * @param ascii - ASCII string to convert
 * @param originalHex - Optional original hex string for preserving non-printable characters
 * @returns Space-separated hex string
 */
export const asciiToHex = (ascii: string, originalHex?: string): string => {
  const bytes: number[] = [];
  for (let i = 0; i < ascii.length; i++) {
    const char = ascii[i];
    if (!char) continue; // Skip undefined characters
    if (char === ".") {
      // Keep original byte for "." placeholders if available
      if (originalHex) {
        const originalBytes = originalHex
          .split(" ")
          .filter((h) => h.length === 2);
        if (i < originalBytes.length) {
          const originalByte = originalBytes[i];
          if (originalByte) {
            bytes.push(parseInt(originalByte, 16));
            continue;
          }
        }
      }
      bytes.push(46); // ASCII code for "."
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
};

/**
 * Parse HTTP raw data into method, headers, and body
 * @param raw - Raw HTTP request/response string
 * @returns Parsed HTTP data or null if invalid
 */
export const parseHttpRaw = (raw: string) => {
  if (!raw) return null;

  const parts = raw.split("\r\n\r\n");
  if (parts.length < 2) return null;

  const headerSection = parts[0];
  const body = parts.slice(1).join("\r\n\r\n");

  const lines = headerSection?.split("\r\n") || [];
  const firstLine = lines[0];

  const methodMatch = firstLine?.match(/^(\w+)\s+/);
  const method = methodMatch ? methodMatch[1] : "UNKNOWN";

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      headers[name] = value;
    }
  }

  return { method, headers, body };
};

/**
 * Known file signatures (magic bytes)
 */
interface FileSignature {
  name: string;
  bytes: number[];
  offset?: number; // offset in body, default 0
}

const FILE_SIGNATURES: FileSignature[] = [
  // Images
  { name: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { name: "GIF87a", bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { name: "GIF89a", bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { name: "WebP", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { name: "BMP", bytes: [0x42, 0x4d] },
  { name: "ICO", bytes: [0x00, 0x00, 0x01, 0x00] },
  { name: "TIFF (BE)", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: "TIFF (LE)", bytes: [0x49, 0x49, 0x2a, 0x00] },
  // Documents / Archives
  { name: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: "ZIP", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "GZIP", bytes: [0x1f, 0x8b] },
  { name: "RAR", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { name: "7z", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: "TAR", bytes: [0x75, 0x73, 0x74, 0x61, 0x72], offset: 257 },
  // Executables
  { name: "ELF", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: "PE", bytes: [0x4d, 0x5a] },
  { name: "Mach-O (32)", bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: "Mach-O (64)", bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  // Other
  { name: "WASM", bytes: [0x00, 0x61, 0x73, 0x6d] },
  { name: "SQLite", bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00] },
  { name: "FLAC", bytes: [0x66, 0x4c, 0x61, 0x43] },
  { name: "OGG", bytes: [0x4f, 0x67, 0x67, 0x53] },
  { name: "MP3 (ID3)", bytes: [0x49, 0x44, 0x33] },
];

/**
 * Detect file signature (magic bytes) in a byte array
 * @param data - Uint8Array to check
 * @returns Detected file type name or null
 */
export const detectFileSignature = (data: Uint8Array): string | null => {
  if (data.length === 0) return null;

  for (const sig of FILE_SIGNATURES) {
    const offset = sig.offset || 0;
    if (data.length < offset + sig.bytes.length) continue;

    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (data[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      // Special check for WebP: bytes 8-11 must be "WEBP"
      if (sig.name === "WebP") {
        if (data.length < 12 || data[8] !== 0x57 || data[9] !== 0x45 || data[10] !== 0x42 || data[11] !== 0x50) {
          continue;
        }
      }
      return sig.name;
    }
  }

  return null;
};

/**
 * Format bytes in various programming-friendly formats
 */
export type CopyFormat = "raw-hex" | "spaced-hex" | "c-array" | "python-bytes" | "json-array" | "hexdump";

export const formatBytes = (bytes: Uint8Array, format: CopyFormat, bytesPerRow = 16): string => {
  if (bytes.length === 0) return "";

  switch (format) {
    case "raw-hex":
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    case "spaced-hex":
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    case "c-array":
      return Array.from(bytes).map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("");
    case "python-bytes":
      return "b'" + Array.from(bytes).map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("") + "'";
    case "json-array":
      return "[" + Array.from(bytes).join(", ") + "]";
    case "hexdump": {
      const lines: string[] = [];
      for (let i = 0; i < bytes.length; i += bytesPerRow) {
        const chunk = bytes.slice(i, i + bytesPerRow);
        const offset = i.toString(16).padStart(8, "0");
        const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        const ascii = Array.from(chunk).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
        lines.push(`${offset}  ${hex.padEnd(bytesPerRow * 3 - 1)}  ${ascii}`);
      }
      return lines.join("\n");
    }
  }
};

/**
 * Ensure proper CRLF line endings for HTTP protocol compliance
 * @param rawData - Raw string data
 * @returns String with CRLF line endings
 */
export const ensureCRLF = (rawData: string): string => {
  // Only convert standalone \n to \r\n (don't double-convert \r\n)
  return rawData.replace(/\r?\n/g, "\r\n");
};

/**
 * Find the start of the HTTP body (byte offset just past the first \r\n\r\n).
 * @param data - Uint8Array containing an HTTP message
 * @returns Byte offset of the body, or -1 if no boundary is found
 */
export const findHttpBodyOffset = (data: Uint8Array): number => {
  // Bail early if there's not enough room for the marker.
  if (data.length < 4) return -1;
  for (let i = 0; i <= data.length - 4; i++) {
    if (
      data[i] === 0x0d &&
      data[i + 1] === 0x0a &&
      data[i + 2] === 0x0d &&
      data[i + 3] === 0x0a
    ) {
      return i + 4;
    }
  }
  return -1;
};

/**
 * Truncate a string to a maximum number of UTF-8 bytes without splitting
 * multi-byte sequences or surrogate pairs. Returns the encoded bytes.
 *
 * Why: callers want a byte-bounded view of the data, but `String.prototype
 * .substring` slices by UTF-16 code units, which lets multi-byte UTF-8 chars
 * blow past the cap and risks splitting surrogate pairs.
 *
 * @param input - The source string
 * @param maxBytes - Maximum byte length; <= 0 disables truncation
 */
export const encodeUtf8WithLimit = (
  input: string,
  maxBytes: number,
): Uint8Array => {
  const encoder = new TextEncoder();
  if (maxBytes <= 0) return encoder.encode(input);

  // Fast path: assume ASCII and check after encoding once.
  const encoded = encoder.encode(input);
  if (encoded.length <= maxBytes) return encoded;

  // Walk back to the last UTF-8 sequence boundary.
  let end = maxBytes;
  while (end > 0 && (encoded[end]! & 0xc0) === 0x80) {
    end--;
  }
  return encoded.subarray(0, end);
};

/**
 * Sanitize a filename suggested by Content-Disposition or a URL path.
 * Strips path separators, control characters, and anything else that could
 * be used to escape the intended download location.
 */
export const sanitizeFilename = (input: string, fallback = "export.bin"): string => {
  // Drop CR/LF and other control chars, then strip path separators.
  let cleaned = input
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  // Disallow leading dots so we don't produce hidden files / parent references.
  cleaned = cleaned.replace(/^\.+/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  // Reasonable cap to avoid pathological values.
  return cleaned.slice(0, 255);
};

/**
 * Extract a download filename from a Content-Disposition header value.
 * Prefers RFC 5987 `filename*=UTF-8''...` when present, falls back to the
 * legacy `filename=` form, and sanitizes the result.
 */
export const parseContentDispositionFilename = (
  header: string,
): string | null => {
  // RFC 5987: filename*=UTF-8''<percent-encoded>
  const extMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (extMatch?.[1]) {
    const value = extMatch[1].trim();
    const parts = value.split("''");
    const encoded = parts.length === 2 ? parts[1] : value;
    if (encoded) {
      try {
        const decoded = decodeURIComponent(encoded);
        const sanitized = sanitizeFilename(decoded, "");
        if (sanitized) return sanitized;
      } catch {
        // Fall through to filename= handling on malformed percent-encoding.
      }
    }
  }

  // Legacy: filename="value" or filename=value
  const legacy = header.match(/filename\s*=\s*("([^"]*)"|'([^']*)'|([^;]+))/i);
  if (legacy) {
    const value = (legacy[2] ?? legacy[3] ?? legacy[4] ?? "").trim();
    const sanitized = sanitizeFilename(value, "");
    if (sanitized) return sanitized;
  }

  return null;
};
