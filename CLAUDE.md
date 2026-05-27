# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

基于检索增强生成（RAG）技术的智能对话系统，采用 pnpm monorepo 结构。

## 常用命令

```bash
# 安装依赖
pnpm install

# 后端开发（热重载）
cd apps/server && pnpm run start:dev

# 前端开发
cd apps/web && pnpm run dev

# 构建 ai-core（修改后必须执行）
cd packages/ai-core && pnpm run build
```

## 工作区结构

```
pnpm-workspace.yaml
apps/
  ├── server/     # NestJS 后端 (端口 3000)
  └── web/        # Vue 3 + Vite 前端 (端口 5173)
packages/
  ├── ai-core/    # RAG 核心功能
  ├── docker/     # Milvus/MySQL Docker 配置
  └── ts/         # 共享 TypeScript 工具
```

## 架构要点

### 后端 (apps/server)
- **模块**: ChatModule (对话), ChatHistoryModule (聊天历史)
- **数据库**: TypeORM + MySQL，实体位于 `src/entities/`
- **API**: RESTful 对话接口 `/chat`
- **依赖注入**: 通过 NestJS 模块系统集成 `@rag/ai-core`

### AI 核心 (packages/ai-core)
LangChain 驱动的 RAG 管道：
- `chat.model.ts` - 对话模型（支持 Ollama/OpenAI）
- `embedding.model.ts` - 向量嵌入模型
- `file.loading.ts` - 文档加载（PDF/CSV/JSON/Markdown）
- `file.split.ts` - 文档分块
- `memory.ts` - 对话记忆管理
- `retrieve.doc.ts` - 相似度检索
- `vector.store.ts` - Milvus 向量存储

### 前端 (apps/web)
- Vue 3 + TypeScript + Vite
- Tailwind CSS v4 + Shadcn Vue (Reka UI)
- 状态管理: Pinia, 路由: Vue Router
- Markdown 渲染: markdown-it + highlight.js

## 注意事项

**ai-core 修改后必须重新构建**：每次修改 `packages/ai-core` 中的代码后，必须在该目录下执行 `pnpm run build`，后端才能使用最新代码。

## 依赖关系

```
apps/server → packages/ai-core → packages/ts
```

## 环境配置

后端需要 `.env` 文件（参考 `apps/server/.env.example` 或自行创建），包含：
- `db_host`, `db_port`, `db_user`, `db_password`, `db_database` — MySQL 连接
- `MILVUS_HOST` — Milvus 向量数据库地址
- `OPENAI_API_KEY` / `OLLAMA_BASE_URL` — LLM 配置

## 数据库

MySQL 端口 3309，Milvus ETCD 端口 2379。可通过 `packages/docker/milvus/docker-compose.yml` 启动。