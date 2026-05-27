import { OllamaEmbeddings } from "@langchain/ollama";

export function embedding() {
  const embedding = new OllamaEmbeddings({
    model: "qwen3-embedding:4b-q4_K_M",
    //dimensions: 1024,
    baseUrl: "http://localhost:11434",
  });
  
  return embedding
}