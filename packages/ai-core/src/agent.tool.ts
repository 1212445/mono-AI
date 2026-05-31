import { ChatOllama } from "@langchain/ollama";
import { createAgent, tool } from "langchain";
import { z } from "zod";

async function test() {
  const llm = new ChatOllama({
    model: "qwen3-vl:2b-instruct-q8_0",
  });
  // 定义搜索工具
  const searchTool = tool(
    async ({ query }) => {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer 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`,
        },
        body: JSON.stringify({
          query,
          search_depth: "basic", // "basic" 或 "advanced"
          max_results: 5,
        }),
      });
      const data = await response.json() as {
        results?: Array<{ title: string; content: string; url: string }>;
      };
      return (
        data.results
          ?.map(
            (r, i) =>
              `${i + 1}. ${r.title}\n${r.content}\nURL: ${r.url}`,
          )
          .join("\n\n") || "未找到相关结果"
      );
    },
    {
      name: "web_search",
      description:
        "当需要获取最新信息、实时数据或超出训练知识范围的问题时，使用此工具进行联网搜索。输入应为搜索关键词。",
      schema: z.object({
        query: z.string().describe("搜索关键词，尽量简洁明确"),
      }),
    },
  );
  const agent = createAgent({
    model: llm,
    tools: [searchTool],
  });

  const res = await agent.invoke({
    messages: [{ role: "user", content: "今天有什么新闻" }],
  });

  console.log(res);
}

test();
