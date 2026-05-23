<script setup lang="ts">
/**
 * HexViewMode Component
 * Displays HTTP requests/responses in hexadecimal format with editing capabilities
 * Ensures proper CRLF line endings for HTTP protocol compliance
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  hexToAscii,
  asciiToHex,
  parseHttpRaw,
  ensureCRLF,
  detectFileSignature,
  formatBytes,
  findHttpBodyOffset,
  encodeUtf8WithLimit,
  parseContentDispositionFilename,
  sanitizeFilename,
} from "../utils";
import type { CopyFormat } from "../utils";

const MAX_SIZE_OPTIONS = [
  { label: "10 KB", value: 10240 },
  { label: "50 KB", value: 51200 },
  { label: "100 KB", value: 102400 },
  { label: "Unlimited", value: 0 },
] as const;
const maxSizeBytes = ref(10240);

const BYTES_PER_ROW_OPTIONS = [8, 16, 32] as const;
const BYTE_GROUP_OPTIONS = [1, 2, 4, 8] as const;

const bytesPerRow = ref(16);
const byteGrouping = ref(1);

const columnWidths = reactive({ offset: 80, hex: 288, ascii: 160 });

let isResizing = false;
let currentColumn = "";
let startX = 0;
let startWidth = 0;

const startResize = (column: string, event: MouseEvent) => {
  isResizing = true;
  currentColumn = column;
  startX = event.clientX;
  startWidth = columnWidths[column as keyof typeof columnWidths];
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (event: MouseEvent) => {
  if (!isResizing) return;
  const deltaX = event.clientX - startX;
  columnWidths[currentColumn as keyof typeof columnWidths] = Math.max(
    50,
    startWidth + deltaX,
  );
};

const onMouseUp = () => {
  isResizing = false;
  currentColumn = "";
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};

// Reference to this component's root so we can scope keyboard shortcuts.
const rootRef = ref<HTMLElement | null>(null);

// Don't hijack Ctrl+F/Ctrl+G when the user is typing in an unrelated input
// (e.g. an editor elsewhere in the app). Inputs inside our own component
// are still allowed so the shortcut works while the search bar has focus.
const shouldHandleShortcut = (): boolean => {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  const tag = active.tagName;
  const editable =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (active as HTMLElement).isContentEditable === true;
  if (!editable) return true;
  return rootRef.value?.contains(active) ?? false;
};

// Keyboard shortcuts handler
const onKeydown = (e: KeyboardEvent) => {
  // Ctrl+F: Open search
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    if (!shouldHandleShortcut()) return;
    e.preventDefault();
    if (!searchState.showSearch) toggleSearch();
    return;
  }
  // Ctrl+G: Open go to offset
  if ((e.ctrlKey || e.metaKey) && e.key === "g") {
    if (!shouldHandleShortcut()) return;
    e.preventDefault();
    if (!gotoState.showGoto) toggleGoto();
    return;
  }
};

// Virtual scrolling
const ROW_HEIGHT = 24; // px per row
const OVERSCAN = 5; // extra rows to render above/below viewport
const scrollContainerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);

const totalRows = computed(() => dumpLines.value.length);
const totalHeight = computed(() => totalRows.value * ROW_HEIGHT);

const visibleRange = computed(() => {
  const containerHeight = scrollContainerRef.value?.clientHeight || 400;
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    totalRows.value,
    Math.ceil((scrollTop.value + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  return { start, end };
});

const visibleLines = computed(() => {
  const { start, end } = visibleRange.value;
  return dumpLines.value.slice(start, end).map((line, i) => ({
    ...line,
    _index: start + i,
    _ref: line, // keep reference to original for modal editing
  }));
});

const onScroll = (e: Event) => {
  scrollTop.value = (e.target as HTMLElement).scrollTop;
};

// Register keyboard shortcuts and global handlers
onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onDocumentClick, true);
});

// Clean up document-level event listeners on unmount
onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onDocumentClick, true);
});

const props = defineProps<{
  sdk: any;
  request?: any;
  response?: any;
}>();

// Modal state
const modalState = reactive({
  showModal: false,
  currentLine: null as {
    offset: string;
    hex: string;
    ascii: string;
    editing?: boolean;
  } | null,
  currentHex: "",
  originalHex: "",
  currentAscii: "",
  originalAscii: "",
});

// Search state
const searchState = reactive({
  query: "",
  mode: "hex" as "hex" | "ascii",
  matches: [] as { byteOffset: number; length: number }[],
  currentMatchIndex: -1,
  showSearch: false,
});

// Precomputed highlight set for O(1) lookup
const highlightedOffsets = ref(new Set<number>());

// Perform search on rawData
const performSearch = () => {
  searchState.matches = [];
  searchState.currentMatchIndex = -1;
  highlightedOffsets.value = new Set();

  const query = searchState.query.trim();
  if (!query || rawData.value.length === 0) return;

  let searchBytes: number[] = [];

  if (searchState.mode === "hex") {
    // Parse hex input: "FF D8 FF" or "ffd8ff"
    const cleaned = query.replace(/\s+/g, "");
    if (!/^[0-9a-fA-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) return;
    for (let i = 0; i < cleaned.length; i += 2) {
      searchBytes.push(parseInt(cleaned.substring(i, i + 2), 16));
    }
  } else {
    // ASCII mode
    const encoder = new TextEncoder();
    searchBytes = Array.from(encoder.encode(query));
  }

  if (searchBytes.length === 0) return;

  // Find all occurrences in rawData
  const data = rawData.value;
  const offsets = new Set<number>();
  for (let i = 0; i <= data.length - searchBytes.length; i++) {
    let found = true;
    for (let j = 0; j < searchBytes.length; j++) {
      if (data[i + j] !== searchBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      searchState.matches.push({
        byteOffset: i,
        length: searchBytes.length,
      });
      for (let j = 0; j < searchBytes.length; j++) {
        offsets.add(i + j);
      }
    }
  }
  highlightedOffsets.value = offsets;

  if (searchState.matches.length > 0) {
    searchState.currentMatchIndex = 0;
  }
};

// Navigate to next/previous match
const goToMatch = (direction: "next" | "prev") => {
  if (searchState.matches.length === 0) return;
  if (direction === "next") {
    searchState.currentMatchIndex =
      (searchState.currentMatchIndex + 1) % searchState.matches.length;
  } else {
    searchState.currentMatchIndex =
      (searchState.currentMatchIndex - 1 + searchState.matches.length) %
      searchState.matches.length;
  }
  scrollToCurrentMatch();
};

// Scroll virtual scroll container to center a given line index
const scrollToLine = (lineIndex: number) => {
  const container = scrollContainerRef.value;
  if (!container) return;
  const containerHeight = container.clientHeight;
  const targetTop = lineIndex * ROW_HEIGHT - containerHeight / 2 + ROW_HEIGHT / 2;
  container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  scrollTop.value = Math.max(0, targetTop);
};

const scrollToCurrentMatch = () => {
  if (searchState.currentMatchIndex < 0) return;
  const match = searchState.matches[searchState.currentMatchIndex];
  if (!match) return;
  const lineIndex = Math.floor(match.byteOffset / bytesPerRow.value);
  nextTick(() => scrollToLine(lineIndex));
};

// Check if a byte at a given global offset is part of any match (O(1) lookup)
const isHighlighted = (globalByteOffset: number): boolean => {
  return highlightedOffsets.value.has(globalByteOffset);
};

// Check if a byte is part of the current (focused) match
const isCurrentMatch = (globalByteOffset: number): boolean => {
  if (searchState.currentMatchIndex < 0) return false;
  const m = searchState.matches[searchState.currentMatchIndex];
  if (!m) return false;
  return globalByteOffset >= m.byteOffset && globalByteOffset < m.byteOffset + m.length;
};

// Toggle search bar
const toggleSearch = () => {
  searchState.showSearch = !searchState.showSearch;
  if (!searchState.showSearch) {
    searchState.query = "";
    searchState.matches = [];
    searchState.currentMatchIndex = -1;
  }
};

// Handle search input
const onSearchInput = () => {
  performSearch();
};

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    if (e.shiftKey) {
      goToMatch("prev");
    } else {
      goToMatch("next");
    }
    e.preventDefault();
  } else if (e.key === "Escape") {
    toggleSearch();
  }
};

// Go to offset state
const gotoState = reactive({
  showGoto: false,
  input: "",
  highlightedOffset: -1,
});

const goToOffset = () => {
  const input = gotoState.input.trim();
  if (!input) return;

  let offset: number;
  if (input.toLowerCase().startsWith("0x")) {
    offset = parseInt(input, 16);
  } else if (/[a-fA-F]/.test(input) && /^[0-9a-fA-F]+$/.test(input)) {
    // Contains hex letters (A-F), treat as hex
    offset = parseInt(input, 16);
  } else {
    offset = parseInt(input, 10);
  }

  if (isNaN(offset) || offset < 0 || offset >= rawData.value.length) {
    gotoState.highlightedOffset = -1;
    return;
  }

  gotoState.highlightedOffset = offset;
  const lineIndex = Math.floor(offset / bytesPerRow.value);
  nextTick(() => scrollToLine(lineIndex));
};

const toggleGoto = () => {
  gotoState.showGoto = !gotoState.showGoto;
  if (!gotoState.showGoto) {
    gotoState.input = "";
    gotoState.highlightedOffset = -1;
  }
};

const onGotoKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    goToOffset();
    e.preventDefault();
  } else if (e.key === "Escape") {
    toggleGoto();
  }
};

// Check if a byte is the go-to target
const isGotoHighlighted = (globalByteOffset: number): boolean => {
  return gotoState.highlightedOffset === globalByteOffset;
};

// Byte selection and data interpretation panel
const selectionState = reactive({
  start: -1,
  end: -1,
});

const selectedBytes = computed((): Uint8Array => {
  if (selectionState.start < 0 || selectionState.end < 0) return new Uint8Array();
  const s = Math.min(selectionState.start, selectionState.end);
  const e = Math.max(selectionState.start, selectionState.end);
  if (s >= rawData.value.length) return new Uint8Array();
  return rawData.value.slice(s, Math.min(e + 1, rawData.value.length));
});

const hasSelection = computed(() => selectedBytes.value.length > 0);

const onByteClick = (globalOffset: number, event: MouseEvent) => {
  if (event.shiftKey && selectionState.start >= 0) {
    selectionState.end = globalOffset;
  } else {
    selectionState.start = globalOffset;
    selectionState.end = globalOffset;
  }
};

const isSelected = (globalOffset: number): boolean => {
  if (selectionState.start < 0 || selectionState.end < 0) return false;
  const s = Math.min(selectionState.start, selectionState.end);
  const e = Math.max(selectionState.start, selectionState.end);
  return globalOffset >= s && globalOffset <= e;
};

const clearSelection = () => {
  selectionState.start = -1;
  selectionState.end = -1;
};

// Data interpretation computed
const dataInterpretation = computed(() => {
  const bytes = selectedBytes.value;
  if (bytes.length === 0) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Record<string, string> = {};

  // Int8 / UInt8
  if (bytes.length >= 1) {
    result["UInt8"] = view.getUint8(0).toString();
    result["Int8"] = view.getInt8(0).toString();
  }

  // Int16 / UInt16
  if (bytes.length >= 2) {
    result["UInt16 (BE)"] = view.getUint16(0, false).toString();
    result["UInt16 (LE)"] = view.getUint16(0, true).toString();
    result["Int16 (BE)"] = view.getInt16(0, false).toString();
    result["Int16 (LE)"] = view.getInt16(0, true).toString();
  }

  // Int32 / UInt32
  if (bytes.length >= 4) {
    result["UInt32 (BE)"] = view.getUint32(0, false).toString();
    result["UInt32 (LE)"] = view.getUint32(0, true).toString();
    result["Int32 (BE)"] = view.getInt32(0, false).toString();
    result["Int32 (LE)"] = view.getInt32(0, true).toString();
    result["Float32 (BE)"] = view.getFloat32(0, false).toString();
    result["Float32 (LE)"] = view.getFloat32(0, true).toString();
  }

  // Float64
  if (bytes.length >= 8) {
    result["Float64 (BE)"] = view.getFloat64(0, false).toString();
    result["Float64 (LE)"] = view.getFloat64(0, true).toString();
  }

  // Binary
  result["Binary"] = Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(2).padStart(8, "0"))
    .join(" ");

  // Encoding views
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    result["UTF-8"] = decoder.decode(bytes);
  } catch {
    result["UTF-8"] = "(invalid)";
  }

  // Base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  result["Base64"] = btoa(binary);

  // URL-encoded
  result["URL-encoded"] = Array.from(bytes)
    .map((b) => "%" + b.toString(16).padStart(2, "0").toUpperCase())
    .join("");

  return result;
});

// HTTP structure highlighting
const showStructureHighlight = ref(false);

// Find the header/body boundary offset in rawData
const httpBodyOffset = computed((): number => findHttpBodyOffset(rawData.value));

const getStructureClass = (globalOffset: number): string => {
  if (!showStructureHighlight.value || httpBodyOffset.value < 0) return "";
  if (globalOffset < httpBodyOffset.value) {
    return "bg-purple-500/15";
  }
  return "bg-emerald-500/15";
};

// Multi-format copy
const showCopyMenu = ref(false);

const getCopyBytes = (): Uint8Array => {
  return hasSelection.value ? selectedBytes.value : rawData.value;
};

const copyAs = async (format: CopyFormat) => {
  const bytes = getCopyBytes();
  if (bytes.length === 0) return;

  const text = formatBytes(bytes, format, bytesPerRow.value);

  try {
    await navigator.clipboard.writeText(text);
    props.sdk.window?.showToast?.("Copied to clipboard", { variant: "success" });
  } catch {
    props.sdk.window?.showToast?.("Failed to copy", { variant: "error" });
  }
  showCopyMenu.value = false;
};

// Close copy menu on outside click
const onDocumentClick = (e: MouseEvent) => {
  if (showCopyMenu.value) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-copy-menu]")) {
      showCopyMenu.value = false;
    }
  }
};

// Auto-suggest a filename in priority order: Content-Disposition,
// URL path basename, detected file signature, then a stable default.
const suggestExportFilename = (): string => {
  const fallback = "export.bin";

  if (parsedHttp.value?.headers) {
    const disposition =
      parsedHttp.value.headers["Content-Disposition"] ||
      parsedHttp.value.headers["content-disposition"];
    if (disposition) {
      const parsed = parseContentDispositionFilename(disposition);
      if (parsed) return parsed;
    }
  }

  const path: string = props.request?.path || "";
  if (path) {
    const lastSegment = path.split("/").filter(Boolean).pop();
    if (lastSegment) {
      // Drop query/fragment before sanitizing.
      const candidate = lastSegment.split(/[?#]/)[0] ?? "";
      if (candidate.includes(".")) {
        const sanitized = sanitizeFilename(candidate, "");
        if (sanitized) return sanitized;
      }
    }
  }

  if (detectedSignature.value) {
    const extMap: Record<string, string> = {
      PNG: "png", JPEG: "jpg", GIF87a: "gif", GIF89a: "gif",
      WebP: "webp", BMP: "bmp", PDF: "pdf", ZIP: "zip", GZIP: "gz",
    };
    const ext = extMap[detectedSignature.value];
    if (ext) return `export.${ext}`;
  }

  return fallback;
};

// Export raw binary data as file download
const exportBinary = () => {
  const bytes = hasSelection.value ? selectedBytes.value : rawData.value;
  if (bytes.length === 0) return;

  const filename = suggestExportFilename();
  // Copy into a fresh ArrayBuffer so the Blob doesn't retain a view into
  // the live rawData buffer (which could be replaced underneath us).
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Defer revoke past the synchronous click so the browser can start the
    // download. 1s is conservative; the blob is otherwise tiny in memory.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

// Edit mode removed, using per-line editing

// Get raw data from request or response
const raw = computed(() => {
  let rawData = "";
  if (isReplayTab.value && isRequest.value) {
    const editor = props.sdk.window?.getActiveEditor?.();
    if (editor) {
      const editorView = editor.getEditorView();
      if (editorView) {
        rawData = editorView.state.doc.toString();
      }
    }
  } else {
    rawData = props.request?.raw || props.response?.raw || "";
  }

  // Ensure proper HTTP line endings (CRLF) for requests
  if (rawData && isRequest.value) {
    rawData = ensureCRLF(rawData);
  }

  return rawData;
});

// Determine if it's a request or response
const isRequest = computed(() => !!props.request);

// Determine if it's in Replay tab (where editing is allowed)
const isReplayTab = computed(() => window.location.hash.includes("/replay"));

// Editing is only allowed for requests in the Replay tab
const isEditable = computed(() => isReplayTab.value && isRequest.value);

// Open modal for editing (only in editable context)
const openEditModal = (line: {
  offset: string;
  hex: string;
  ascii: string;
  editing?: boolean;
}) => {
  if (!isEditable.value) return;
  modalState.currentLine = line;
  modalState.currentHex = line.hex;
  modalState.originalHex = line.hex;
  modalState.currentAscii = hexToAscii(line.hex);
  modalState.originalAscii = hexToAscii(line.hex);
  modalState.showModal = true;
};


// Update hex when ASCII changes
const updateHexFromAscii = () => {
  modalState.currentHex = asciiToHex(modalState.currentAscii, modalState.originalHex);
};

// Update ASCII when hex changes
const updateAsciiFromHex = () => {
  modalState.currentAscii = hexToAscii(modalState.currentHex);
};

// Apply changes from modal
const applyEdit = () => {
  if (modalState.currentLine) {
    modalState.currentLine.hex = modalState.currentHex;
    updateLine(modalState.currentLine);
  }
  modalState.showModal = false;
};

// Close modal without saving
const cancelEdit = () => {
  modalState.showModal = false;
};


const parsedHttp = computed(() => {
  try {
    if (!raw.value) return null;
    return parseHttpRaw(raw.value);
  } catch (error) {
    console.error("[Hex View Mode] Error parsing HTTP raw:", error);
    return null;
  }
});

// Raw data as ref for editing
const rawData = ref<Uint8Array>(new Uint8Array());

// Initialize and watch for raw data changes
watch(
  [raw, maxSizeBytes],
  ([newRaw]) => {
    try {
      if (!newRaw) {
        rawData.value = new Uint8Array();
        return;
      }
      // Truncate by byte length (after UTF-8 encoding) so multi-byte chars
      // never blow past the cap or split surrogate pairs.
      rawData.value = encodeUtf8WithLimit(newRaw, maxSizeBytes.value);
    } catch (error) {
      console.error(
        "[Hex View Mode] Error converting raw to Uint8Array:",
        error,
      );
      rawData.value = new Uint8Array();
    }
  },
  { immediate: true },
);

// Detect file signature in the body of the HTTP data
const detectedSignature = computed(() => {
  if (rawData.value.length === 0) return null;
  const bodyStart = httpBodyOffset.value;
  const checkData =
    bodyStart > 0 ? rawData.value.subarray(bodyStart) : rawData.value;
  return detectFileSignature(checkData);
});

// Generate dump lines for table display
const dumpLines = ref<
  { offset: string; hex: string; ascii: string; editing?: boolean }[]
>([]);

// Update dump lines when rawData changes
watch(
  [rawData, bytesPerRow, byteGrouping],
  () => {
    const data = rawData.value;
    if (data.length === 0) {
      dumpLines.value = [
        {
          offset: "",
          hex: "",
          ascii: "No data to display",
          editing: false,
        },
      ];
      return;
    }

    const lines = [];
    for (let i = 0; i < data.length; i += bytesPerRow.value) {
      const chunk = data.slice(i, i + bytesPerRow.value);
      const offset = i.toString(16).padStart(8, "0");
      const hex = Array.from(chunk)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      const ascii = Array.from(chunk)
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
        .join("");
      lines.push({ offset, hex, ascii, editing: false });
    }
    dumpLines.value = lines;
  },
  { immediate: true },
);

// Re-run search when rawData changes (if search is active)
watch(rawData, () => {
  if (searchState.showSearch && searchState.query) {
    performSearch();
  }
});

// Update line and recalculate
const updateLine = (line: {
  offset: string;
  hex: string;
  ascii: string;
  editing?: boolean;
}) => {
  // Update ASCII from hex using shared utility
  line.ascii = hexToAscii(line.hex);

  // Reconstruct rawData
  const allHex = dumpLines.value
    .map((l) => l.hex)
    .join(" ")
    .replace(/\s+/g, "");
  const newBytes: number[] = [];
  for (let i = 0; i < allHex.length; i += 2) {
    const byte = parseInt(allHex.substring(i, i + 2), 16);
    if (!isNaN(byte)) newBytes.push(byte);
  }
  rawData.value = new Uint8Array(newBytes);
};

// Compare the displayed byte length against what `raw` would encode to.
// Using `raw` (normalized) keeps this aligned with the bytes actually shown.
const isTruncated = computed(() => {
  if (maxSizeBytes.value <= 0 || !raw.value) return false;
  const encoder = new TextEncoder();
  return encoder.encode(raw.value).length > maxSizeBytes.value;
});

// Calculate diff between original and current hex values
const hexDiff = computed(() => {
  const original = modalState.originalHex
    .split(" ")
    .filter((h) => h.length === 2);
  const current = modalState.currentHex
    .split(" ")
    .filter((h) => h.length === 2);
  const maxLength = Math.max(original.length, current.length);

  const diff: Array<{
    index: number;
    original: string;
    current: string;
    changed: boolean;
  }> = [];

  for (let i = 0; i < maxLength; i++) {
    const orig = original[i] || "";
    const curr = current[i] || "";
    diff.push({
      index: i,
      original: orig,
      current: curr,
      changed: orig !== curr,
    });
  }

  return diff;
});

// Edit mode is now controlled by double-click

// Save changes (for Replay tab only)
const saveChanges = async () => {
  if (!isRequest.value) return; // Only for requests
  if (!isReplayTab.value) return; // Only in Replay tab

  try {
    // Convert rawData back to string
    const decoder = new TextDecoder();
    const newRaw = decoder.decode(rawData.value);

    // Get the active editor and update its content
    const editor = props.sdk.window?.getActiveEditor?.();
    if (editor) {
      // Get the current editor view to update the content
      const editorView = editor.getEditorView();
      if (editorView) {
        // Replace the entire editor content with the modified raw data
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: newRaw,
          },
        });
      }
    }

    props.sdk.window?.showToast?.("Request updated successfully", {
      variant: "success",
    });
  } catch (error: unknown) {
    console.error("[Hex View Mode] Failed to update request:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    props.sdk.window?.showToast?.(`Failed to update request: ${errorMessage}`, {
      variant: "error",
    });
  }
};
</script>

<template>
  <div ref="rootRef" class="h-full flex flex-col bg-surface-800">
    <div class="h-full flex flex-col">
      <!-- Clean Action Toolbar -->
      <div
        class="flex items-center justify-between p-2 border-b border-surface-600"
      >
        <div class="flex items-center gap-2 text-surface-300">
          <i class="fas fa-hexagon text-primary-400"></i>
          <span
            class="text-xs bg-primary-600 text-primary-100 px-2 py-0.5 rounded"
            >{{ rawData.length }} bytes{{
              isTruncated ? " (truncated)" : ""
            }}</span
          >
          <span
            v-if="detectedSignature"
            class="text-xs bg-green-600 text-green-100 px-2 py-0.5 rounded"
            :title="'Detected file signature: ' + detectedSignature"
          >{{ detectedSignature }}</span>
        </div>
        <div class="flex gap-1">
          <button
            class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-surface-300"
            title="Search (Ctrl+F)"
            @click="toggleSearch"
          >
            <i class="fas fa-search"></i>
          </button>
          <button
            class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-surface-300"
            title="Go to offset (Ctrl+G)"
            @click="toggleGoto"
          >
            <i class="fas fa-map-marker-alt"></i>
          </button>
          <button
            :class="[
              'px-3 py-1 text-xs rounded hover:bg-surface-700',
              showStructureHighlight ? 'text-primary-400' : 'text-surface-300',
            ]"
            title="Toggle HTTP structure highlighting"
            @click="showStructureHighlight = !showStructureHighlight"
          >
            <i class="fas fa-layer-group"></i>
          </button>
          <div class="relative" data-copy-menu>
            <button
              class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-surface-300"
              title="Copy as..."
              @click="showCopyMenu = !showCopyMenu"
            >
              <i class="fas fa-copy"></i>
            </button>
            <div
              v-if="showCopyMenu"
              class="absolute right-0 top-full mt-1 bg-surface-800 border border-surface-600 rounded shadow-lg z-10 min-w-[180px]"
            >
              <button class="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700" @click="copyAs('raw-hex')">Raw hex</button>
              <button class="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700" @click="copyAs('spaced-hex')">Spaced hex</button>
              <button class="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700" @click="copyAs('c-array')">C array (\x...)</button>
              <button class="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700" @click="copyAs('python-bytes')">Python bytes</button>
              <button class="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700" @click="copyAs('json-array')">JSON array</button>
              <button class="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700" @click="copyAs('hexdump')">Hexdump</button>
            </div>
          </div>
          <select
            v-model.number="maxSizeBytes"
            class="bg-surface-700 text-surface-300 text-xs rounded px-1 py-0.5 border border-surface-600 outline-none"
            title="Max data size"
          >
            <option v-for="opt in MAX_SIZE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <select
            v-model.number="bytesPerRow"
            class="bg-surface-700 text-surface-300 text-xs rounded px-1 py-0.5 border border-surface-600 outline-none"
            title="Bytes per line"
          >
            <option v-for="opt in BYTES_PER_ROW_OPTIONS" :key="opt" :value="opt">{{ opt }}B/line</option>
          </select>
          <select
            v-model.number="byteGrouping"
            class="bg-surface-700 text-surface-300 text-xs rounded px-1 py-0.5 border border-surface-600 outline-none"
            title="Byte grouping"
          >
            <option v-for="opt in BYTE_GROUP_OPTIONS" :key="opt" :value="opt">{{ opt === 1 ? '1 byte' : opt + ' bytes' }}</option>
          </select>
          <button
            class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-surface-300"
            title="Export binary data"
            @click="exportBinary"
          >
            <i class="fas fa-download"></i>
          </button>
          <button
            v-if="isReplayTab && isRequest"
            class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-primary-400"
            title="Save Changes"
            @click="saveChanges"
          >
            <i class="fas fa-save"></i> Save
          </button>
        </div>
      </div>

      <!-- Search Bar -->
      <div
        v-if="searchState.showSearch"
        class="flex items-center gap-2 px-3 py-2 border-b border-surface-600 bg-surface-750"
      >
        <div class="flex items-center gap-1 text-xs">
          <button
            :class="[
              'px-2 py-0.5 rounded',
              searchState.mode === 'hex'
                ? 'bg-primary-600 text-primary-100'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600',
            ]"
            @click="searchState.mode = 'hex'; onSearchInput()"
          >
            HEX
          </button>
          <button
            :class="[
              'px-2 py-0.5 rounded',
              searchState.mode === 'ascii'
                ? 'bg-primary-600 text-primary-100'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600',
            ]"
            @click="searchState.mode = 'ascii'; onSearchInput()"
          >
            ASCII
          </button>
        </div>
        <input
          v-model="searchState.query"
          :placeholder="
            searchState.mode === 'hex'
              ? 'Search hex (e.g., FF D8 FF E0)'
              : 'Search ASCII (e.g., Content-Type)'
          "
          class="flex-1 bg-surface-900 text-surface-300 px-3 py-1 rounded border border-surface-600 text-xs font-mono outline-none focus:border-primary-500"
          @input="onSearchInput"
          @keydown="onSearchKeydown"
        />
        <div class="flex items-center gap-1">
          <span class="text-xs text-surface-400 min-w-[60px] text-center">
            <template v-if="searchState.matches.length > 0">
              {{ searchState.currentMatchIndex + 1 }}/{{ searchState.matches.length }}
            </template>
            <template v-else-if="searchState.query.trim()">
              No match
            </template>
          </span>
          <button
            class="px-2 py-0.5 text-xs rounded hover:bg-surface-600 text-surface-300 disabled:opacity-30"
            :disabled="searchState.matches.length === 0"
            title="Previous (Shift+Enter)"
            @click="goToMatch('prev')"
          >
            <i class="fas fa-chevron-up"></i>
          </button>
          <button
            class="px-2 py-0.5 text-xs rounded hover:bg-surface-600 text-surface-300 disabled:opacity-30"
            :disabled="searchState.matches.length === 0"
            title="Next (Enter)"
            @click="goToMatch('next')"
          >
            <i class="fas fa-chevron-down"></i>
          </button>
          <button
            class="px-2 py-0.5 text-xs rounded hover:bg-surface-600 text-surface-300"
            title="Close (Esc)"
            @click="toggleSearch"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Go to Offset Bar -->
      <div
        v-if="gotoState.showGoto"
        class="flex items-center gap-2 px-3 py-2 border-b border-surface-600 bg-surface-750"
      >
        <span class="text-xs text-surface-400">Go to offset:</span>
        <input
          v-model="gotoState.input"
          placeholder="Hex (0x0A3F) or decimal (2623)"
          class="flex-1 max-w-xs bg-surface-900 text-surface-300 px-3 py-1 rounded border border-surface-600 text-xs font-mono outline-none focus:border-primary-500"
          @keydown="onGotoKeydown"
        />
        <button
          class="px-3 py-0.5 text-xs rounded bg-primary-600 text-primary-100 hover:bg-primary-500"
          @click="goToOffset"
        >
          Go
        </button>
        <span
          v-if="gotoState.input.trim() && gotoState.highlightedOffset < 0"
          class="text-xs text-red-400"
        >
          Invalid offset
        </span>
        <button
          class="px-2 py-0.5 text-xs rounded hover:bg-surface-600 text-surface-300 ml-auto"
          title="Close (Esc)"
          @click="toggleGoto"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Content - Flexible height -->
      <div class="flex-1 min-h-0 p-2">
        <!-- Hex Dump Table with Virtual Scrolling -->
        <div
          ref="scrollContainerRef"
          class="h-full overflow-auto"
          @scroll="onScroll"
        >
          <div :style="{ height: totalHeight + 'px', position: 'relative' }">
            <table
              class="w-full text-xs font-mono bg-surface-900"
              :style="{ position: 'absolute', top: (visibleRange.start * ROW_HEIGHT) + 'px', width: '100%' }"
            >
              <tbody>
                <tr
                  v-for="line in visibleLines"
                  :key="line._index"
                  :data-hex-row="line._index"
                  :class="[
                    'hover:bg-surface-700',
                    getStructureClass(line._index * bytesPerRow),
                  ]"
                  :style="{ height: ROW_HEIGHT + 'px' }"
              >
                <td
                  class="px-2 py-1 text-surface-400 border-r border-surface-600 relative"
                  :style="{
                    width: columnWidths.offset + 'px',
                  }"
                >
                  {{ line.offset }}
                  <div
                    class="absolute right-0 top-0 bottom-0 w-1 bg-surface-600 cursor-col-resize"
                    @mousedown="startResize('offset', $event)"
                  ></div>
                </td>
                <td
                  class="px-2 py-1 border-r border-surface-600 relative"
                  :style="{ width: columnWidths.hex + 'px' }"
                  @dblclick="openEditModal(line._ref)"
                >
                  <span class="font-mono whitespace-pre" :class="isEditable ? 'cursor-pointer' : 'cursor-default'">
                    <template v-for="(byte, bIdx) in line.hex.split(' ')" :key="bIdx">
                      <span v-if="bIdx > 0">{{ bIdx % byteGrouping === 0 ? ' ' : '' }}</span>
                      <span
                        :class="{
                          'bg-yellow-500/30 text-yellow-200': isHighlighted(line._index * bytesPerRow + bIdx) && !isCurrentMatch(line._index * bytesPerRow + bIdx),
                          'bg-orange-500/50 text-orange-100': isCurrentMatch(line._index * bytesPerRow + bIdx),
                          'bg-cyan-500/50 text-cyan-100 ring-1 ring-cyan-400': isGotoHighlighted(line._index * bytesPerRow + bIdx),
                          'bg-blue-500/40 text-blue-100': isSelected(line._index * bytesPerRow + bIdx) && !isHighlighted(line._index * bytesPerRow + bIdx) && !isCurrentMatch(line._index * bytesPerRow + bIdx) && !isGotoHighlighted(line._index * bytesPerRow + bIdx),
                        }"
                        class="cursor-pointer"
                        @click.stop="onByteClick(line._index * bytesPerRow + bIdx, $event)"
                      >{{ byte }}</span>
                    </template>
                  </span>
                  <div
                    class="absolute right-0 top-0 bottom-0 w-1 bg-surface-600 cursor-col-resize"
                    @mousedown="startResize('hex', $event)"
                  ></div>
                </td>
                <td
                  class="px-2 py-1"
                  :style="{
                    width: columnWidths.ascii + 'px',
                  }"
                >
                  <span class="font-mono">
                    <template v-for="(char, cIdx) in line.ascii.split('')" :key="cIdx">
                      <span
                        :class="{
                          'text-surface-300': !isHighlighted(line._index * bytesPerRow + cIdx) && !isGotoHighlighted(line._index * bytesPerRow + cIdx) && !isSelected(line._index * bytesPerRow + cIdx),
                          'bg-yellow-500/30 text-yellow-200': isHighlighted(line._index * bytesPerRow + cIdx) && !isCurrentMatch(line._index * bytesPerRow + cIdx),
                          'bg-orange-500/50 text-orange-100': isCurrentMatch(line._index * bytesPerRow + cIdx),
                          'bg-cyan-500/50 text-cyan-100 ring-1 ring-cyan-400': isGotoHighlighted(line._index * bytesPerRow + cIdx),
                          'bg-blue-500/40 text-blue-100': isSelected(line._index * bytesPerRow + cIdx) && !isHighlighted(line._index * bytesPerRow + cIdx) && !isCurrentMatch(line._index * bytesPerRow + cIdx) && !isGotoHighlighted(line._index * bytesPerRow + cIdx),
                        }"
                        class="cursor-pointer"
                        @click.stop="onByteClick(line._index * bytesPerRow + cIdx, $event)"
                      >{{ char }}</span>
                    </template>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <!-- Data Interpretation Panel -->
      <div
        v-if="hasSelection && dataInterpretation"
        class="border-t border-surface-600 bg-surface-800 px-3 py-2 flex-shrink-0 max-h-40 overflow-auto"
      >
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-surface-400 font-medium">
            Data Inspector — {{ selectedBytes.length }} byte(s) selected
            (offset {{ Math.min(selectionState.start, selectionState.end).toString(16).padStart(8, "0") }})
          </span>
          <button
            class="text-xs text-surface-500 hover:text-surface-300 px-1"
            @click="clearSelection"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-0.5 text-xs font-mono">
          <div v-for="(value, key) in dataInterpretation" :key="key" class="flex justify-between gap-2">
            <span class="text-surface-500 whitespace-nowrap">{{ key }}:</span>
            <span class="text-surface-300 truncate" :title="value">{{ value }}</span>
          </div>
        </div>
      </div>

      <!-- Minimal Status Bar - Always at bottom -->
      <div
        class="flex items-center justify-between px-3 py-1.5 border-t border-surface-600 bg-surface-750 text-xs flex-shrink-0"
      >
        <div class="flex items-center gap-3 text-surface-400">
          <span class="flex items-center gap-1">
            <i class="fas fa-file"></i>
            {{ rawData.length }} bytes
          </span>
          <span v-if="hasSelection" class="flex items-center gap-1 text-blue-400">
            <i class="fas fa-mouse-pointer"></i>
            {{ Math.min(selectionState.start, selectionState.end).toString(16).padStart(8, "0") }}-{{ Math.max(selectionState.start, selectionState.end).toString(16).padStart(8, "0") }}
            ({{ selectedBytes.length }} bytes)
          </span>
        </div>
        <div class="text-primary-400 font-medium">HEX</div>
      </div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div
    v-if="modalState.showModal"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  >
    <div class="bg-surface-800 p-6 rounded-lg shadow-lg max-w-5xl w-full mx-4">
      <h3 class="text-lg font-semibold text-surface-200 mb-4">
        Edit Hex Values
      </h3>

      <!-- Hex Input -->
      <div class="mb-4">
        <label class="block text-sm text-surface-300 mb-2">Editor:</label>
        <textarea
          v-model="modalState.currentHex"
          class="w-full h-32 bg-surface-900 text-surface-300 p-3 rounded border border-surface-600 font-mono text-sm resize-none"
          placeholder="Enter hex values (e.g., 48 65 6c 6c 6f)"
          @input="updateAsciiFromHex"
        ></textarea>
      </div>

      <!-- Three Column Layout: Original, Diff, ASCII Preview -->
      <div class="grid grid-cols-3 gap-4 mb-4">
        <!-- Original Hex -->
        <div>
          <label class="block text-sm text-surface-300 mb-2">Original:</label>
          <div
            class="bg-surface-900 text-surface-400 p-3 rounded border border-surface-600 font-mono text-sm h-48 overflow-auto"
          >
            {{ modalState.originalHex }}
          </div>
        </div>

        <!-- Diff Display -->
        <div>
          <label class="block text-sm text-surface-300 mb-2">Changes:</label>
          <div
            class="bg-surface-900 p-3 rounded border border-surface-600 h-48 overflow-auto"
          >
            <div
              v-if="hexDiff.some((d) => d.changed)"
              class="flex flex-wrap gap-1 font-mono text-xs"
            >
              <template v-for="item in hexDiff" :key="item.index">
                <span
                  v-if="item.changed"
                  class="inline-flex flex-col items-center"
                >
                  <span class="text-red-400 line-through">{{
                    item.original || "  "
                  }}</span>
                  <span class="text-green-400">{{ item.current || "  " }}</span>
                </span>
                <span v-else class="text-surface-500">{{ item.original }}</span>
              </template>
            </div>
            <p v-else class="text-sm text-surface-400 italic">
              No changes detected
            </p>
          </div>
        </div>

        <!-- ASCII Preview (Editable) -->
        <div>
          <label class="block text-sm text-surface-300 mb-2"
            >ASCII Preview:</label
          >
          <textarea
            v-model="modalState.currentAscii"
            class="w-full h-48 bg-surface-900 text-surface-300 p-3 rounded border border-surface-600 font-mono text-sm resize-none"
            placeholder="ASCII representation"
            @input="updateHexFromAscii"
          ></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="px-4 py-2 text-sm rounded bg-surface-600 text-surface-300 hover:bg-surface-500"
          @click="cancelEdit"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm rounded bg-primary-600 text-primary-100 hover:bg-primary-500"
          @click="applyEdit"
        >
          OK
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
table {
  border-collapse: collapse;
}
/* Additional styles if needed */
</style>
