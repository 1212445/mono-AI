<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Switch } from "@/components/ui/switch";
import { CornerUpLeft, Paperclip, X } from "lucide-vue-next";

const modelValue = defineModel<string>();
const useKnowledgeBase = defineModel<boolean>("useKnowledgeBase");
const files = defineModel<File[]>("files", { default: () => [] });
const MAX_FILE_COUNT = 5;

const props = defineProps<{
  /** 父组件在 SSE 流式输出期间传 true：输入框变灰、按钮变 spinner、显示提示 */
  submitting?: boolean;
}>();

const emit = defineEmits<{
  send: [];
  /** submitting 状态下点击"停止"按钮时触发，父组件调用 messageListRef.abort() 停 SSE */
  abort: [];
}>();

const mode = computed(() => {
  return useKnowledgeBase.value ? "知识库" : "快速";
});

// 有内容或附件时可发送；用于驱动发送按钮的 disabled / 颜色 / 缩放
const canSend = computed(
  () => (modelValue.value?.trim().length ?? 0) > 0 || files.value.length > 0,
);

const fileInputRef = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
// 中文/日文/韩文 IME 组合输入进行中（拼音选词阶段）。此期间回车是"确认候选词"而非"发送"。
const isComposing = ref(false);

const resizeTextarea = () => {
  const ta = textareaRef.value;
  if (!ta) return;
  // 先 collapse 再读 scrollHeight，否则高度只增不减
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight}px`;
};

const handleSend = () => {
  if (props.submitting) return; // 生成中禁止重复点击
  if (!canSend.value) return;
  emit("send");
  // 父组件会把 modelValue 清空，等下一帧重置高度回到默认
  nextTick(resizeTextarea);
};

const handleKeydown = (e: KeyboardEvent) => {
  // Enter 直接发送；Shift+Enter 换行；IME 选词中回车不发送
  if (e.key === "Enter" && !e.shiftKey && !isComposing.value) {
    e.preventDefault();
    handleSend();
  }
};

const handleCompositionStart = () => {
  isComposing.value = true;
};

const handleCompositionEnd = () => {
  isComposing.value = false;
};

const handleInput = () => {
  resizeTextarea();
};

// 父组件可能在 v-model 上重置 modelValue（切 session 等），watch 保证高度同步回弹
watch(
  () => modelValue.value,
  () => nextTick(resizeTextarea),
);

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const newFiles = Array.from(target.files ?? []);

  const remainingSlots = MAX_FILE_COUNT - files.value.length;
  if (newFiles.length > remainingSlots) {
    alert(`最多只能上传 ${MAX_FILE_COUNT} 个文件`);
  }

  files.value = [...files.value, ...newFiles.slice(0, remainingSlots)];

  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

const removeFile = (index: number) => {
  files.value = files.value.filter((_, i) => i !== index);
};

const canAddMore = () => files.value.length < MAX_FILE_COUNT;
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.docx,.pptx,.xlsx,.csv,.md,.txt,.json"
      class="hidden"
      @change="handleFileChange"
    />

    <!-- 主卡片：仿 advanced-ai-chat-input 布局 -->
    <div
      class="rounded-xl border border-border/60 bg-card p-2 shadow-sm transition-all duration-300 focus-within:border-primary/60 focus-within:shadow-md"
    >
      <!-- 附件 chip 区：高度 + 透明度过渡 -->
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 -translate-y-1"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="files.length > 0"
          class="mb-2 flex flex-wrap gap-1.5"
        >
          <TransitionGroup
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in absolute"
            enter-from-class="opacity-0 scale-75"
            leave-to-class="opacity-0 scale-75"
            move-class="transition-transform duration-200"
          >
            <div
              v-for="(file, index) in files"
              :key="`${file.name}-${index}`"
              class="relative flex items-center gap-1.5 rounded-md border border-border/50 bg-background pl-2 pr-1 py-1 text-xs"
            >
              <Paperclip class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span class="max-w-[160px] truncate">{{ file.name }}</span>
              <button
                @click="removeFile(index)"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                :aria-label="`移除 ${file.name}`"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
          </TransitionGroup>
        </div>
      </Transition>

      <!-- textarea：融入卡片，无边框无 shadow -->
      <textarea
        ref="textareaRef"
        v-model="modelValue"
        @keydown="handleKeydown"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        @input="handleInput"
        rows="1"
        :disabled="submitting"
        :placeholder="submitting ? 'AI 正在思考…' : '今天有什么可以帮助您的？'"
        class="block w-full min-h-[5.5rem] max-h-60 resize-none border-0 bg-transparent px-2 py-1.5 text-base md:text-lg leading-relaxed placeholder:text-muted-foreground/60 shadow-none focus:outline-none focus-visible:ring-0 focus:ring-0 overflow-y-auto disabled:cursor-not-allowed disabled:opacity-60"
      />

      <!-- 底部 actions 行 -->
      <div class="mt-2 flex items-center justify-between">
        <div class="flex items-center gap-1">
          <Switch
            id="knowledge-base"
            v-model="useKnowledgeBase"
            :disabled="submitting"
          />
          <label
            for="knowledge-base"
            class="cursor-pointer select-none whitespace-nowrap pl-1.5 pr-2 text-sm text-muted-foreground"
            :class="submitting && 'opacity-60'"
          >
            {{ mode }}
          </label>
          <button
            v-if="canAddMore()"
            @click="fileInputRef?.click()"
            :disabled="submitting"
            class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            title="附件"
            aria-label="附件"
          >
            <Paperclip class="h-4 w-4" />
          </button>
        </div>

        <!-- 提交中：旋转方块 + 默认 muted 背景，可点击停止 -->
        <button
          v-if="submitting"
          @click="emit('abort')"
          class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground opacity-100 scale-100 transition-all duration-200 hover:bg-accent hover:scale-105 active:scale-95"
          title="停止生成"
          aria-label="停止生成"
        >
          <div
            class="h-4 w-4 rounded-sm bg-current animate-spin"
            style="animation-duration: 3s"
          />
        </button>
        <!-- 空闲：按 canSend 切色，发送 -->
        <button
          v-else
          :disabled="!canSend"
          @click="handleSend"
          class="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200"
          :class="
            canSend
              ? 'bg-primary text-primary-foreground opacity-100 scale-100 shadow-sm hover:bg-primary/90 hover:scale-105 active:scale-95'
                : 'bg-muted text-muted-foreground/50 opacity-60 scale-95 cursor-not-allowed'
          "
          title="发送 (Enter)"
          aria-label="发送消息"
        >
          <CornerUpLeft class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- 状态提示行：与 textarea/卡片对齐宽度 -->
    <p
      class="mt-1.5 h-4 pl-4 text-xs text-muted-foreground transition-opacity duration-200"
      :class="submitting ? 'opacity-100' : 'opacity-0'"
    >
      {{ submitting ? "AI 正在思考…" : "AI 正在思考…" }}
    </p>
  </div>
</template>
