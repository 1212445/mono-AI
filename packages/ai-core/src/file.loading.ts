import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { JSONLoader } from "@langchain/classic/document_loaders/fs/json";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { Document } from "@langchain/core/documents";

import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DOCS_DIR = join(__dirname, "../../../apps/server/src/upload");

function cleanPDF(doc: Document): Document {
  let content = doc.pageContent.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
  const lines = content.split("\n"); //把文本按 \n 分割成字符串数组，每一行是一个元素
  const mergedLines: string[] = []; //用于存储合并后的段落

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const currentLine = line.trim(); //获取当前行并去除首尾空格
    if (!currentLine) continue;

    //取数组最后一个元素，也就是上一次处理完的行
    const lastMerged = mergedLines[mergedLines.length - 1];
    if (lastMerged) {
      const endsWithPunctuation = /[。；！？]$/.test(lastMerged); //上一段以标点结尾
      const isNumberedHeader = /^\d+[\.、]/.test(currentLine); //当前行是数字编号
      const isRomanNumeral = /^[IVX]+[\.、]/.test(currentLine); //当前行是罗马数字
      const isLetterList = /^[A-Z][\.、]/.test(currentLine); //当前行是字母列表

      if (
        endsWithPunctuation ||
        isNumberedHeader ||
        isRomanNumeral ||
        isLetterList
      ) {
        mergedLines.push(currentLine);
      } else {
        mergedLines[mergedLines.length - 1] = lastMerged + currentLine;
      }
    } else {
      mergedLines.push(currentLine);
    }
  }

  doc.pageContent = mergedLines
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return doc;
}

function cleanCSV(doc: Document): Document {
  doc.pageContent = doc.pageContent.replace(/\r\n/g, "\n").trim();
  return doc;
}

function cleanJSON(doc: Document): Document {
  doc.pageContent = doc.pageContent.replace(/\r\n/g, "\n").trim();
  return doc;
}

function cleanMarkdown(doc: Document): Document {
  doc.pageContent = doc.pageContent
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
  return doc;
}

function cleanPlainText(doc: Document): Document {
  doc.pageContent = doc.pageContent
    .normalize('NFC')
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  return doc;
}

/**
 *
 * @param docs 原始文档
 * @param ext 文件后缀名
 * @returns 清洗后的文档
 */
function cleanDocs(docs: Document[], ext: string): Document[] {
  const cleanFn = {
    ".pdf": cleanPDF,
    ".csv": cleanCSV,
    ".json": cleanJSON,
    ".md": cleanMarkdown,
    ".txt": cleanPlainText,
  }[ext];

  if (cleanFn) {
    return docs.map(cleanFn);
  }
  return docs;
}

/**
 *
 * @param fileName 文件名
 * @returns
 */
export async function loading(fileName: string): Promise<Document[]> {
  const filePath = join(DOCS_DIR, fileName);
  const ext = extname(fileName).toLowerCase();

  let loader;

  switch (ext) {
    case ".pdf":
      loader = new PDFLoader(filePath);
      break;
    case ".csv":
      loader = new CSVLoader(filePath);
      break;
    case ".json":
      loader = new JSONLoader(filePath);
      break;
    case ".md":
    case ".txt":
      loader = new TextLoader(filePath);
      break;
    default:
      throw new Error(`不支持的文件类型: ${ext}`);
  }

  const docs = await loader.load();
  const cleanedDocs = cleanDocs(docs, ext);

  const fileBaseName = basename(fileName, ext);
  cleanedDocs.forEach((doc) => {
    doc.metadata.fileName = fileBaseName;
  });
  return cleanedDocs;
}
