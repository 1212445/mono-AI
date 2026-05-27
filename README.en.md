# RAG

An intelligent conversational system based on Retrieval-Augmented Generation (RAG) technology, built with a modern microservices architecture, supporting knowledge base management and intelligent Q&A.

## Features

- 🧠 **Intelligent Conversation** - A Q&A system powered by RAG technology with context-aware memory
- 📚 **Knowledge Base Management** - Supports uploading and retrieving multiple document formats (PDF, CSV, JSON, Markdown, etc.)
- 🔍 **Vector Search** - Efficient semantic search powered by the Milvus vector database
- 💬 **Modern Web UI** - A clean and elegant Vue 3 frontend interface

## Technology Stack

### Backend
- NestJS
- TypeORM
- MySQL
- Milvus (Vector Database)

### Frontend
- Vue 3 + TypeScript
- Vite
- Shadcn Vue (UI Components)

### Core Package
- AI Core - Implementation of core RAG functionality

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose

### Installation

```bash
# Install dependencies
pnpm install
```

### Start Services

#### 1. Start Database Services

```bash
# Start MySQL
cd packages/docker/mysql && docker-compose up -d

# Start Milvus
cd packages/docker/milvus && docker-compose up -d
```

#### 2. Start Backend Service

```bash
cd apps/server

# Development mode (hot-reload)
pnpm run start:dev

# Or production mode
pnpm run build
pnpm run start:prod
```

#### 3. Start Frontend

```bash
cd apps/web

# Development mode
pnpm run dev

# Build production version
pnpm run build
```

## Project Structure

```
rag/
├── apps/
│   ├── server/          # NestJS Backend Service
│   │   └── src/
│   │       ├── chat/         # Chat Module
│   │       └── chat-history/ # Chat History Module
│   └── web/             # Vue 3 Frontend
│       └── src/
│           ├── components/   # UI Components
│           ├── pages/        # Pages
│           └── router/       # Routing Configuration
├── packages/
│   ├── ai-core/        # RAG Core Package
│   │   └── src/
│   │       ├── chat.model.ts     # Chat Model
│   │       ├── embedding.model.ts # Embedding Model
│   │       ├── file.loading.ts  # File Loading
│   │       ├── file.split.ts     # Document Chunking
│   │       ├── memory.ts         # Memory Management
│   │       ├── retrieve.doc.ts   # Document Retrieval
│   │       └── vector.store.ts  # Vector Storage
│   ├── docker/         # Docker Configurations
│   │   ├── milvus/     # Milvus Vector Database
│   │   └── mysql/      # MySQL Database
│   └── ts/             # TypeScript Shared Package
└── pnpm-workspace.yaml # pnpm Workspace Configuration
```

## API Documentation

The backend service runs by default at `http://localhost:3000`

### Chat Endpoint

```bash
# Send a message
POST /chat
Content-Type: application/json

{
  "message": "Your question",
  "conversationId": "Conversation ID (optional)"
}
```

## Environment Variables

The backend requires the following environment variables. See `apps/server/.env` (create this file manually):

- `DATABASE_URL` - MySQL database connection URL
- `MILVUS_HOST` - Milvus service address
- `OPENAI_API_KEY` - OpenAI API key (for GPT models)

## License

MIT License