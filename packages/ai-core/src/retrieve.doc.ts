import { ChatOpenAI } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Milvus } from "@langchain/community/vectorstores/milvus";
import { MultiQueryRetriever } from "@langchain/classic/retrievers/multi_query";
import { rerankDocuments } from "./rerank.model.js";

/**
 * 检索 + 重排序
 * 流程：MultiQuery 扩写 → Milvus 向量检索召回 topK*3 → Jina rerank 精排 → 返回 topK
 * @param query 用户提问
 * @param topK 检索 k 条数据
 * @param llm chat-model
 * @param embedding embedding-model
 * @returns 重排序后的文本数组
 */
export async function retrieveDocuments(
  query: string,
  topK: number = 3,
  llm: ChatOpenAI,
  embedding: OllamaEmbeddings,
): Promise<string[]> {
  const url = `${process.env.milvus_url}`;
  const collectionName = `${process.env.milvus_collectionName}`;

  const vectorStore = await Milvus.fromExistingCollection(embedding, {
    url,
    collectionName,
    textField: "pageContent",
  });
  const semanticRetriever = MultiQueryRetriever.fromLLM({
    llm,
    retriever: vectorStore.asRetriever({ k: topK * 3 }),
    queryCount: 4,
  });
  const results = await semanticRetriever.invoke(query);
  const reranked = await rerankDocuments(query, results, topK);
  return reranked.map((r) => r.document.pageContent);
}
