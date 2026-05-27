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

//判定文件是否存在数据库中（感觉不需要）
export async function docsExisting(docs: Document[]): Promise<boolean> {
  const client = new MilvusClient({
    address: "http://localhost:19530",
  });
  const filename = docs[0]?.metadata.fileName;
    // 加载集合
  await client.loadCollection({
    collection_name: "my_docs",
  });
  const existing = await client.query({
    collection_name: "my_docs",
    expr: `fileName == "${filename}"`,
    output_fields: ["langchain_primaryid"],
    limit: 1,
  });
  return existing.data.length > 0 ? true : false;
}

/**
 * 清空集合
 * @param collectionName 集合名
 */
export async function dropCollection(collectionName: string = "my_docs") {
  const client = new MilvusClient({ address: "http://localhost:19530" });
  await client.dropCollection({ collection_name: collectionName });
}
