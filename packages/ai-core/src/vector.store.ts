import { Document } from "@langchain/core/documents";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Milvus } from "@langchain/community/vectorstores/milvus";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";

export async function vectorStore(
  splitDocs: Document[],
  embeddings: OllamaEmbeddings,
): Promise<void> {
  const texts = splitDocs.map((doc) => doc.pageContent);
  const metadatas = splitDocs.map((doc) => doc.metadata);
  const client = new MilvusClient({ address: `${process.env.milvus_url}` });
  const collections = await client.listCollections();
  const collectionName = `${process.env.milvus_collectionName}`;
  const collectionExists = collections.data.some(
    (c) => c.name === collectionName,
  );
  await client.closeConnection();

  if (collectionExists) {
    // 集合已存在，追加文档
    const vectorStore = await Milvus.fromExistingCollection(embeddings, {
      url: `${process.env.milvus_url}`,
      collectionName,
      textField: "pageContent",
    });
    await vectorStore.addDocuments(splitDocs);
  } else {
    // 集合不存在，创建新集合
    await Milvus.fromTexts(texts, metadatas, embeddings, {
      url: `${process.env.milvus_url}`,
      collectionName,
      textField: "pageContent",
      indexCreateOptions: {
        index_type: "HNSW",
        metric_type: "L2",
        params: {
          M: 16,
          efConstruction: 256,
        },
      }
    });
  }
}

/**
 * 清空集合
 * @param collectionName 集合名
 */
export async function dropCollection(collectionName: string = "mono_docs") {
  const client = new MilvusClient({ address: `${process.env.milvus_url}` });
  await client.dropCollection({ collection_name: collectionName });
  await client.closeConnection();
}


