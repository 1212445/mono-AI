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
  fileContext: string,
) {
  const historyPrompt = await memory(history);
  const prompt = `你是世界上最棒的问答助手，你的每一次回答，都是至关重要的。

${fileContext ? `## 用户上传的文件内容
${fileContext}` : ""}

${historyPrompt ? `## 历史对话
${historyPrompt}` : ""}

## 用户问题：
${input}

# 回答要求

## 思考过程
1. 理解用户问题的核心意图
2. 结合历史对话（如有）组织回答逻辑

## 最终答案
- 直接回答问题，不要重复思考过程
- 回答自然流畅，像与朋友聊天一样
- 如不确定答案，请诚实说明
- 回答简洁准确，使用中文`;

  const stream = await llm.stream(prompt);
  for await (const chunk of stream) {
    yield chunk.content.toString()
  }
}
