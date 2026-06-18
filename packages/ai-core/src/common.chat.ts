import { manageContext, historyToMessages } from "./memory.js";
import type { ChatHistory } from "./memory.js";
import {
  HumanMessage,
  AIMessageChunk,
  ToolMessage,
  type BaseMessage,
} from "langchain";
import type { MessageContent } from "@langchain/core/messages";
import { agent } from "./agent.model.js";

export type ChatStreamEvent =
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; name: string; artifact?: unknown };

/**
 * 把 agent 的流式消息流解析成统一的 ChatStreamEvent。
 * 处理 tool_call args 累积、<think> reasoning 切分、tool_result 通知。
 * chat() 和 ragChat() 共用。
 */
export async function* parseAgentStream(
  stream: AsyncIterable<[BaseMessage, unknown]>,
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const openToolCalls = new Map<string, { name: string; args: string }>();

  const OPEN = "<think>";
  const CLOSE = "</think>";
  let pending = "";
  let inThink = false;

  // 将content切割为content和reasoning两部分
  function* flushPending(): Generator<ChatStreamEvent, void, void> {
    while (pending.length > 0) {
      if (inThink) {
        const idx = pending.indexOf(CLOSE);
        if (idx >= 0) {
          if (idx > 0)
            yield { type: "reasoning", delta: pending.slice(0, idx) };
          pending = pending.slice(idx + CLOSE.length);
          inThink = false;
          continue;
        }
        if (pending.length > CLOSE.length) {
          const safe = pending.length - CLOSE.length;
          yield { type: "reasoning", delta: pending.slice(0, safe) };
          pending = pending.slice(safe);
        }
        return;
      }
      const idx = pending.indexOf(OPEN);
      if (idx >= 0) {
        if (idx > 0) yield { type: "content", delta: pending.slice(0, idx) };
        pending = pending.slice(idx + OPEN.length);
        inThink = true;
        continue;
      }
      if (pending.length > OPEN.length) {
        const safe = pending.length - OPEN.length;
        yield { type: "content", delta: pending.slice(0, safe) };
        pending = pending.slice(safe);
      }
      return;
    }
  }

  for await (const [message] of stream) {
    if (ToolMessage.isInstance(message)) {
      openToolCalls.delete(message.tool_call_id);
      yield {
        type: "tool_result",
        id: message.tool_call_id,
        name: message.name ?? "",
        artifact: message.artifact,
      };
      continue;
    }
    if (!AIMessageChunk.isInstance(message)) continue;

    // 第一个声明 chunk：只记 name；args 走 tool_call_chunks 累加，别用 tc.args
    for (const tc of message.tool_calls ?? []) {
      const id = tc.id ?? "";
      if (!openToolCalls.has(id)) {
        openToolCalls.set(id, { name: tc.name, args: "" });
      }
    }
    // 后续 chunk：累积 args JSON 字符串
    for (const tcc of message.tool_call_chunks ?? []) {
      if (!tcc.id) continue;
      const entry = openToolCalls.get(tcc.id);
      if (entry) entry.args += tcc.args ?? "";
    }
    // args 拼成合法 JSON 时，emit 一次 tool_call 事件；中途还没拼完就留着
    for (const [id, entry] of [...openToolCalls]) {
      if (!entry.args) continue;
      try {
        const args = JSON.parse(entry.args);
        openToolCalls.delete(id);
        yield { type: "tool_call", id, name: entry.name, args };
      } catch {
        // 还没拼完，下一轮再来
      }
    }

    // 推理 / 正文：把这一片 content 灌进状态机，按当前模式 yield 出去
    if (typeof message.content === "string" && message.content.length > 0) {
      pending += message.content;
      for (const ev of flushPending()) {
        // 过滤纯空白 delta：tool_call 阶段 LangChain 常发 " " / "\n" 这类
        // 尾部空白，下一轮 `` 出现前被状态机当成 content yield 出去
        if ("delta" in ev && ev.delta.trim() === "") continue;
        yield ev;
      }
    }
  }

  // 流结束兜底：把滞留的尾巴按当前模式一次性 yield
  if (pending.length > 0 && pending.trim() !== "") {
    yield inThink
      ? { type: "reasoning", delta: pending }
      : { type: "content", delta: pending };
  }
}

/**
 * 解析 data URL（`data:image/png;base64,iVBOR...`），拆出 mime 和纯 base64。
 * 给 ChatOpenAI 的 legacy Base64ContentBlock 用（需要 snake_case mime_type + source_type）。
 */
function parseDataUrl(dataUrl: string): { mime_type: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match || !match[1] || !match[2]) throw new Error("无效的图片 data URL");
  return { mime_type: match[1], data: match[2] };
}

/**
 * 构造最后那条用户消息：有图片时用 multimodal content array，否则纯文本。
 *
 * 注意：这里必须用 ChatOpenAI 的 legacy Base64ContentBlock 形状
 * （`source_type: "base64"` + snake_case `mime_type`），
 * `@langchain/openai` 的 `isDataContentBlock` 才认这个形状，才会调用
 * `convertToProviderContentBlock` 转成 OpenAI 的 `image_url` 协议。
 * 用新版 Multimodal.Image（`{type:'image', mimeType, data}`）会绕过转换器，
 * 原样发到 MiniMax，API 不识别。
 */
export function buildUserMessage(
  input: string,
  images?: string[],
): HumanMessage {
  if (!images || images.length === 0) return new HumanMessage(input);
  const content: MessageContent = [
    { type: "text", text: input },
    ...images.map((url) => {
      const { mime_type, data } = parseDataUrl(url);
      return {
        type: "image",
        source_type: "base64",
        mime_type,
        data,
      };
    }),
  ];
  return new HumanMessage({ content });
}

/**
 * @param input 问题
 * @param history 历史对话
 * @param fileContext 文件
 * @param images 用户上传的图片（data URL 列表）
 * @returns 普通对话输出
 */
export async function* chat(
  sessionId: string,
  input: string,
  history: ChatHistory[],
  fileContext: string,
  images?: string[],
) {
  const { summaryBlock, recentHistory } = await manageContext(
    sessionId,
    history,
    fileContext,
  );

  // 摘要 + 文件拼到首条 user message，作为"用户提供的背景"
  const contextParts: string[] = [];
  if (summaryBlock) contextParts.push(`## 历史对话摘要\n${summaryBlock}`);
  if (fileContext) contextParts.push(`## 用户上传的文件\n${fileContext}`);
  const contextMsg =
    contextParts.length > 0
      ? new HumanMessage(
          contextParts.join("\n\n") + "\n\n---\n\n请基于以上背景回答。",
        )
      : null;

  const messages = [
    ...(contextMsg ? [contextMsg] : []),
    ...historyToMessages(recentHistory),
    buildUserMessage(input, images),
  ];

  const stream = await agent().stream({ messages }, { streamMode: "messages" });
  yield* parseAgentStream(stream);
}
