import { manageContext, historyToMessages } from "./memory.js";
import type { ChatHistory } from "./memory.js";
import {
  HumanMessage,
  AIMessageChunk,
  ToolMessage,
  type BaseMessage,
} from "langchain";
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
  | { type: "tool_result"; id: string; name: string };

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
      for (const ev of flushPending()) yield ev;
    }
  }

  // 流结束兜底：把滞留的尾巴按当前模式一次性 yield
  if (pending.length > 0) {
    yield inThink
      ? { type: "reasoning", delta: pending }
      : { type: "content", delta: pending };
  }
}

/**
 * @param input 问题
 * @param history 历史对话
 * @param fileContext 文件
 * @returns 普通对话输出
 */
export async function* chat(
  sessionId: string,
  input: string,
  history: ChatHistory[],
  fileContext: string,
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
    new HumanMessage(input),
  ];

  const stream = await agent().stream({ messages }, { streamMode: "messages" });
  yield* parseAgentStream(stream);
}
