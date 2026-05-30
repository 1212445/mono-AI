import { Document } from "@langchain/core/documents";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Milvus } from "@langchain/community/vectorstores/milvus";

import { MilvusClient } from "@zilliz/milvus2-sdk-node";

export async function vectorStore(
  splitDocs: Document[],
  embeddings: OllamaEmbeddings,
) {
  // 提取文本用于后续存储 关键词检索
  const texts = splitDocs.map((doc) => doc.pageContent);
  const metadatas = splitDocs.map((doc) => doc.metadata);

  const vectorStore = await Milvus.fromTexts(texts, metadatas, embeddings, {
    url: "http://localhost:19530",
    collectionName: "my_docs",
    textField: "pageContent", // 给原始文本起个名字存到数据库
    indexCreateOptions: {
      index_type: "HNSW",
      metric_type: "L2",
      params: {
        M: 16,
        efConstruction: 256,
      },
    },
  });
  return vectorStore;
}

/**
 * 清空集合
 * @param collectionName 集合名
 */
export async function dropCollection(collectionName: string = "my_docs") {
  const client = new MilvusClient({ address: "http://localhost:19530" });
  await client.dropCollection({ collection_name: collectionName });
}
