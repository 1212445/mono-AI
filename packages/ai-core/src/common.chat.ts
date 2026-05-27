import { ChatOpenAI } from "@langchain/openai";
import { memory } from "./memory.js";

/**
 *
 * @param llm 模型
 * @param input 输入
 * @returns 简单回答
 */

export async function* chat(
  llm: ChatOpenAI,
  input: string,
  history: Array<{ question: string; answer: string }>,
) {
  const historyPrompt = await memory(history);
  const prompt = historyPrompt
    ? `${historyPrompt} 用户: ${input}`
    : `用户: ${input}`;

  const stream = await llm.stream(prompt);
  for await (const chunk of stream) {
    yield chunk.content.toString()
  }
}
