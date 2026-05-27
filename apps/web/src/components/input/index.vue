<script setup lang="ts">
import { computed, ref } from "vue";
import { Switch } from "@/components/ui/switch";
import { Send, Paperclip, X } from "lucide-vue-next";

const props = defineProps<{
  placeholder?: string;
}>();
const modelValue = defineModel<string>();
const useKnowledgeBase = defineModel<boolean>("useKnowledgeBase");
const MAX_FILE_COUNT = 5;

const emit = defineEmits<{
  send: [];
  attach: [files: File[]];
  removeFile: [index: number];
}>();

const mode = computed(() => {
  return useKnowledgeBase.value ? '知识库' : '快速';
})

const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFiles = ref<File[]>([]);

const handleSend = () => {
  if (!modelValue.value?.trim()) return;
  emit("send");
};

const handleAttach = () => {
  fileInputRef.value?.click();
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  
  if (!files) return;
  
  const newFiles = Array.from(files);
  const remainingSlots = MAX_FILE_COUNT - selectedFiles.value.length;
  
  if (newFiles.length > remainingSlots) {
    alert(`最多只能上传 ${MAX_FILE_COUNT} 个文件`);
  }
  
  const filesToAdd = newFiles.slice(0, remainingSlots);
  selectedFiles.value = [...selectedFiles.value, ...filesToAdd];
  
  if (selectedFiles.value.length > 0) {
    emit("attach", selectedFiles.value);
  }
  
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

const removeFile = (index: number) => {
  selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
  emit("removeFile", index);
};

const canAddMore = () => selectedFiles.value.length < MAX_FILE_COUNT;
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileChange"
    />
    <div
      v-if="selectedFiles.length > 0"
      class="mb-2 ml-4 mr-4 flex flex-wrap gap-2"
    >
      <div
        v-for="(file, index) in selectedFiles"
        :key="index"
        class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2"
      >
        <Paperclip class="h-4 w-4 text-muted-foreground" />
        <span class="max-w-[150px] truncate text-sm">{{ file.name }}</span>
        <button
          @click="removeFile(index)"
          class="flex h-6 w-6 items-center justify-center rounded-full hover:bg-destructive/10"
        >
          <X class="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
    <div
      class="relative overflow-hidden rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 focus-within:border-primary/60 focus-within:shadow-xl"
    >
      <div class="flex items-center pl-4">
        <div
          class="flex items-center gap-2 pr-2 border-r border-border/40 mr-2"
        >
          <Switch id="knowledge-base" v-model="useKnowledgeBase" />
          <label
            for="knowledge-base"
            class="text-sm text-muted-foreground cursor-pointer select-none"
          >
            {{ mode }}
          </label>
        </div>
        <div class="flex flex-1 items-center">
          <input
            v-model.lazy.trim="modelValue"
            @keyup.enter="handleSend"
            type="text"
            :placeholder="placeholder"
            class="w-full bg-transparent py-4 text-base md:text-lg placeholder:text-muted-foreground/60 focus:outline-none"
          />
        </div>
        <button
          v-if="canAddMore()"
          @click="handleAttach"
          class="flex h-12 w-12 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip class="h-5 w-5" />
        </button>
        <button
          @click="handleSend"
          class="flex h-10 w-10 m-2 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Send class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
