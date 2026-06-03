import { OllamaEmbeddings } from "@langchain/ollama";

let _embedding: OllamaEmbeddings | null = null;
export function embedding(): OllamaEmbeddings {
  if (_embedding) return _embedding;
  _embedding = new OllamaEmbeddings({
    model: "qwen3-embedding:4b-q4_K_M",
    baseUrl: "http://localhost:11434",
  });
  return _embedding;
}
