import { Document } from "@langchain/core/documents";
import {
  RecursiveCharacterTextSplitter,
  MarkdownTextSplitter,
} from "@langchain/textsplitters";

/**
 *
 * @param docs 数据清洗后的文档
 * @returns 切割后的 chunks
 */
export async function splitDocs(docs: Document[]): Promise<Document[]> {
  const ext = docs[0]?.metadata.ext.toLowerCase();
  let splitter;
  if (ext == ".md") {
    splitter = new MarkdownTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
  } else {
    splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
  }
  const chunks = await splitter.splitDocuments(docs);
  chunks.forEach((chunk, index) => {
    chunk.metadata.chunkIndex = index;
    chunk.metadata.totalChunks = chunks.length;
  });
  return chunks;
}
