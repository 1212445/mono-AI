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
 * 从累积中的 tool call 列表里挑出 args 已经是合法 JSON 的条目，解析后从
 * Map 里删掉返回。args 还不完整的就继续留在 Map 里等下一个 chunk。
 * tool_call_chunks 是分片到达的，每个分片到达时都试一次 parse，
 * 不完整的 JSON 必须 catch 掉，否则整条流都会被 SyntaxError 打断。
 */
export function drainCompleteToolCalls(
  openToolCalls: Map<string, { name: string; args: string }>,
): Array<{ id: string; name: string; args: Record<string, unknown> }> {
  const out: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  for (const [id, entry] of [...openToolCalls]) {
    if (!entry.args) continue;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(entry.args);
    } catch {
      continue;
    }
    openToolCalls.delete(id);
    out.push({ id, name: entry.name, args });
  }
  return out;
}

/**
 * 累积中的 tool call 条目。
 * - hasFullArgs=true 时表示 args 已经从 tool_calls 拿到最终态（parsed object），
 *   不要再用 tool_call_chunks 累加，否则会污染 JSON。
 */
type OpenToolCallEntry = {
  name: string;
  args: string;
  hasFullArgs: boolean;
};

/**
 * 把单个 tool_call 写进 openToolCalls。
 * - 若 tc.args 是非空对象，JSON.stringify 写入 entry.args 并标记 hasFullArgs=true（最终态）
 * - 若 tc.args 缺失/空对象/非对象，entry.args 留空，等 chunks 累积
 * - 已有 entry 时只补 name，不覆盖 args（防止把 chunks 累积的内容冲掉）
 *
 * 设计原因：OpenAI 兼容流里 tool_calls[].args 已经是 parsed object。
 * 旧实现"只读 name、args 走 chunks 累积"在 model 不发 chunks（一次性给完整
 * tool_calls）的情况下 args 永远是空串，drainCompleteToolCalls 永远不会 emit，
 * 整个 tool_call UI 不显示 —— tool 内部还是被 agent 调用了（AI 也能拿到结果），
 * 但前端拿不到 tool_call 事件。
 */
export function recordToolCall(
  openToolCalls: Map<string, OpenToolCallEntry>,
  tc: { id?: string; name?: string; args?: unknown },
): void {
  const id = tc.id ?? "";
  if (!id) return;
  const argsFromTc =
    tc.args && typeof tc.args === "object" && !Array.isArray(tc.args) && Object.keys(tc.args as object).length > 0
      ? JSON.stringify(tc.args)
      : "";
  const existing = openToolCalls.get(id);
  if (existing) {
    if (!existing.name && tc.name) existing.name = tc.name;
    if (argsFromTc && !existing.hasFullArgs) {
      existing.args = argsFromTc;
      existing.hasFullArgs = true;
    }
  } else {
    openToolCalls.set(id, {
      name: tc.name ?? "",
      args: argsFromTc,
      hasFullArgs: argsFromTc !== "",
    });
  }
}

/**
 * 把 agent 的流式消息流解析成统一的 ChatStreamEvent。
 * 处理 tool_call args 累积、<think> reasoning 切分、tool_result 通知。
 * chat() 和 ragChat() 共用。
 */
export async function* parseAgentStream(
  stream: AsyncIterable<[BaseMessage, unknown]>,
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const openToolCalls = new Map<string, OpenToolCallEntry>();

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

    // tool_calls：name + 可选地把完整 args 写入（兼容一次性发完整 tool_calls 的 model）
    for (const tc of message.tool_calls ?? []) {
      recordToolCall(openToolCalls, tc);
    }
    // tool_call_chunks：累积 args JSON 字符串。
    // 兼容 OpenAI 兼容流：早期 chunk 通常只发 tool_call_chunks 不发 tool_calls，
    // 此时 recordToolCall 还没建 entry，需要 chunks 路径自己补建 + 补 name，
    // 否则 entry.args 永远是 ""，drainCompleteToolCalls 永远不会 emit。
    // hasFullArgs=true 的 entry 跳过（避免覆盖 recordToolCall 已经拿到的完整 args）
    for (const tcc of message.tool_call_chunks ?? []) {
      if (!tcc.id) continue;
      let entry = openToolCalls.get(tcc.id);
      if (!entry) {
        entry = { name: "", args: "", hasFullArgs: false };
        openToolCalls.set(tcc.id, entry);
      }
      if (!entry.name && tcc.name) entry.name = tcc.name;
      if (!entry.hasFullArgs) {
        entry.args += tcc.args ?? "";
      }
    }
    // args 拼成合法 JSON 时，emit 一次 tool_call 事件；中途还没拼完就留着
    for (const tc of drainCompleteToolCalls(openToolCalls)) {
      yield { type: "tool_call", id: tc.id, name: tc.name, args: tc.args };
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
 * @param signal AbortSignal，外部中断时立即停止 LLM 推理
 * @returns 普通对话输出
 */
export async function* chat(
  sessionId: string,
  input: string,
  history: ChatHistory[],
  fileContext: string,
  images?: string[],
  signal?: AbortSignal,
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

  const stream = await agent().stream(
    { messages },
    signal ? { streamMode: "messages", signal } : { streamMode: "messages" },
  );
  yield* parseAgentStream(stream);
}
