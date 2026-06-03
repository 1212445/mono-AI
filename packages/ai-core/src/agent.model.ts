import { createAgent } from "langchain";
import { model } from "./chat.model.js";
import { searchTool } from "./agent.tool.js";

export type AppAgent = ReturnType<typeof createAgent>;

let _agent: AppAgent | null = null;
export function agent(): AppAgent {
  if (_agent) return _agent;
  _agent = createAgent({
    model: model(),
    tools: [searchTool],
    systemPrompt: `你是 mono 世界上最棒的AI助手，全领域 AI 专家。`,
  });
  return _agent;
}
