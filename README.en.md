# RAG

An intelligent conversational system based on Retrieval-Augmented Generation (RAG) technology. Built as a pnpm monorepo with NestJS backend and a Vue 3 frontend, supporting multi-turn dialogue, knowledge-base management, multi-format document retrieval, streaming responses, agent tool use (web search + code sandbox), and image understanding.

## Features

- 🧠 **Multi-turn Dialogue** — SessionId-based context memory, supports plain chat and RAG-augmented modes
- 📚 **Knowledge Base Management** — Upload PDF / CSV / JSON / Markdown, embed and store in Milvus
- 🔍 **Semantic Retrieval** — Milvus similarity search with optional rerank
- 💬 **Streaming Output** — Server-Sent Events with chunked delivery, heartbeat keep-alive, and error bubbles that preserve already-sent content
- 🤖 **Agent Mode** — Model invokes tools on demand: Tavily web search, E2B code sandbox (python / js / ts / bash / r / java). Sandbox artifacts (PNG / SVG / HTML / JSON) are returned to the frontend for direct rendering
- 📎 **Per-session Files** — Up to 5 files per conversation; images go through multimodal understanding, other formats are auto-extracted into context
- 🕘 **History** — MySQL-persisted chat history and session metadata, queryable by SessionId

## Technology Stack

### Frontend (`apps/web`)
- Vue 3.5 + TypeScript 5.9 + Vite 8
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Shadcn Vue (built on `reka-ui` primitives) + `class-variance-authority` + `tailwind-merge` + `clsx`
- Pinia state, Vue Router (hash mode)
- `markdown-it` + `highlight.js` for Markdown and code highlighting
- `vue-sonner` toasts, `@tanstack/vue-table` tables, `axios` HTTP, `lucide-vue-next` icons, `@vueuse/core` composables

### Backend (`apps/server`)
- NestJS 11 (Express by default)
- TypeORM 0.3 + MySQL (`mysql2` driver)
- `@nestjs/config` for `.env` loading, `multer` in-memory multipart parsing
- `webpack` HMR (`webpack-hmr.config.js`)

### AI Core (`packages/ai-core`)
- LangChain: `@langchain/core` / `@langchain/community` / `@langchain/classic` / `@langchain/ollama` / `@langchain/openai`
- Vector store: `@zilliz/milvus2-sdk-node` (Milvus 2.x)
- Document processing: `pdf-parse` + LangChain `textsplitters`
- Code sandbox: `@e2b/code-interpreter` (isolated execution with 30-minute auto-rebuild)
- Validation: `zod`
- Default LLM uses the **MiniMax**-compatible protocol (OpenAI / Ollama also supported), with multimodal image input

### Infrastructure
- MySQL (port 3309) — chat history, file management, session metadata
- Milvus Standalone (port 19530, ETCD 2379, MinIO) — vector storage
- pnpm 10.30.3 workspace

## Project Structure

```
rag/
├── apps/
│   ├── server/                  # @rag/server — NestJS backend (port 3000)
│   │   └── src/
│   │       ├── chat/            # Chat module (SSE streaming)
│   │       ├── chat-history/    # Chat history persistence
│   │       ├── chat-session/    # Session metadata (sidebar list)
│   │       ├── file-management/ # Knowledge base file management
│   │       ├── entities/        # TypeORM entities
│   │       ├── upload/          # Uploaded file storage
│   │       └── utils/           # File parsing utilities
│   └── web/                     # Vue 3 frontend (port 5173)
│       └── src/
│           ├── pages/
│           │   ├── home/        # Home page
│           │   ├── chat/        # Chat page (streaming renderer)
│           │   └── kb/          # Knowledge base management
│           ├── components/      # Shared components (custom animation components: ink-reveal / magnetic-text / typewriter / cascade-text)
│           ├── store/           # Pinia stores
│           └── router/          # Routing (hash mode)
└── packages/
    ├── ai-core/                 # @rag/ai-core — LangChain RAG core (must be built)
    ├── utils/                   # @rag/utils — Shared frontend utilities
    ├── ts/                      # @rag/ts — Shared TS config / types
    └── docker/
        ├── milvus/              # Milvus standalone + etcd + minio
        └── mysql/               # MySQL 8
```

Dependency graph: `apps/server → @rag/ai-core → @rag/ts`, `apps/web → @rag/utils`.

## Quick Start

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 10 (project uses `pnpm@10.30.3`)
- Docker & Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure

```bash
# MySQL (port 3309, root/123456, database `rag`)
cd packages/docker/mysql && docker compose up -d

# Milvus Standalone (port 19530)
cd packages/docker/milvus && docker compose up -d
```

### 3. Configure backend environment

Create `apps/server/.env` (already in `.gitignore`):

```env
# MySQL
db_host=localhost
db_port=3309
db_user=root
db_password=123456
db_database=rag

# Milvus
milvus_url=localhost:19530
milvus_collectionName=rag_docs

# LLM (MiniMax used here; OpenAI / Ollama also supported)
MINIMAX_API_KEY=your-minimax-api-key
MINIMAX_GROUP_ID=your-group-id

# Rerank (optional)
RERANK_API_KEY=your-rerank-key
RERANK_URL=https://your-rerank-endpoint
RERANK_MODEL=your-rerank-model

# Tavily web search (Agent tool)
tavily_api=your-tavily-key

# E2B code sandbox (Agent tool; SDK reads from env automatically)
E2B_API_KEY=your-e2b-key

# Web CORS
web_origin=http://localhost:5173

# Server port
PORT=3000
```

### 4. Start dev services

In three terminals:

```bash
# Terminal 1: build ai-core (must rebuild after any change)
cd packages/ai-core && pnpm run build

# Terminal 2: backend (webpack HMR)
cd apps/server && pnpm run start:dev

# Terminal 3: frontend
cd apps/web && pnpm run dev
```

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

### ai-core pre-build

`ai-core` is an ESM package; the backend consumes its compiled `dist/` via `workspace:*`. **You must rebuild it after any change**:

```bash
cd packages/ai-core && pnpm run build
```

## Development Conventions

- **New TypeORM entity**: create the class under `src/entities/`, then add it to the `entities: []` array in `app.module.ts`. `synchronize: true` auto-creates the table.
- **New module**: standard NestJS pattern, register in `imports: []` of `app.module.ts`.
- **Reuse ai-core**: `apps/server` imports via `import { model, embedding, retrieveDocuments, ragChat, chat, agent, ... } from '@rag/ai-core'`. Do not assemble LangChain directly in the backend.
- **Frontend styling**: Tailwind v4 atomic classes + `cn()` (clsx + tailwind-merge).
- **XSS protection**: markdown-it rendering of user / LLM content uses a strict whitelist. Sandbox artifacts render through a separate pipeline and never mix into markdown HTML.

## License

MIT
