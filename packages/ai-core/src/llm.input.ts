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
  fileContext: string,
) {
  const contextText = context.join("\n\n---\n\n");
  let historyPrompt = await memory(history);

  const prompt = `你是世界上最棒的问答助手，你的每一次回答，都是至关重要的。

${fileContext ? `## 用户上传的文件内容
${fileContext}` : ""}

${historyPrompt ? `## 历史对话
${historyPrompt}` : ""}

## 参考资料
${contextText}
## 用户问题：
${input}

要求：
1. 根据提供的参考资料或者文件内容回答，不要编造信息
2. 如果参考资料中没有相关信息，请如实说明"根据知识库现有的资料，我无法准确回答这个问题，请补充资料"
3. 回答用中文回复`;

  const stream = await model.stream(prompt);
  for await (const chunk of stream) {
    yield chunk.content.toString();
  }
}
