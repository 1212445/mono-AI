import { tool } from "langchain";
import * as z from "zod";

// 网页搜索工具
export const searchTool = tool(
  async ({ query }) => {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.tavily_api}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: 5,
        include_raw_content: true,
      }),
    });
    const data = (await response.json()) as {
      results?: Array<{
        title: string;
        content: string;
        raw_content?: string | null;
        url: string;
      }>;
    };

    return (
      data.results
        ?.map((r, i) => {
          // 优先用 Tavily 已经清洗过的 raw_content，没有再退回 snippet
          const detail = r.raw_content?.trim() || r.content;
          // 截断避免单次返回撑爆 LLM context
          const truncated =
            detail.length > 8000
              ? detail.slice(0, 8000) + "\n[内容已截断]"
              : detail;
          return `[${i + 1}] ${r.title}\nURL: ${r.url}\n\n${truncated}`;
        })
        .join("\n\n---\n\n") || "未找到相关结果"
    );
  },
  {
    name: "web_search",
    description:
      "联网搜索最新信息或训练数据之外的内容。返回每个结果的标题、URL 和清洗后的正文（已自动抓取页面，无需再调其他工具）。输入应为简洁明确的搜索关键词。",
    schema: z.object({
      query: z.string().describe("搜索关键词，尽量简洁明确"),
    }),
  },
);
