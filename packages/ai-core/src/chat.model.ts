import { ChatOpenAI } from "@langchain/openai";

// 默认使用 minimax 模型
let _llm: ChatOpenAI | null = null;
export function model(): ChatOpenAI {
  if (_llm) return _llm;
  _llm = new ChatOpenAI({
    model: "MiniMax-M3",
    apiKey: process.env.MINIMAX_API_KEY,
    streaming: true,
    configuration: {
      baseURL: "https://api.minimax.chat/v1",
      defaultHeaders: {
        GroupId: process.env.MINIMAX_GROUP_ID,
      },
    },
  });
  return _llm;
}
