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
  Brain,
  Loader2,
  Check,
  Search,
} from "lucide-vue-next";
import { ref, onMounted, nextTick, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import server from "@/utils/axios.config";
import ChatInput from "@/components/input/index.vue";
import { useChatStore } from "@/store";
import { toast } from "vue-sonner";

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();

const inputMessage = ref("");
const useKnowledgeBase = ref(false);
const selectedFiles = ref<File[]>([]);

const chatTitle = computed(
  () => messages.value.find((m) => m.role === "user")?.content || "新对话",
);

// 统一到一个 blocks 数组，按到达顺序：think → tool_call → think → answer
type Block =
  | {
      type: "think";
      content: string;
      typed: string;
      showThink: boolean;
      streaming: boolean;
    }
  | { type: "answer"; content: string; typed: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      args?: Record<string, unknown>;
      status: "calling" | "done";
    };

type Message = {
  role: "user" | "assistant";
  content?: string;
  blocks?: Block[];
  timestamp?: string;
};

// 对应后端chatHistory 实体
type ChatHistoryRecord = {
  id: number;
  sessionId: string;
  question: string;
  answer: string;
  mode: number;
  createdTime: string;
};

const messages = ref<Message[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);

let isTyping = false; //打字机动画是否在跑
let typingTimeoutId: number | null = null;
const THINK_DELAY = 5;  // 思考块打字速度（ms/字）
const ANSWER_DELAY = 30;  // 答案块打字速度（ms/字）

// 向 think/answer 块追加文本；空 text 跳过，避免产生空块
const appendToBlock = (
  messageIndex: number,
  type: "think" | "answer",
  text: string,
) => {
  if (!text) return;
  const msg = messages.value[messageIndex];
  if (!msg) return;
  if (!msg.blocks) msg.blocks = [];
  const last = msg.blocks[msg.blocks.length - 1];
  if (last && (last.type === "think" || last.type === "answer") && last.type === type) {
    last.content += text;
  } else {
    if (type === "think") {
      msg.blocks.push({
        type,
        content: text,
        typed: "",
        showThink: false,
        streaming: true,
      });
    } else {
      msg.blocks.push({ type, content: text, typed: "" });
    }
  }
};

// 标记最近一个 think 块结束（content / tool_call 事件到来时调用）
const markThinkDone = (messageIndex: number) => {
  const msg = messages.value[messageIndex];
  if (!msg?.blocks) return;
  for (let i = msg.blocks.length - 1; i >= 0; i--) {
    const block = msg.blocks[i];
    if (block.type === "think") {
      block.streaming = false;
      break;
    }
  }
};

// 工具调用的可视化：参数取一项短展示
const formatToolArgs = (args?: Record<string, unknown>): string => {
  if (!args) return "";
  const first = Object.values(args)[0];
  if (typeof first === "string") return first.length > 24 ? first.slice(0, 24) + "…" : first;
  return JSON.stringify(args).slice(0, 24);
};

// 打字机动画
const startTyping = (messageIndex: number) => {
  if (isTyping) return; // 互斥锁：避免多链
  isTyping = true;

  const type = () => {
    const msg = messages.value[messageIndex];
    if (!msg.blocks) {
      isTyping = false;
      typingTimeoutId = null;
      return;
    }

    let found = false;
    let delay = ANSWER_DELAY;
    for (let i = 0; i < msg.blocks.length; i++) {  // 顺序遍历所有块
      const block = msg.blocks[i];
      if (block.type !== "think" && block.type !== "answer") continue;
      if (block.typed.length < block.content.length) {
        const char = block.content[block.typed.length];
        block.typed += char;  // 推进一个字
        delay = block.type === "think" ? THINK_DELAY : ANSWER_DELAY;
        found = true;
        break;  // 一次只打一个字
      }
    }

    if (found) {
      typingTimeoutId = window.setTimeout(type, delay);
    } else {
      isTyping = false;
      typingTimeoutId = null;
    }
  };

  type();
};

const buildHistorySkeleton = (records: ChatHistoryRecord[]) => {
  records.forEach((r) => {
    messages.value.push({
      role: "user",
      content: r.question,
      timestamp: new Date(r.createdTime).toLocaleTimeString(),
    });
    messages.value.push({
      role: "assistant",
      blocks: [],
      timestamp: new Date(r.createdTime).toLocaleTimeString(),
    });
  });
};

// 历史记录只存了 content 文本（不含 ``），直接当一个 answer 块
const fillHistoryContent = (records: ChatHistoryRecord[]) => {
  records.forEach((r, i) => {
    const aiIndex = i * 2 + 1;
    appendToBlock(aiIndex, "answer", r.answer);
    const msg = messages.value[aiIndex];
    if (!msg?.blocks) return;
    for (const block of msg.blocks) {
      if (block.type === "think" || block.type === "answer") {
        block.typed = block.content;
      }
    }
  });
};

const sendMessage = async (
  question: string,
  useKB: boolean,
  files: File[],
  sessionId: string,
  messageIndex: number,
) => {
  const formData = new FormData();
  formData.append("question", question);
  formData.append("sessionId", sessionId);
  formData.append("mode", String(useKB ? 2 : 1));
  files.forEach((file) => {
    formData.append("files", file);
  });

  const res = await fetch("http://localhost:3000/chat", {
    method: "post",
    body: formData,
  });
  if (!res.ok) throw new Error("请求失败");
  if (!res.body) throw new Error("响应体为空");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  const dispatch = (eventName: string, data: string) => {
    if (data === "[DONE]") return;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const msg = messages.value[messageIndex];
    if (!msg) return;

    if (eventName === "content" && parsed.content) {
      // 进入 answer：把上一段 think 标结束
      markThinkDone(messageIndex);
      appendToBlock(messageIndex, "answer", parsed.content);
      if (!isTyping) startTyping(messageIndex);
    } else if (eventName === "reasoning" && parsed.delta) {
      appendToBlock(messageIndex, "think", parsed.delta);
      if (!isTyping) startTyping(messageIndex);
    } else if (eventName === "tool_call") {
      // 准备调用工具：把上一段 think 标结束
      markThinkDone(messageIndex);
      if (!msg.blocks) msg.blocks = [];
      msg.blocks.push({
        type: "tool_call",
        id: parsed.id,
        name: parsed.name,
        args: parsed.args,
        status: "calling",
      });
    } else if (eventName === "tool_result") {
      if (!msg.blocks) return;
      for (let i = msg.blocks.length - 1; i >= 0; i--) {
        const block = msg.blocks[i];
        if (block.type === "tool_call" && block.id === parsed.id) {
          block.status = "done";
          break;
        }
      }
    }
  };

  const feed = (raw: string) => {
    sseBuffer += raw;
    let boundary = sseBuffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = sseBuffer.slice(0, boundary);
      sseBuffer = sseBuffer.slice(boundary + 2);
      let eventName = "message";
      let data = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (data) dispatch(eventName, data);
      boundary = sseBuffer.indexOf("\n\n");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
    }
    // 流结束：把残留尾巴也处理一下
    if (sseBuffer.trim()) feed("\n\n");
  } finally {
    const msg = messages.value[messageIndex];
    if (msg && msg.blocks) {
      // 流结束兜底：把 think/answer 块强制打完，并标记最后 think 为结束
      for (const block of msg.blocks) {
        if ((block.type === "think" || block.type === "answer") && block.typed.length < block.content.length) {
          block.typed = block.content;
        }
      }
      markThinkDone(messageIndex);
    }
    if (typingTimeoutId !== null) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    isTyping = false;
    nextTick(() => {
      scrollToBottom();
    });
  }
};

onMounted(async () => {
  const sessionId = route.params.id as string;

  // 第一步:永远先拉历史
  try {
    const res = await server.get(`/chat/${sessionId}`);
    const records: ChatHistoryRecord[] = res.data.data;
    messages.value = [];
    buildHistorySkeleton(records);
    fillHistoryContent(records);
  } catch (e) {
    console.error("加载历史失败", e);
    messages.value = [];
    toast.error("加载历史失败");
  }

  // 第二步:只有从 home 跳过来的新对话,才发首问
  if (chatStore.currentSessionId === sessionId && chatStore.currentQuestion) {
    const {
      currentQuestion: q,
      useKnowledgeBase: kb,
      selectedFiles: fs,
    } = chatStore;
    chatStore.resetChat();
    useKnowledgeBase.value = kb;
    selectedFiles.value = fs;

    messages.value.push({
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString(),
    });
    messages.value.push({
      role: "assistant",
      blocks: [],
      timestamp: new Date().toLocaleTimeString(),
    });
    const messageIndex = messages.value.length - 1;

    try {
      await sendMessage(q, kb, fs, sessionId, messageIndex);
      chatStore.allSession.unshift({
        sessionId,
        title: q.slice(0, 20),
        lastActiveTime: new Date(),
      });
    } catch (error) {
      console.error("发送消息失败", error);
      toast.error("发送消息失败");
      messages.value[messageIndex].blocks = [
        {
          type: "answer",
          content: "抱歉，发生了错误，请稍后重试。",
          typed: "抱歉，发生了错误，请稍后重试。",
        },
      ];
    }
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

const copyContent = async (mes: Message) => {
  // ReAct 循环中前面 answer 块是工具调用等中间产物，只取最后一个作为最终回答
  const lastAnswer = [...(mes.blocks ?? [])]
    .reverse()
    .find((b) => b.type === "answer");
  if (!lastAnswer) return;
  try {
    await navigator.clipboard.writeText(lastAnswer.content);
    toast.success("已复制回答内容");
  } catch {
    toast.error("复制失败，请手动复制");
  }
}

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

  try {
    await sendMessage(
      question,
      useKnowledgeBase.value,
      files,
      route.params.id as string,
      messageIndex,
    );
  } catch (error) {
    console.error("发送消息失败:", error);
    toast.error("发送消息失败");
    messages.value[messageIndex].blocks = [
      {
        type: "answer",
        content: "抱歉，发生了错误，请稍后重试。",
        typed: "抱歉，发生了错误，请稍后重试。",
      },
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
              class="chat-message group flex gap-4"
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
                <!-- Assistant: 加载占位符 + blocks 统一 v-for -->
                <template v-if="message.role === 'assistant'">
                  <div
                    v-if="!message.blocks || message.blocks.length === 0"
                    class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Loader2 class="h-3 w-3 animate-spin" />
                    <span>mono 正在思考…</span>
                  </div>
                  <template v-for="(block, bIdx) in message.blocks" :key="bIdx">
                    <!-- Think block -->
                    <div v-if="block.type === 'think' && block.content" class="w-full">
                      <button
                        @click="block.showThink = !block.showThink"
                        class="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1"
                      >
                        <Brain class="h-3 w-3" />
                        <span>{{ block.streaming ? "mono 思考中…" : "mono 思考过程" }}</span>
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
                      v-else-if="block.type === 'answer' && block.content"
                      class="rounded-2xl px-4 py-3 bg-muted"
                    >
                      <MarkdownRenderer :content="block.typed || ''" />
                    </div>
                    <!-- Tool call pill -->
                    <div
                      v-else-if="block.type === 'tool_call'"
                      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                      :class="
                        block.status === 'calling'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      "
                    >
                      <Loader2
                        v-if="block.status === 'calling'"
                        class="h-3 w-3 animate-spin"
                      />
                      <Check v-else class="h-3 w-3" />
                      <Search class="h-3 w-3 opacity-70" />
                      <span class="font-medium">{{ block.name }}</span>
                      <span v-if="block.args" class="opacity-70">
                        {{ formatToolArgs(block.args) }}
                      </span>
                      <span
                        v-if="block.status === 'calling'"
                        class="opacity-70"
                        >调用中…</span
                      >
                      <span v-else class="opacity-70">完成</span>
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
                  <button @click="copyContent(message)"
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

<style scoped>
.chat-message {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
}
</style>
