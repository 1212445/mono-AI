import { ChatOpenAI } from "@langchain/openai";
import { memory } from "./memory.js";

/**
 * 
 * @param input 用户输入
 * @param context 检索得到的数据
 * @param model chat-model
 * @returns 模型输出 (包含think)
 */
export async function* generateAnswer(
  input: string,
  context: string[],
  model: ChatOpenAI,
  history: Array<{ question: string; answer: string }>,
) {
  const contextText = context.join("\n\n---\n\n");
  let historyPrompt = await memory(history);

  const prompt = `你是一个问答助手。请根据以下参考资料回答用户的问题。

历史对话：
${historyPrompt}

参考资料：
${contextText}

用户问题：${input}

要求：
1. 可以参照过往历史对话回答问题
1. 根据提供的参考资料回答，不要编造信息
2. 如果参考资料中没有相关信息，请如实说明"根据提供的资料，我无法回答这个问题"
3. 回答要简洁准确，用中文回复`;

  const stream = await model.stream(prompt);
  for await (const chunk of stream) {
    yield chunk.content.toString()
  }
}
