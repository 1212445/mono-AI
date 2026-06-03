import { Document } from "@langchain/core/documents";

export interface RerankResult {
  index: number;
  relevanceScore: number;
  document: Document;
}

interface RerankRequest {
  model: string;
  query: string;
  top_n: number;
  documents: string[];
  return_documents: boolean;
}

interface RerankResponseItem {
  index: number;
  relevance_score: number;
}

interface RerankResponse {
  results: RerankResponseItem[];
  usage?: { total_tokens: number };
}

const REQUEST_TIMEOUT_MS = 30_000;

function fallback(docs: Document[], topN: number): RerankResult[] {
  return docs.slice(0, topN).map((doc, index) => ({
    index,
    relevanceScore: 0,
    document: doc,
  }));
}

/**
 * 调用 rerank 接口对文档重排序,兼容 Jina / SiliconFlow 等 Cohere 风格接口
 * 任意失败(配置缺失 / 超时 / 网络错误 / HTTP 错误)均降级为原始顺序前 topN 条,不抛错
 * @param query 查询文本
 * @param docs 待排序的文档
 * @param topN 返回前 N 条
 * @returns 按相关性降序的文档列表;降级时为原始顺序
 */
export async function rerankDocuments(
  query: string,
  docs: Document[],
  topN: number = 3,
): Promise<RerankResult[]> {
  if (docs.length === 0) return [];

  const apiKey = process.env.RERANK_API_KEY ?? "";
  const model = process.env.RERANK_MODEL ?? "";
  const url = process.env.RERANK_URL ?? "";

  if (!apiKey || !model || !url) {
    console.warn(
      "[rerank] 跳过重排:RERANK_API_KEY / RERANK_MODEL / RERANK_URL 未完整配置",
    );
    return fallback(docs, topN);
  }

  const body: RerankRequest = {
    model,
    query,
    top_n: Math.min(topN, docs.length),
    documents: docs.map((d) => d.pageContent),
    return_documents: false,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(
        `[rerank] 接口返回错误,降级使用原始顺序: ${response.status} ${response.statusText} - ${errText}`,
      );
      return fallback(docs, topN);
    }

    const data = (await response.json()) as RerankResponse;
    if (!data.results || data.results.length === 0) {
      return fallback(docs, topN);
    }

    return data.results
      .filter((r) => r.index >= 0 && r.index < docs.length)
      .map((r) => ({
        index: r.index,
        relevanceScore: r.relevance_score,
        document: docs[r.index]!,
      }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const causeRaw = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
    const cause =
      causeRaw instanceof Error
        ? `${causeRaw.name}: ${causeRaw.message}`
        : causeRaw
          ? String(causeRaw)
          : "n/a";
    console.warn(
      `[rerank] 请求失败,降级使用原始顺序 | url=${url} | reason=${reason} | cause=${cause}`,
    );
    return fallback(docs, topN);
  }
}
