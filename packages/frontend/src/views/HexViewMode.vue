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
const dumpLines = ref<{ offset: string; hex: string; ascii: string }[]>([]);

// Update dump lines when rawData changes
watch(
    rawData,
    () => {
        const data = rawData.value;
        if (data.length === 0) {
            dumpLines.value = [
                { offset: "", hex: "", ascii: "No data to display" },
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
            lines.push({ offset, hex, ascii });
        }
        dumpLines.value = lines;
    },
    { immediate: true },
);

// Update line and recalculate
const updateLine = (line: { offset: string; hex: string; ascii: string }) => {
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
        const byte = parseInt(allHex.substr(i, 2), 16);
        if (!isNaN(byte)) newBytes.push(byte);
    }
    rawData.value = new Uint8Array(newBytes);
};

// Check if data is truncated
const isTruncated = computed(() => {
    const raw = props?.request?.raw;
    return raw && raw.length > 10240;
});

// Edit mode is now controlled by checkbox

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
                    <label
                        class="flex items-center gap-2 px-3 py-1 text-xs text-surface-300"
                    >
                        <input
                            type="checkbox"
                            v-model="editMode"
                            class="rounded border-surface-600 bg-surface-800"
                        />
                        Enable Editing
                    </label>
                </div>
            </div>

            <!-- Content - Flexible height -->
            <div class="flex-1 min-h-0 overflow-auto p-2">
                <!-- Hex Dump Table -->
                <div class="h-full overflow-auto">
                    <table class="w-full text-xs font-mono bg-surface-900">
                        <tbody>
                            <tr v-for="(line, index) in dumpLines" :key="index">
                                <td class="px-2 py-1 text-surface-400">
                                    {{ line.offset }}
                                </td>
                                <td class="px-2 py-1">
                                    <input
                                        v-model="line.hex"
                                        :readonly="!editMode"
                                        @input="updateLine(line)"
                                        class="w-full bg-transparent text-surface-300 border-none outline-none"
                                        :class="{ 'cursor-pointer': editMode }"
                                    />
                                </td>
                                <td class="px-2 py-1 text-surface-300">
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
</template>

<style scoped>
/* Additional styles if needed */
</style>
