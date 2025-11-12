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
 * Ensure proper CRLF line endings for HTTP protocol compliance
 * @param rawData - Raw string data
 * @returns String with CRLF line endings
 */
export const ensureCRLF = (rawData: string): string => {
  // Only convert standalone \n to \r\n (don't double-convert \r\n)
  return rawData.replace(/\r?\n/g, "\r\n");
};
