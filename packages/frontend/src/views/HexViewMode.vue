<script setup lang="ts">
/**
 * HexViewMode Component
 * Displays HTTP requests/responses in hexadecimal format with editing capabilities
 * Ensures proper CRLF line endings for HTTP protocol compliance
 */
import { computed, reactive, ref, watch } from "vue";

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
    // HTTP protocol requires \r\n line endings, but editors may normalize to \n
    if (rawData && isRequest.value) {
        // Only convert standalone \n to \r\n (don't double-convert \r\n)
        rawData = rawData.replace(/\r?\n/g, '\r\n');
    }
    
    return rawData;
});

// Determine if it's a request or response
const isRequest = computed(() => !!props.request);

// Determine if it's in Replay tab (where editing is allowed)
const isReplayTab = computed(() => window.location.hash.includes("/replay"));

// Open modal for editing
const openEditModal = (line: {
    offset: string;
    hex: string;
    ascii: string;
    editing?: boolean;
}) => {
    modalState.currentLine = line;
    modalState.currentHex = line.hex;
    modalState.originalHex = line.hex;
    modalState.currentAscii = hexToAscii(line.hex);
    modalState.originalAscii = hexToAscii(line.hex);
    modalState.showModal = true;
};

// Convert hex string to ASCII string
const hexToAscii = (hex: string): string => {
    const hexParts = hex.split(" ").filter((h) => h.length === 2);
    const bytes = hexParts.map((h) => parseInt(h, 16)).filter((b) => !isNaN(b));
    return bytes
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
        .join("");
};

// Convert ASCII string to hex string
const asciiToHex = (ascii: string): string => {
    const bytes: number[] = [];
    for (let i = 0; i < ascii.length; i++) {
        const char = ascii[i];
        if (!char) continue; // Skip undefined characters
        if (char === ".") {
            // Keep original byte for "." placeholders if available
            const originalBytes = modalState.originalHex
                .split(" ")
                .filter((h) => h.length === 2);
            if (i < originalBytes.length) {
                const originalByte = originalBytes[i];
                if (originalByte) {
                    bytes.push(parseInt(originalByte, 16));
                }
            } else {
                bytes.push(46); // ASCII code for "."
            }
        } else {
            bytes.push(char.charCodeAt(0));
        }
    }
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
};

// Update hex when ASCII changes
const updateHexFromAscii = () => {
    modalState.currentHex = asciiToHex(modalState.currentAscii);
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

// Parse HTTP raw data
const parseHttpRaw = (raw: string) => {
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
    raw,
    (newRaw) => {
        try {
            if (!newRaw) {
                rawData.value = new Uint8Array();
                return;
            }

            // Size limit: 10KB
            const maxSize = 10240;
            const rawStr =
                newRaw.length > maxSize ? newRaw.substring(0, maxSize) : newRaw;

            // Assuming raw is UTF-8 encoded string, convert to Uint8Array
            const encoder = new TextEncoder();
            rawData.value = encoder.encode(rawStr);
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

// Generate dump lines for table display
const dumpLines = ref<
    { offset: string; hex: string; ascii: string; editing?: boolean }[]
>([]);

// Update dump lines when rawData changes
watch(
    rawData,
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
        for (let i = 0; i < data.length; i += 16) {
            const chunk = data.slice(i, i + 16);
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

// Update line and recalculate
const updateLine = (line: {
    offset: string;
    hex: string;
    ascii: string;
    editing?: boolean;
}) => {
    // Update ASCII
    const hexParts = line.hex.split(" ").filter((h) => h.length === 2);
    const bytes = hexParts.map((h) => parseInt(h, 16)).filter((b) => !isNaN(b));
    line.ascii = bytes
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
        .join("");

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

// Check if data is truncated
const isTruncated = computed(() => {
    const raw = props?.request?.raw;
    return raw && raw.length > 10240;
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
        props.sdk.window?.showToast?.(
            `Failed to update request: ${errorMessage}`,
            {
                variant: "error",
            },
        );
    }
};
</script>

<template>
    <div class="h-full flex flex-col bg-surface-800">
        <div class="h-full flex flex-col">
            <!-- Clean Action Toolbar -->
            <div
                class="flex items-center justify-between p-2 border-b border-surface-600"
            >
                <div class="flex items-center gap-2 text-surface-300">
                    <i class="fas fa-hexagon text-primary-400"></i>
                    <span class="text-sm font-medium"
                        >{{
                            isRequest ? parsedHttp?.method || "GET" : "Response"
                        }}
                        {{
                            props.request?.host ||
                            props.response?.host ||
                            "unknown"
                        }}{{ props.request?.path || "/" }}</span
                    >
                    <span
                        class="text-xs bg-primary-600 text-primary-100 px-2 py-0.5 rounded"
                        >{{ rawData.length }} bytes{{
                            isTruncated ? " (truncated)" : ""
                        }}</span
                    >
                </div>
                <div v-if="isReplayTab" class="flex gap-1">
                    <button
                        v-if="isRequest"
                        class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-primary-400"
                        @click="saveChanges"
                        title="Save Changes"
                    >
                        <i class="fas fa-save"></i> Save
                    </button>
                </div>
            </div>

            <!-- Content - Flexible height -->
            <div class="flex-1 min-h-0 overflow-auto p-2">
                <!-- Hex Dump Table -->
                <div class="h-full overflow-auto">
                    <table class="w-full text-xs font-mono bg-surface-900">
                        <tbody>
                            <tr
                                v-for="(line, index) in dumpLines"
                                :key="index"
                                class="hover:bg-surface-700"
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
                                        @mousedown="
                                            startResize('offset', $event)
                                        "
                                    ></div>
                                </td>
                                <td
                                    class="px-2 py-1 border-r border-surface-600 relative"
                                    :style="{ width: columnWidths.hex + 'px' }"
                                >
                                    <input
                                        :value="line.hex"
                                        readonly
                                        @dblclick="openEditModal(line)"
                                        class="w-full bg-transparent text-surface-300 border-none outline-none cursor-pointer"
                                    />
                                    <div
                                        class="absolute right-0 top-0 bottom-0 w-1 bg-surface-600 cursor-col-resize"
                                        @mousedown="startResize('hex', $event)"
                                    ></div>
                                </td>
                                <td
                                    class="px-2 py-1 text-surface-300"
                                    :style="{
                                        width: columnWidths.ascii + 'px',
                                    }"
                                >
                                    {{ line.ascii }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Minimal Status Bar - Always at bottom -->
            <div
                class="flex items-center justify-between px-3 py-1.5 border-t border-surface-600 bg-surface-750 text-xs flex-shrink-0"
            >
                <div class="flex items-center gap-3 text-surface-400">
                    <span class="flex items-center gap-1">
                        <i class="fas fa-server"></i>
                        {{
                            props.request?.host ||
                            props.response?.host ||
                            "unknown"
                        }}
                    </span>
                    <span class="flex items-center gap-1">
                        <i class="fas fa-file"></i>
                        {{ rawData.length }} bytes
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
        <div
            class="bg-surface-800 p-6 rounded-lg shadow-lg max-w-5xl w-full mx-4"
        >
            <h3 class="text-lg font-semibold text-surface-200 mb-4">
                Edit Hex Values
            </h3>

            <!-- Hex Input -->
            <div class="mb-4">
                <label class="block text-sm text-surface-300 mb-2"
                    >Editor:</label
                >
                <textarea
                    v-model="modalState.currentHex"
                    @input="updateAsciiFromHex"
                    class="w-full h-32 bg-surface-900 text-surface-300 p-3 rounded border border-surface-600 font-mono text-sm resize-none"
                    placeholder="Enter hex values (e.g., 48 65 6c 6c 6f)"
                ></textarea>
            </div>

            <!-- Three Column Layout: Original, Diff, ASCII Preview -->
            <div class="grid grid-cols-3 gap-4 mb-4">
                <!-- Original Hex -->
                <div>
                    <label class="block text-sm text-surface-300 mb-2"
                        >Original:</label
                    >
                    <div
                        class="bg-surface-900 text-surface-400 p-3 rounded border border-surface-600 font-mono text-sm h-48 overflow-auto"
                    >
                        {{ modalState.originalHex }}
                    </div>
                </div>

                <!-- Diff Display -->
                <div>
                    <label class="block text-sm text-surface-300 mb-2"
                        >Changes:</label
                    >
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
                                    <span class="text-green-400">{{
                                        item.current || "  "
                                    }}</span>
                                </span>
                                <span v-else class="text-surface-500">{{
                                    item.original
                                }}</span>
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
                        @input="updateHexFromAscii"
                        class="w-full h-48 bg-surface-900 text-surface-300 p-3 rounded border border-surface-600 font-mono text-sm resize-none"
                        placeholder="ASCII representation"
                    ></textarea>
                </div>
            </div>

            <div class="flex justify-end gap-2">
                <button
                    @click="cancelEdit"
                    class="px-4 py-2 text-sm rounded bg-surface-600 text-surface-300 hover:bg-surface-500"
                >
                    Cancel
                </button>
                <button
                    @click="applyEdit"
                    class="px-4 py-2 text-sm rounded bg-primary-600 text-primary-100 hover:bg-primary-500"
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
