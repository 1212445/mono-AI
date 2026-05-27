import { Document } from "@langchain/core/documents";
import { extname } from "node:path";

import {
  RecursiveCharacterTextSplitter,
  MarkdownTextSplitter,
  TokenTextSplitter
} from "@langchain/textsplitters";

/**
 * 
 * @param docs 数据清洗后的文档
 * @returns 切割后的 chunks
 */
export async function splitDocs(docs: Document[]): Promise<Document[]> {
  const ext = extname(docs[0]?.metadata.source).toLowerCase();
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
  return chunks;
}