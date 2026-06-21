<script setup lang="ts">
import { ref, nextTick } from "vue";
import MarkdownRenderer from "@/components/markdown/index.vue";
import {
  Copy,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Brain,
  Loader2,
  Check,
  Search,
  AlertCircle,
} from "lucide-vue-next";
import { toast } from "vue-sonner";
import { copyToClipboard } from "@/utils/clip";
import server from "@/utils/axios.config";

type CodeArtifact = {
  type: "image/png" | "image/svg+xml" | "text/html" | "application/json";
  index: number;
  data: string; //image: base64（无前缀）；html/json: 原始字符串
  truncated: boolean;
};

type Block =
  | {
      type: "think";
      content: string; //完整内容
      typed: string; //"打字机"已显示的内容
      showThink: boolean;
      streaming: boolean;
    }
  | { type: "answer"; content: string; typed: string }
  | {
      type: "tool_call";
      id: string; //工具调用的 ID
      name: string; //工具名（如搜索）
      args?: Record<string, unknown>; //工具参数
      status: "calling" | "done"; //调用状态
      result?: CodeArtifact[]; //工具返回的可视化产物（code_sandbox 用）
    }
  | { type: "error"; content: string; typed: string }; //独立的错误提示气泡（不覆盖已显示内容）

type Message = {
  role: "user" | "assistant";
  content?: string; //user
  blocks?: Block[]; //ai
  timestamp?: string;
};

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

const isTyping = ref(false);
let typingTimeoutId: number | null = null;
const THINK_DELAY = 5; // 思考块打字速度（ms/字）
const ANSWER_DELAY = 30; // 答案块打字速度（ms/字）

/**
 * 往某条 assistant 消息的 think 或 answer 块里追加文本
 * - 从尾部向前查找：跳过 tool_call（视为不打断流的占位），找到最近的同类型块就续写
 * - 遇到 tool_call 以外的、非匹配的块就停，避免跨越 think/answer 边界错误合并
 *   （例如 [think1, answer1, tool_call, think2] 再来 think 时只会追加到 think2，不会回到 think1）
 * @param messageIndex 消息下标
 * @param type block 类型
 * @param text 要追加的文本
 */
const appendToBlock = (
  messageIndex: number,
  type: "think" | "answer",
  text: string,
) => {
  if (!text) return;
  const msg = messages.value[messageIndex];
  if (!msg) return;
  if (!msg.blocks) msg.blocks = [];
  for (let i = msg.blocks.length - 1; i >= 0; i--) {
    const block = msg.blocks[i];
    if (block.type === "tool_call") continue;
    if (block.type === type) {
      block.content += text;
      return;
    }
    break;
  }
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
};

/**
 * 往 assistant 消息里 push 一个独立 error 块。
 * 错误块不走打字机（typed = content 立即显示），用于 fetch/reader/SSE error 等系统级失败。
 * @param messageIndex 消息下标
 * @param content 错误提示文案
 */
const pushErrorBlock = (messageIndex: number, content: string) => {
  const msg = messages.value[messageIndex];
  if (!msg) return;
  if (!msg.blocks) msg.blocks = [];
  msg.blocks.push({ type: "error", content, typed: content });
};

/**
 * 把消息里 最近的一个 think 块 标记为 streaming = false
 * 一旦 streaming = false ，模板里"mono 思考中…"就会变成"mono 思考过程"
 * @param messageIndex 消息的序号
 */
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
  if (typeof first === "string")
    return first.length > 24 ? first.slice(0, 24) + "…" : first;
  return JSON.stringify(args).slice(0, 24);
};

// 打字机动画
const startTyping = (messageIndex: number) => {
  if (isTyping.value) return; // 互斥锁：避免多链
  isTyping.value = true;

  const type = () => {
    const msg = messages.value[messageIndex];
    if (!msg.blocks) {
      isTyping.value = false;
      typingTimeoutId = null;
      return;
    }

    let found = false;
    let delay = ANSWER_DELAY;
    for (let i = 0; i < msg.blocks.length; i++) {
      // 顺序遍历所有块
      const block = msg.blocks[i];
      if (block.type !== "think" && block.type !== "answer") continue;
      if (block.typed.length < block.content.length) {
        const char = block.content[block.typed.length];
        block.typed += char; // 推进一个字
        delay = block.type === "think" ? THINK_DELAY : ANSWER_DELAY;
        found = true;
        break; // 一次只打一个字
      }
    }

    if (found) {
      typingTimeoutId = window.setTimeout(type, delay);
    } else {
      isTyping.value = false;
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

// 历史记录只存了 content 文本（不含块），直接当一个 answer 块
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
  controller: AbortController,
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
    signal: controller.signal,
  });
  if (!res.ok) throw new Error("请求失败");
  if (!res.body) throw new Error("响应体为空");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let watchdog: number | null = null;
  let abortedByWatchdog = false;

  // watchdog：20s 内没有任何真实事件就认为连接死了，主动 abort
  // 配合后端 10s 一次的心跳，只要连接活着这里永远不触发
  const armWatchdog = () => {
    if (watchdog !== null) clearTimeout(watchdog);
    watchdog = window.setTimeout(() => {
      abortedByWatchdog = true;
      controller.abort();
    }, 20000);
  };
  armWatchdog();

  //根据 SSE 事件的类型（eventName），分发到对应的处理逻辑 。
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

    if (eventName === "error") {
      // 后端流式处理中出错
      markThinkDone(messageIndex);
      pushErrorBlock(
        messageIndex,
        `mono 调用失败：${parsed.message ?? "请稍后再试"}`,
      );
      armWatchdog();
      return;
    }
    if (eventName === "content" && parsed.content) {
      // 进入 answer：把上一段 think 标结束
      markThinkDone(messageIndex);
      appendToBlock(messageIndex, "answer", parsed.content);
      armWatchdog();
      if (!isTyping.value) startTyping(messageIndex);
    } else if (eventName === "reasoning" && parsed.delta) {
      appendToBlock(messageIndex, "think", parsed.delta);
      armWatchdog();
      if (!isTyping.value) startTyping(messageIndex);
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
      armWatchdog();
    } else if (eventName === "tool_result") {
      if (!msg.blocks) return;
      for (let i = msg.blocks.length - 1; i >= 0; i--) {
        const block = msg.blocks[i];
        if (block.type === "tool_call" && block.id === parsed.id) {
          block.status = "done";
          if (Array.isArray(parsed.artifact)) {
            block.result = parsed.artifact as CodeArtifact[];
          }
          break;
        }
      }
      armWatchdog();
    }
  };

  // 把字节流中的多个 SSE 事件"喂"给 dispatch
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
  } catch (err) {
    // abort / 网络中断 / reader 抛错都不覆盖已显示内容，push 一个独立 error 块
    const isAbort = abortedByWatchdog || (err as Error)?.name === "AbortError";
    markThinkDone(messageIndex);
    pushErrorBlock(
      messageIndex,
      isAbort
        ? "连接中断：长时间未收到响应，请稍后重试"
        : `网络中断：${(err as Error)?.message ?? "未知错误"}`,
    );
  } finally {
    if (watchdog !== null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    const msg = messages.value[messageIndex];
    if (msg && msg.blocks) {
      // 流结束兜底：把 think/answer 块强制打完，并标记最后 think 为结束
      for (const block of msg.blocks) {
        if (
          (block.type === "think" || block.type === "answer") &&
          block.typed.length < block.content.length
        ) {
          block.typed = block.content;
        }
      }
      markThinkDone(messageIndex);
    }
    if (typingTimeoutId !== null) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    isTyping.value = false;
    nextTick(() => {
      scrollToBottom();
    });
  }
};

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const copyContent = async (mes: Message) => {
  // ReAct 循环中前面 answer 块是工具调用等中间产物，只取最后一个作为最终回答
  const lastAnswer = [...(mes.blocks ?? [])]
    .reverse()
    .find((b) => b.type === "answer");
  if (!lastAnswer) return;
  const ok = await copyToClipboard(lastAnswer.content);
  if (ok) toast.success("已复制回答内容");
  else toast.error("复制失败，请手动复制");
};

async function send(
  question: string,
  useKB: boolean,
  files: File[],
  sessionId: string,
): Promise<void> {
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
  const controller = new AbortController();

  await nextTick();
  scrollToBottom();

  try {
    await sendMessage(
      question,
      useKB,
      files,
      sessionId,
      messageIndex,
      controller,
    );
  } catch (error) {
    console.error("发送消息失败:", error);
    toast.error("发送消息失败");
    // 不再覆盖 blocks：push 一个独立的 error 块，保留 SSE 已显示的 think/answer/tool_call
    pushErrorBlock(messageIndex, "抱歉，发生了错误，请稍后重试。");
  }
}

async function loadHistory(sessionId: string): Promise<void> {
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
  await nextTick();
  scrollToBottom();
}

defineExpose({ messages, send, loadHistory });
</script>

<template>
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
              <div
                v-if="block.type === 'think' && block.content"
                class="w-full"
              >
                <button
                  @click="block.showThink = !block.showThink"
                  class="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1"
                >
                  <Brain class="h-3 w-3" />
                  <span>{{
                    block.streaming ? "mono 思考中…" : "mono 思考过程"
                  }}</span>
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
              <!-- Tool call pill + 可视化产物 -->
              <div
                v-else-if="block.type === 'tool_call'"
                class="flex flex-col items-start gap-2"
              >
                <div
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
                  <span v-if="block.status === 'calling'" class="opacity-70"
                    >调用中…</span
                  >
                  <span v-else class="opacity-70">完成</span>
                </div>
                <!-- code_sandbox 返回的图表/HTML/JSON -->
                <div
                  v-if="block.result && block.result.length > 0"
                  class="flex flex-col gap-2 w-full max-w-2xl"
                >
                  <div
                    v-for="(art, aIdx) in block.result"
                    :key="aIdx"
                    class="rounded-lg border bg-card overflow-hidden"
                  >
                    <img
                      v-if="art.type === 'image/png' || art.type === 'image/svg+xml'"
                      :src="`data:${art.type};base64,${art.data}`"
                      :alt="`${art.type} output`"
                      class="w-full h-auto block"
                    />
                    <iframe
                      v-else-if="art.type === 'text/html'"
                      :srcdoc="art.data"
                      sandbox="allow-scripts allow-popups allow-forms"
                      referrerpolicy="no-referrer"
                      class="w-full min-h-[200px] max-h-[480px] border-0 bg-white"
                    />
                    <pre
                      v-else-if="art.type === 'application/json'"
                      class="p-3 text-xs overflow-x-auto font-mono whitespace-pre-wrap break-all"
                    ><code>{{ art.data }}</code></pre>
                    <div
                      v-if="art.truncated"
                      class="px-3 py-1 text-xs text-amber-700 bg-amber-50 border-t"
                    >
                      输出过大，已截断
                    </div>
                  </div>
                </div>
              </div>
              <!-- Error block: 独立气泡，不覆盖已显示内容 -->
              <div
                v-else-if="block.type === 'error' && block.content"
                class="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
              >
                <AlertCircle class="h-4 w-4 mt-0.5 shrink-0" />
                <div class="flex-1">
                  <MarkdownRenderer :content="block.typed || ''" />
                </div>
              </div>
            </template>
          </template>

          <!-- User: simple text bubble -->
          <div
            v-else
            class="rounded-2xl px-4 py-3 bg-primary text-primary-foreground"
          >
            <p class="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
              {{ message.content }}
            </p>
          </div>

          <div
            v-if="message.role === 'assistant'"
            class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              @click="copyContent(message)"
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
          <span v-if="message.timestamp" class="text-xs text-muted-foreground">
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
</template>

<style scoped>
.chat-message {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
}
</style>
