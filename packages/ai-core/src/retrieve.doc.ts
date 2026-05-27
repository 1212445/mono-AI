import { ChatOpenAI } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Document } from "@langchain/core/documents";
import { Milvus } from "@langchain/community/vectorstores/milvus";

import { MultiQueryRetriever } from "@langchain/classic/retrievers/multi_query";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { EnsembleRetriever } from "@langchain/classic/retrievers/ensemble";

import { ContextualCompressionRetriever } from "@langchain/classic/retrievers/contextual_compression";
import { LLMChainExtractor } from "@langchain/classic/retrievers/document_compressors/chain_extract";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";

/**
 * 
 * @param query 用户提问
 * @param topK 检索k条数据
 * @param llm chat-model
 * @param embedding embedding-model
 * @returns 混合检索+重排序 后的数据
 */
export async function retrieveDocuments(
  query: string,
  topK: number = 3,
  llm: ChatOpenAI,
  embedding: OllamaEmbeddings,
): Promise<string[]> {
  //1 构建向量查询
  const vectorStore = await Milvus.fromExistingCollection(embedding, {
    url: "http://localhost:19530",
    collectionName: "my_docs",
    textField: "pageContent",
  });

  const semanticRetriever = MultiQueryRetriever.fromLLM({
    llm,
    retriever: vectorStore.asRetriever({ k: topK * 2 }),
    queryCount: 4,
  });

  //2 构建关键词查询
  const client = new MilvusClient({
    address: "http://localhost:19530",
  });

  const allDocsFromDb = await client.query({
    collection_name: "my_docs",
    limit: 1000,
    output_fields: ["pageContent"],
  });

  const allDocs: Document[] = (allDocsFromDb.data || []).map(
    (row: Record<string, unknown>) =>
      new Document({
        pageContent: row.pageContent as string,
        metadata: row,
      }),
  );

  const keywordRetriever = new BM25Retriever({ docs: allDocs, k: topK * 2 });

  //3. 混合检索
  const ensembleRetriever = new EnsembleRetriever({
    retrievers: [semanticRetriever, keywordRetriever],
    weights: [0.5, 0.5],
    c: 60,
  });

  const results = await ensembleRetriever.invoke(query);

  //4. 上下文压缩检索器
  const compressionRetriever = new ContextualCompressionRetriever({
    baseCompressor: LLMChainExtractor.fromLLM(llm),
    baseRetriever: ensembleRetriever,
  });

  const rerankedResults = await compressionRetriever.invoke(query);

  const finalResults =
    rerankedResults.length > 0
      ? rerankedResults.slice(0, topK)
      : results.slice(0, topK);

  return finalResults.map((doc) => doc.pageContent);
}
