Hex/packages/frontend/src/views/HexViewMode.vue
<script setup lang="ts">
import { computed, ref } from "vue";
import HexView from "./HexView.vue";

const props = defineProps<{
    sdk: any;
    request: any;
}>();

const activeTab = ref(0);

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
        if (!props?.request?.raw) return null;
        return parseHttpRaw(props.request.raw);
    } catch (error) {
        console.error("[Hex View Mode] Error parsing HTTP raw:", error);
        return null;
    }
});

// Convert body to Uint8Array for hex viewing
const bodyData = computed(() => {
    try {
        const parsed = parsedHttp.value;
        if (!parsed?.body) return new Uint8Array();

        // Assuming body is UTF-8 encoded string, convert to Uint8Array
        const encoder = new TextEncoder();
        return encoder.encode(parsed.body);
    } catch (error) {
        console.error(
            "[Hex View Mode] Error converting body to Uint8Array:",
            error,
        );
        return new Uint8Array();
    }
});

// Check if this request has a body
const hasBody = computed(() => {
    return bodyData.value.length > 0;
});

// Check for important headers (similar to JWT)
const hasImportantHeaders = computed(() => {
    try {
        if (!parsedHttp.value?.headers) return false;
        const importantHeaders = [
            "content-type",
            "content-length",
            "transfer-encoding",
        ];
        return Object.keys(parsedHttp.value.headers).some((key) => {
            if (typeof key !== "string") return false;
            return importantHeaders.some((important) =>
                key.toLowerCase().includes(important),
            );
        });
    } catch (error) {
        return false;
    }
});
</script>

<template>
    <div class="h-full flex flex-col bg-surface-800">
        <div v-if="hasBody" class="h-full flex flex-col">
            <!-- Clean Action Toolbar -->
            <div
                class="flex items-center justify-between p-2 border-b border-surface-600"
            >
                <div class="flex items-center gap-2 text-surface-300">
                    <i class="fas fa-hexagon text-primary-400"></i>
                    <span class="text-sm font-medium"
                        >{{ parsedHttp?.method || "GET" }}
                        {{ props.request?.host || "unknown"
                        }}{{ props.request?.path || "/" }}</span
                    >
                    <span
                        class="text-xs bg-primary-600 text-primary-100 px-2 py-0.5 rounded"
                        >{{ bodyData.length }} bytes</span
                    >
                </div>
            </div>

            <!-- Simple Tab Navigation -->
            <div class="border-b border-surface-600">
                <div class="flex">
                    <button
                        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                        :class="
                            activeTab === 0
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-surface-400 hover:text-surface-200'
                        "
                        @click="activeTab = 0"
                    >
                        Hex View
                    </button>
                    <button
                        v-if="hasImportantHeaders"
                        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                        :class="
                            activeTab === 1
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-surface-400 hover:text-surface-200'
                        "
                        @click="activeTab = 1"
                    >
                        Headers
                    </button>
                </div>
            </div>

            <!-- Tab Content - Flexible height -->
            <div class="flex-1 min-h-0 overflow-auto p-2">
                <!-- Hex View Tab -->
                <div v-if="activeTab === 0" class="h-full">
                    <HexView :modelValue="bodyData" :isEditable="false" />
                </div>

                <!-- Headers Tab -->
                <div
                    v-if="activeTab === 1 && hasImportantHeaders"
                    class="space-y-2"
                >
                    <div
                        v-for="(value, name) in parsedHttp?.headers"
                        :key="String(name)"
                        v-show="
                            typeof name === 'string' &&
                            [
                                'content-type',
                                'content-length',
                                'transfer-encoding',
                            ].some((h) =>
                                String(name).toLowerCase().includes(h),
                            )
                        "
                        class="border border-surface-600 rounded p-3 bg-surface-900"
                    >
                        <div class="flex items-center justify-between mb-2">
                            <span
                                class="text-sm font-medium text-surface-200"
                                >{{ name }}</span
                            >
                        </div>
                        <pre
                            class="bg-surface-800 p-2 rounded text-xs text-surface-300 break-all font-mono"
                            >{{ value }}</pre
                        >
                    </div>
                </div>
            </div>

            <!-- Minimal Status Bar - Always at bottom -->
            <div
                class="flex items-center justify-between px-3 py-1.5 border-t border-surface-600 bg-surface-750 text-xs flex-shrink-0"
            >
                <div class="flex items-center gap-3 text-surface-400">
                    <span class="flex items-center gap-1">
                        <i class="fas fa-server"></i>
                        {{ props.request?.host || "unknown" }}
                    </span>
                    <span class="flex items-center gap-1">
                        <i class="fas fa-file"></i>
                        {{ bodyData.length }} bytes
                    </span>
                </div>
                <div class="text-primary-400 font-medium">HEX</div>
            </div>
        </div>

        <!-- No Body Found State -->
        <div
            v-else
            class="h-full flex flex-col items-center justify-center text-center p-4"
        >
            <div class="text-surface-400 mb-4">
                <i class="fas fa-hexagon text-4xl mb-3"></i>
            </div>
            <h3 class="text-lg font-semibold text-surface-200 mb-2">
                No Body Data Found
            </h3>
            <p class="text-surface-400 text-sm max-w-md">
                This request doesn't appear to contain any body data to display
                in hex format.
            </p>
        </div>
    </div>
</template>

<style scoped>
/* Additional styles if needed */
</style>
