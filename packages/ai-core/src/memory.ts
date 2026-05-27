import { ChatOpenAI } from "@langchain/openai";

/**
 * 
 * @param history 上下文记忆
 * @param maxRounds 最多保留轮数
 * @returns 历史对话
 */
export async function memory(
  history: Array<{ question: string; answer: string }>,
  maxRounds: number = 5
) {
 const recentHistory = history.slice(-maxRounds);

  if (recentHistory.length > 0) {
    const historyText = recentHistory
      .map((h) => `用户: ${h.question}\nAI: ${h.answer}`)
      .join("\n\n");

   const  prompt = `历史对话:\n${historyText}\n\n`;
   return prompt
  }
  return `这是一个新对话,没有历史对话`
}
