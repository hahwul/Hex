# Changelog

All notable changes to **Hex** will be documented in this file.

## [0.2.0] - 2026-03-14

### Added
- Byte pattern search in Hex view (#18)
  - Search input field in the toolbar with toggle button
  - Hex pattern search (e.g., `FF D8 FF E0`)
  - ASCII string search (e.g., `Content-Type`)
  - Highlight all matching occurrences in hex and ASCII columns
  - Navigate between matches with Next/Previous buttons
  - Keyboard shortcuts: Enter (next), Shift+Enter (previous), Escape (close)
  - Match count display
- Go to offset navigation (#19)
  - Input field accepting hex offset (`0x0A3F`) or decimal offset
  - Scroll to and highlight the target byte at the offset
  - Keyboard support: Enter to go, Escape to close
- Multi-format data interpretation panel (#20)
  - Click to select bytes, Shift+click for range selection
  - Int8/16/32, UInt8/16/32 (Big/Little Endian) interpretations
  - Float32, Float64 interpretations
  - Binary representation
  - UTF-8, Base64, URL-encoded views
  - Selection count in status bar
- Magic bytes / file signature detection (#21)
  - Auto-detect file formats (PNG, JPEG, GIF, WebP, PDF, ZIP, GZIP, ELF, PE, SQLite, etc.)
  - Display detected type as badge in toolbar
  - Detects signatures in HTTP body (after headers)
- Byte range selection with synchronized highlighting (#22)
  - Click and Shift+Click to select byte ranges
  - Synchronized highlighting across Hex and ASCII columns
  - Selection info (start/end offset, byte count) in status bar
- HTTP header/body structure highlighting (#23)
  - Toggle button to visually distinguish header (purple) and body (green) regions
  - Auto-detects `\r\n\r\n` boundary
- Multi-format copy support (#24)
  - Copy as: Raw hex, Spaced hex, C array, Python bytes, JSON array, Hexdump
  - Works with selected bytes or entire data
  - Dropdown menu in toolbar
- Export raw binary data as file download (#25)
  - Download button in toolbar
  - Auto-suggest filename from URL path, Content-Disposition header, or file signature
  - Supports exporting selected range only
- Configurable bytes per line — 8/16/32 (#27)
- Byte grouping display option — 1/2/4/8 bytes (#28)
- Configurable data size limit — 10KB/50KB/100KB/Unlimited (#29)
- Response view mode support for all SDK modules (#30)
- Keyboard shortcuts (#31)
  - Ctrl+F: Open search, Ctrl+G: Go to offset
- Virtual scrolling for large data support (#32)
  - Only renders visible rows for improved performance
  - Enables handling of larger payloads efficiently

## [0.1.4] - 2025-11-19

### Added
- Comprehensive test infrastructure with Vitest (#7)
  - Unit tests for `HexEditor` and utility functions
  - Extracted reusable utilities into `utils.ts`
  - Vitest configuration for frontend package
- Branch verification step in release workflow

### Changed
- Updated `.gitignore` for test coverage artifacts

## [0.1.3] - 2025-11-11

### Changed
- Replaced `js-hex-editor` dependency with custom `HexEditor` implementation
- Removed `@caido/primevue` and `primevue` from frontend dependencies

## [0.1.2] - 2025-11-11

### Removed
- Backend package entirely (`packages/backend`) — plugin is now frontend-only

## [0.1.1] - 2025-11-11

### Changed
- Set plugin config id to `hex`

## [0.1.0] - 2025-11-10

Initial release.
