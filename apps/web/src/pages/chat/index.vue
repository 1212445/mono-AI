<script setup lang="ts">
import AppSidebar from "@/components/aside/AppSidebar.vue";
import MarkdownRenderer from "@/components/markdown/index.vue";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

const messages = ref<
  Array<{
    role: string;
    content: string;
    think?: string;
    showThink?: boolean;
    timestamp?: string;
  }>
>([]);
const messagesContainer = ref<HTMLElement | null>(null);

let thinkBuffer = ""; // think 缓冲
let answerBuffer = ""; // answer 缓冲
let isInThink = false; // 是否正在接收 think
let isTyping = false; // 是否正在逐字输出
let rafId: number | null = null; // requestAnimationFrame ID
const THINK_DELAY = 5; // think 快速（毫秒）
const ANSWER_DELAY = 30; // answer 正常（毫秒）

const startTyping = (messageIndex: number) => {
  if (isTyping || (answerBuffer.length === 0 && thinkBuffer.length === 0))
    return;
  isTyping = true;

  const type = () => {
    // 先处理 think
    if (thinkBuffer.length > 0) {
      const char = thinkBuffer[0];
      thinkBuffer = thinkBuffer.slice(1);
      messages.value[messageIndex].think =
        (messages.value[messageIndex].think || "") + char;
      rafId = window.setTimeout(type, THINK_DELAY);
      nextTick(() => {
        scrollToBottom();
      });
      return;
    }

    // think 处理完后再处理 answer
    if (answerBuffer.length > 0) {
      const char = answerBuffer[0];
      answerBuffer = answerBuffer.slice(1);
      messages.value[messageIndex].content += char;
      rafId = window.setTimeout(type, ANSWER_DELAY);
      nextTick(() => {
        scrollToBottom();
      });
      return;
    }

    // 都处理完了
    isTyping = false;
    rafId = null;
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
      console.log("chunk是",chunk)
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
              const content = parsed.content;

              if (isInThink) {
                const thinkEndIdx = content.indexOf("</think>");
                if (thinkEndIdx !== -1) {
                  thinkBuffer += content.slice(0, thinkEndIdx);
                  answerBuffer += content.slice(thinkEndIdx + 8);
                  isInThink = false;
                } else {
                  thinkBuffer += content;
                }
              } else {
                const thinkStartIdx = content.indexOf("<think>");
                const thinkEndIdx = content.indexOf("</think>");

                if (thinkStartIdx !== -1) {
                  if (thinkEndIdx !== -1 && thinkEndIdx > thinkStartIdx) {
                    answerBuffer += content.slice(0, thinkStartIdx);
                    thinkBuffer += content.slice(
                      thinkStartIdx + 6,
                      thinkEndIdx,
                    );
                    answerBuffer += content.slice(thinkEndIdx + 8);
                  } else {
                    answerBuffer += content.slice(0, thinkStartIdx);
                    thinkBuffer += content.slice(thinkStartIdx + 6);
                    isInThink = true;
                  }
                } else if (thinkEndIdx !== -1) {
                  thinkBuffer += content.slice(0, thinkEndIdx);
                  answerBuffer += content.slice(thinkEndIdx + 8);
                  isInThink = false;
                } else {
                  answerBuffer += content;
                }
              }

              if (!isTyping && (thinkBuffer || answerBuffer)) {
                startTyping(messageIndex);
              }
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
    if (rafId !== null) {
      clearTimeout(rafId);
      rafId = null;
    }
    if (thinkBuffer.length > 0) {
      messages.value[messageIndex].think =
        (messages.value[messageIndex].think || "") + thinkBuffer;
      thinkBuffer = "";
    }
    if (answerBuffer.length > 0) {
      messages.value[messageIndex].content += answerBuffer;
      answerBuffer = "";
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
    content: "",
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
    messages.value[messageIndex].content = "抱歉，发生了错误，请稍后重试。";
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
    content: "",
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
    messages.value[messageIndex].content = "抱歉，发生了错误，请稍后重试。";
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
                class="flex max-w-[80%] flex-col gap-2"
                :class="message.role === 'user' ? 'items-end' : 'items-start'"
              >
                <!-- Think 部分 -->
                <div v-if="message.think" class="w-full">
                  <button
                    @click="message.showThink = !message.showThink"
                    class="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1"
                  >
                    <span>{{ message.showThink ? "▼" : "▶" }}</span>
                    <span>思考过程</span>
                  </button>
                  <div
                    v-show="message.showThink"
                    class="rounded-lg px-3 py-2 bg-muted/50 text-muted-foreground text-xs"
                  >
                    <MarkdownRenderer :content="message.think || ''" />
                  </div>
                </div>
                <!-- Answer 部分 -->
                <div
                  class="rounded-2xl px-4 py-3"
                  :class="
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  "
                >
                  <MarkdownRenderer
                    v-if="message.role === 'assistant'"
                    :content="message.content"
                  />
                  <p v-else class="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
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
