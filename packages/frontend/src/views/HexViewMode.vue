<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
    sdk: any;
    request?: any;
    response?: any;
}>();

const editMode = ref(false);

// Get raw data from request or response
const raw = computed(() => props.request?.raw || props.response?.raw || "");

// Determine if it's a request or response
const isRequest = computed(() => !!props.request);

// Determine if it's in Replay tab (where editing is allowed)
const isReplayTab = computed(() => window.location.hash.includes("/replay"));

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

// Editable hex string for edit mode
const editableHex = ref("");

// Initialize and watch for raw data changes
watch(
    raw,
    (newRaw) => {
        try {
            if (!newRaw) {
                rawData.value = new Uint8Array();
                editableHex.value = "";
                return;
            }

            // Size limit: 10KB
            const maxSize = 10240;
            const rawStr =
                newRaw.length > maxSize ? newRaw.substring(0, maxSize) : newRaw;

            // Assuming raw is UTF-8 encoded string, convert to Uint8Array
            const encoder = new TextEncoder();
            rawData.value = encoder.encode(rawStr);

            // Update editable hex
            editableHex.value = Array.from(rawData.value)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
        } catch (error) {
            console.error(
                "[Hex View Mode] Error converting raw to Uint8Array:",
                error,
            );
            rawData.value = new Uint8Array();
            editableHex.value = "";
        }
    },
    { immediate: true },
);

// Update rawData from editable hex
const updateFromHex = () => {
    try {
        const hex = editableHex.value.replace(/\s+/g, "");
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (isNaN(byte)) continue;
            bytes.push(byte);
        }
        rawData.value = new Uint8Array(bytes);
    } catch (error) {
        console.error("[Hex View Mode] Error parsing hex string:", error);
    }
};

// Generate Hex Dump
const hexDump = computed(() => {
    const data = rawData.value;
    if (data.length === 0) return "No data to display";

    let result = "";
    for (let i = 0; i < data.length; i += 16) {
        const chunk = data.slice(i, i + 16);
        const offset = i.toString(16).padStart(8, "0");
        const hex = Array.from(chunk)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
        const ascii = Array.from(chunk)
            .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
            .join("");
        result += `${offset}  ${hex.padEnd(48)}  ${ascii}\n`;
    }
    return result;
});

// Check if data is truncated
const isTruncated = computed(() => {
    const raw = props?.request?.raw;
    return raw && raw.length > 10240;
});

// Toggle edit mode
const toggleEditMode = () => {
    editMode.value = !editMode.value;
};

// Save changes (for Reply tab only)
const saveChanges = async () => {
    if (!isRequest.value) return; // Only for requests

    try {
        // Convert rawData back to string
        const decoder = new TextDecoder();
        const newRaw = decoder.decode(rawData.value);

        // Update the request via SDK (assuming API exists)
        // This is a placeholder - actual implementation depends on Caido SDK
        if (props.sdk?.replay?.updateRequest) {
            await props.sdk.replay.updateRequest(props.request.id, newRaw);
            props.sdk.window?.showToast?.("Request updated successfully", {
                variant: "success",
            });
        } else {
            props.sdk.window?.showToast?.(
                "Update not supported in this context",
                { variant: "warning" },
            );
        }
    } catch (error) {
        props.sdk.window?.showToast?.("Failed to update request", {
            variant: "error",
        });
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
                    <button
                        class="px-3 py-1 text-xs rounded hover:bg-surface-700 text-surface-300"
                        @click="toggleEditMode"
                        :title="
                            editMode
                                ? 'Switch to Dump View'
                                : 'Switch to Edit Mode'
                        "
                    >
                        <i :class="editMode ? 'fas fa-eye' : 'fas fa-edit'"></i>
                        {{ editMode ? "Dump" : "Edit" }}
                    </button>
                </div>
            </div>

            <!-- Content - Flexible height -->
            <div class="flex-1 min-h-0 overflow-auto p-2">
                <!-- Hex Editor Mode -->
                <div v-if="editMode" class="h-full">
                    <textarea
                        v-model="editableHex"
                        @input="updateFromHex"
                        class="w-full h-full bg-surface-900 p-3 rounded text-xs text-surface-300 font-mono resize-none border border-surface-600"
                        placeholder="Enter hex values (e.g., 48 65 6c 6c 6f)"
                    ></textarea>
                </div>

                <!-- Hex Dump Mode -->
                <div v-else class="h-full">
                    <pre
                        class="bg-surface-900 p-3 rounded text-xs text-surface-300 font-mono whitespace-pre overflow-auto h-full"
                        >{{ hexDump }}</pre
                    >
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
</template>

<style scoped>
/* Additional styles if needed */
</style>
