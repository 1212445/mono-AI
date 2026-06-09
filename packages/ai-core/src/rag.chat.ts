import { manageContext, historyToMessages, type ChatHistory } from "./memory.js";
import { HumanMessage } from "langchain";
import { agent } from "./agent.model.js";
import { parseAgentStream } from "./common.chat.js";

/**
 * RAG 对话：基于检索资料 + 历史摘要 + 文件内容生成回答
 * @param sessionId 会话 id（用于上下文摘要缓存）
 * @param input 用户问题
 * @param history 历史对话
 * @param fileContext 用户上传的文件内容
 * @param context 检索得到的资料片段
 * @returns 流式 ChatStreamEvent（content / reasoning / tool_call / tool_result）
 */
export async function* ragChat(
  sessionId: string,
  input: string,
  history: ChatHistory[],
  fileContext: string,
  context: string[],
) {
  const { summaryBlock, recentHistory } = await manageContext(
    sessionId,
    history,
    fileContext,
  );
  const contextText = context.join("\n\n---\n\n");

  // 摘要 + 文件 + 检索资料 + RAG 要求 拼到首条 user message
  const contextParts: string[] = [];
  if (summaryBlock) contextParts.push(`## 历史对话摘要\n${summaryBlock}`);
  if (fileContext) contextParts.push(`## 用户上传的文件\n${fileContext}`);
  contextParts.push(`## 参考资料\n${contextText}`);
  contextParts.push(
    `要求：\n` +
      `1. 根据提供的参考资料或者文件内容回答，不要编造信息\n` +
      `2. 如果参考资料中没有相关信息，请如实说明"根据知识库现有的资料，我无法准确回答这个问题，请补充资料"\n` +
      `3. 回答用中文回复`,
  );
  const contextMsg = new HumanMessage(contextParts.join("\n\n"));

  const messages = [
    contextMsg,
    ...historyToMessages(recentHistory),
    new HumanMessage(input),
  ];

  const stream = await agent().stream({ messages }, { streamMode: "messages" });
  yield* parseAgentStream(stream);
}
