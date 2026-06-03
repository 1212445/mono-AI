<script setup lang="ts">
import AppSidebar from "@/components/aside/AppSidebar.vue";
import MarkdownRenderer from "@/components/markdown/index.vue";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Copy,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
} from "lucide-vue-next";
import { ref, onMounted, nextTick, computed } from "vue";
import { useRouter } from "vue-router";
import ChatInput from "@/components/input/index.vue";
import { useChatStore } from "@/store";

const router = useRouter();
const chatStore = useChatStore();

const inputMessage = ref("");
const useKnowledgeBase = ref(false);
const selectedFiles = ref<File[]>([]);

const chatTitle = computed(() => chatStore.currentQuestion || "新对话");

type Block = {
  type: "think" | "answer";
  content: string;
  typed: string;
  showThink?: boolean;
};

type Message = {
  role: string;
  content?: string;
  blocks?: Block[];
  timestamp?: string;
};

const messages = ref<Message[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);

let isInThink = false;
let isTyping = false;
let typingTimeoutId: number | null = null;
const THINK_DELAY = 5;
const ANSWER_DELAY = 30;

const appendToBlock = (
  messageIndex: number,
  type: "think" | "answer",
  text: string,
) => {
  const msg = messages.value[messageIndex];
  if (!msg.blocks) msg.blocks = [];
  const last = msg.blocks[msg.blocks.length - 1];
  if (last && last.type === type) {
    last.content += text;
  } else {
    msg.blocks.push({
      type,
      content: text,
      typed: "",
      showThink: type === "think" ? false : undefined,
    });
  }
};

const processChunk = (content: string, messageIndex: number) => {
  let i = 0;
  while (i < content.length) {
    if (isInThink) {
      const endIdx = content.indexOf("</think>", i);
      if (endIdx !== -1) {
        const text = content.slice(i, endIdx);
        if (text) appendToBlock(messageIndex, "think", text);
        i = endIdx + 8;
        isInThink = false;
      } else {
        const text = content.slice(i);
        if (text) appendToBlock(messageIndex, "think", text);
        i = content.length;
      }
    } else {
      const startIdx = content.indexOf("<think>", i);
      if (startIdx !== -1) {
        const text = content.slice(i, startIdx);
        if (text) appendToBlock(messageIndex, "answer", text);
        i = startIdx + 7;
        isInThink = true;
      } else {
        const text = content.slice(i);
        if (text) appendToBlock(messageIndex, "answer", text);
        i = content.length;
      }
    }
  }
};

const startTyping = (messageIndex: number) => {
  if (isTyping) return;
  isTyping = true;

  const type = () => {
    const msg = messages.value[messageIndex];
    if (!msg.blocks) {
      isTyping = false;
      typingTimeoutId = null;
      return;
    }

    let found = false;
    let activeBlockType: "think" | "answer" = "answer";
    for (let i = 0; i < msg.blocks.length; i++) {
      const block = msg.blocks[i];
      if (block.typed.length < block.content.length) {
        const char = block.content[block.typed.length];
        block.typed += char;
        activeBlockType = block.type;
        found = true;
        break;
      }
    }

    nextTick(() => {
      scrollToBottom();
    });

    if (found) {
      const delay = activeBlockType === "think" ? THINK_DELAY : ANSWER_DELAY;
      typingTimeoutId = window.setTimeout(type, delay);
    } else {
      isTyping = false;
      typingTimeoutId = null;
    }
  };

  type();
};

const socket = async (
  formData: FormData,
  messageIndex: number,
  onComplete?: () => void,
  sessionIdSetInitial = true,
) => {
  const res = await fetch("http://localhost:3000/chat", {
    method: "post",
    body: formData,
  });
  if (!res.ok) throw new Error("请求失败");
  if (!res.body) throw new Error("响应体为空");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sessionIdSet = sessionIdSetInitial;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      console.log("chunk是", chunk);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          if (data === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.sessionId && !sessionIdSet) {
              chatStore.currentSessionId = parsed.sessionId;
              sessionIdSet = true;
            }

            if (parsed.content) {
              processChunk(parsed.content, messageIndex);
              if (!isTyping) startTyping(messageIndex);
            }
          } catch (e) {
            console.error("解析数据失败:", e);
          }
        }
      }
    }
  } catch (error) {
    throw error;
  } finally {
    const msg = messages.value[messageIndex];
    if (msg && msg.blocks) {
      for (const block of msg.blocks) {
        if (block.typed.length < block.content.length) {
          block.typed = block.content;
        }
      }
    }
    if (typingTimeoutId !== null) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    isTyping = false;
    onComplete?.();
    nextTick(() => {
      scrollToBottom();
    });
  }
};

onMounted(async () => {
  messages.value.push({
    role: "user",
    content: chatStore.currentQuestion,
    timestamp: new Date().toLocaleTimeString(),
  });
  messages.value.push({
    role: "assistant",
    blocks: [],
    timestamp: new Date().toLocaleTimeString(),
  });

  const messageIndex = messages.value.length - 1;
  useKnowledgeBase.value = chatStore.useKnowledgeBase;
  selectedFiles.value = chatStore.selectedFiles;

  const formData = new FormData();
  formData.append("question", chatStore.currentQuestion);
  formData.append("sessionId", chatStore.currentSessionId);
  formData.append("mode", String(chatStore.useKnowledgeBase ? 2 : 1));

  chatStore.selectedFiles.forEach((file) => {
    formData.append("files", file);
  });

  try {
    await socket(
      formData,
      messageIndex,
      () => {
        chatStore.resetChat();
      },
      true,
    );
  } catch (error) {
    console.error("发送消息失败:", error);
    messages.value[messageIndex].blocks = [
      { type: "answer", content: "抱歉，发生了错误，请稍后重试。", typed: "抱歉，发生了错误，请稍后重试。" },
    ];
  }

  nextTick(() => {
    scrollToBottom();
  });
});

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const goHome = () => {
  router.push("/");
};

const handleSend = async () => {
  const question = inputMessage.value;
  const files = selectedFiles.value;

  if (!question.trim()) return;

  messages.value.push({
    role: "user",
    content: question,
    timestamp: new Date().toLocaleTimeString(),
  });

  messages.value.push({
    role: "assistant",
    blocks: [],
    timestamp: new Date().toLocaleTimeString(),
  });

  const messageIndex = messages.value.length - 1;

  inputMessage.value = "";
  selectedFiles.value = [];

  nextTick(() => {
    scrollToBottom();
  });

  const formData = new FormData();
  formData.append("question", question);
  formData.append("sessionId", chatStore.currentSessionId || "");
  formData.append("mode", String(useKnowledgeBase.value ? 2 : 1));

  files.forEach((file) => {
    formData.append("files", file);
  });

  try {
    await socket(formData, messageIndex, undefined, false);
  } catch (error) {
    console.error("发送消息失败:", error);
    messages.value[messageIndex].blocks = [
      { type: "answer", content: "抱歉，发生了错误，请稍后重试。", typed: "抱歉，发生了错误，请稍后重试。" },
    ];
  }
};

const handleAttach = (files: File[]) => {
  selectedFiles.value = files;
};

const handleRemoveFile = () => {
  selectedFiles.value = [];
};
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <div class="flex h-screen flex-col">
        <div
          class="flex items-center gap-3 border-b border-border/40 px-4 py-3"
        >
          <button
            @click="goHome"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft class="h-5 w-5" />
          </button>
          <Separator
            orientation="vertical"
            class="mr-2 data-[orientation=vertical]:h-4"
          />
          <div class="flex flex-col">
            <span class="text-sm font-medium text-foreground">{{
              chatTitle
            }}</span>
          </div>
        </div>

        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6">
          <div class="mx-auto max-w-3xl space-y-6">
            <div
              v-for="(message, index) in messages"
              :key="index"
              class="group flex gap-4"
              :class="message.role === 'user' ? 'flex-row-reverse' : ''"
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                :class="
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                "
              >
                {{ message.role === "user" ? "你" : "AI" }}
              </div>
              <div
                class="flex max-w-[80%] flex-col gap-3"
                :class="message.role === 'user' ? 'items-end' : 'items-start'"
              >
                <!-- Assistant: render multiple think/answer blocks -->
                <template v-if="message.role === 'assistant'">
                  <template v-for="(block, bIdx) in message.blocks" :key="bIdx">
                    <!-- Think block -->
                    <div v-if="block.type === 'think'" class="w-full">
                      <button
                        @click="block.showThink = !block.showThink"
                        class="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1"
                      >
                        <span>{{ block.showThink ? "▼" : "▶" }}</span>
                        <span>思考过程</span>
                      </button>
                      <div
                        v-show="block.showThink"
                        class="rounded-lg px-3 py-2 bg-muted/50 text-muted-foreground text-xs"
                      >
                        <MarkdownRenderer :content="block.typed || ''" />
                      </div>
                    </div>
                    <!-- Answer block -->
                    <div
                      v-else
                      class="rounded-2xl px-4 py-3 bg-muted"
                    >
                      <MarkdownRenderer :content="block.typed || ''" />
                    </div>
                  </template>
                </template>

                <!-- User: simple text bubble -->
                <div
                  v-else
                  class="rounded-2xl px-4 py-3 bg-primary text-primary-foreground"
                >
                  <p
                    class="text-sm md:text-base leading-relaxed whitespace-pre-wrap"
                  >
                    {{ message.content }}
                  </p>
                </div>

                <div
                  v-if="message.role === 'assistant'"
                  class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Copy class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <ThumbsUp class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <ThumbsDown class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <MoreHorizontal class="h-3.5 w-3.5" />
                  </button>
                </div>
                <span
                  v-if="message.timestamp"
                  class="text-xs text-muted-foreground"
                >
                  {{ message.timestamp }}
                </span>
              </div>
            </div>

            <div
              v-if="messages.length === 0"
              class="flex h-[50vh] flex-col items-center justify-center text-center"
            >
              <div class="space-y-3">
                <p class="text-lg font-medium text-foreground">开始新对话</p>
                <p class="text-sm text-muted-foreground">
                  在上方输入框中输入您的消息开始对话
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 md:p-6">
          <ChatInput
            v-model="inputMessage"
            v-model:useKnowledgeBase="useKnowledgeBase"
            @send="handleSend"
            @attach="handleAttach"
            @removeFile="handleRemoveFile"
          />
          <p class="mt-3 text-center text-xs text-muted-foreground/60">
            AI 生成的内容可能不准确或不当。
          </p>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
