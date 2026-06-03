import { manageContext, historyToMessages } from "./memory.js";
import type { ChatHistory } from "./memory.js";
import { HumanMessage, AIMessageChunk, ToolMessage } from "langchain";
import { agent } from "./agent.model.js";

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

  for await (const [message] of stream) {
    if (ToolMessage.isInstance(message)) continue;
    if (AIMessageChunk.isInstance(message) && message.tool_call_chunks?.length)
      continue;
    if (message.content) yield message.content;
  }
}
