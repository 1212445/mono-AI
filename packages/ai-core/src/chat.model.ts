import { ChatOpenAI } from "@langchain/openai";

// 默认使用 minimax 模型
export function model() {
  const llm = new ChatOpenAI({
    model: "MiniMax-M2.7",
    apiKey: process.env.MINIMAX_API_KEY,
    streaming: true,
    configuration: {
      baseURL: "https://api.minimax.chat/v1",
      defaultHeaders: {
        GroupId: process.env.MINIMAX_GROUP_ID,
      },
    },
  });

  return llm
}
