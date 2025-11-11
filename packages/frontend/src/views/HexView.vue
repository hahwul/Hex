<script setup lang="ts">
import { HexEditor } from "../HexEditor";
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
    modelValue: Uint8Array;
    isEditable: boolean;
}>();

const emit = defineEmits(["update:modelValue"]);

const hexEditorRef = ref<HTMLElement | null>(null);
let hexEditor: HexEditor | null = null;

onMounted(() => {
    if (hexEditorRef.value) {
        hexEditor = new HexEditor(
            hexEditorRef.value,
            props.modelValue,
            props.isEditable,
        );

        if (props.isEditable) {
            hexEditor.addEventListener("change", (event: Event) => {
                const customEvent = event as CustomEvent<Uint8Array>;
                emit("update:modelValue", customEvent.detail);
            });
        }
    }
});

watch(
    () => props.modelValue,
    (newValue) => {
        if (hexEditor) {
            hexEditor.setData(newValue);
        }
    },
);

watch(
    () => props.isEditable,
    (newIsEditable) => {
        if (hexEditor) {
            hexEditor.setEditable(newIsEditable);
        }
    },
);
</script>

<template>
    <div ref="hexEditorRef" class="hex-editor-container"></div>
</template>

<style scoped>
.hex-editor-container {
    height: 100%;
    width: 100%;
}
</style>
