# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

基于检索增强生成（RAG）技术的智能对话系统，pnpm monorepo 架构，支持知识库管理与多轮对话。

## 常用命令

```bash
# 安装依赖（workspace 根目录）
pnpm install

# 后端开发（webpack HMR 热重载，端口 3000）
cd apps/server && pnpm run start:dev

# 从已有 MySQL 库同步生成 TypeORM 实体
cd apps/server && pnpm run gen               # 写到 src/entities/

# 前端开发（端口 5173）
cd apps/web && pnpm run dev

# ai-core：修改后必须重新构建，后端才能用最新代码
cd packages/ai-core && pnpm run build

# ai-core：本地 smoke test（依赖 src/test.ts）
cd packages/ai-core && pnpm test
```

## 工作区结构

```
pnpm-workspace.yaml          # 包：apps/*、packages/*
apps/
  server/                    # @rag/server — NestJS 后端（端口 3000）
  web/                       # Vue 3 + Vite 前端（端口 5173）
packages/
  ai-core/                   # @rag/ai-core — LangChain RAG 核心，ESM、需 build
  utils/                     # @rag/utils — 共享工具（前端依赖，workspace:*）
  docker/milvus/             # Milvus standalone + etcd + minio
  ts/                        # 旧共享 TS 包（ai-core devDependency）
```

依赖关系：`apps/server → @rag/ai-core → @rag/ts`，`apps/web → @rag/utils`。

## 架构要点

### 后端 `apps/server`（NestJS）

模块（`src/app.module.ts`）：
- **ChatModule** — `POST /chat` 走 SSE 流式输出，支持 multipart 上传最多 5 个文件（multer `memoryStorage`），模式 `1`=普通对话、`2`=RAG 检索增强；`GET /chat/:id` 取历史；`GET /chat/r/r` 清空 Milvus collection。
- **ChatHistoryModule** — 实体 `ChatHistory`，按 `sessionId` 存取问答。
- **FileManagementModule** — 实体 `FileManagement`，管理上传文件。
- TypeORM `synchronize: true`，启动会自动建表；新增实体后只需在 `app.module.ts` 的 `entities: []` 数组里挂上。

ChatService 编排：解析 mode → 若有 files 用 `utils/file.util.extractFileContent` 抽文本拼入 fileContext → 拉历史 → 调 `model()` / `embedding()` / `retrieveDocuments()` / `ragChat()` / `chat()` 之一 → 逐 chunk 写 SSE → 保存历史 → `data: [DONE]` 结束。

### AI 核心 `packages/ai-core`（LangChain）

ESM 包，入口 `src/index.ts` 导出：
- `loading` / `splitDocs` — 文档加载与分块
- `retrieveDocuments` / `vectorStore` / `dropCollection` / `deleteDocumentsByUniqueId` — Milvus 检索与维护
- `model` / `embedding` — LLM 与 embedding 工厂
- `ragChat` / `chat` — RAG 流式问答与普通流式问答
- `rerankDocuments` — 重排序
- `agent` / `agent.tool` — Agent 模式（含工具调用）
- `memory` — `ChatHistory`、`ManagedContext` 类型

约定：**`pnpm run build` 之前改 ai-core 不会被 server 看到**。server 通过 `workspace:*` 引用编译产物 `dist/`。

### 前端 `apps/web`（Vue 3）

路由使用 **hash 模式**（`createWebHashHistory`），三条路由：`/`（home）、`/chat/:id`、`/kb`（知识库）。

技术栈：Vue 3.5 + Vite 8 + TS 5.9、Tailwind v4（`@tailwindcss/vite`）、`reka-ui`（Shadcn Vue 底层 primitives）+ `class-variance-authority` + `tailwind-merge` + `clsx`、Pinia、vue-router、markdown-it + highlight.js、vue-sonner（toast）、`@tanstack/vue-table`、`axios`、`lucide-vue-next`、`@vueuse/core`。

## 环境配置

`apps/server/.env`（必须自建，git 忽略）实际读取的变量（见 `main.ts` / `app.module.ts`）：
- `db_host` / `db_port` / `db_user` / `db_password` / `db_database` — MySQL
- `milvus_url` / `milvus_collectionName` — Milvus
- `MINIMAX_API_KEY` / `MINIMAX_GROUP_ID` — LLM（**MiniMax**，非 OpenAI）
- `tavily_api` — Tavily 网络检索（Agent 用）
- `RERANK_API_KEY` / `RERANK_URL` / `RERANK_MODEL` — 重排序
- `web_origin` — CORS 允许源
- `PORT` — 服务端口（默认 3000）

`main.ts` 把这些值再回写到 `process.env.*`，ai-core 直接读环境变量获取。

## 数据基础设施

- MySQL（端口 3309）、Milvus ETCD（端口 2379）由 `packages/docker/milvus/docker-compose.yml` 启动。
- 前端通过 `apps/web` 的 Vite 代理把 `/api` 转到后端（具体见 `apps/web/vite.config.ts`，如不存在需自检）。

## MCP 工具

`.mcp.json` 配置了 `docs-langchain`（LangChain 官方文档 HTTP MCP），编写或调试 ai-core 时可优先查询。
