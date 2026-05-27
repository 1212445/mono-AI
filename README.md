

Based on the code map provided, I can see this is a RAG (Retrieval-Augmented Generation) application called "rag" with a monorepo structure. Let me analyze the key components:

**Project Structure:**
- **apps/server** - NestJS backend (TypeScript)
- **apps/web** - Vue 3 + TypeScript + Vite frontend
- **packages/ai-core** - AI/RAG core package
- **packages/docker** - Docker configurations (Milvus, MySQL)
- **packages/ts** - TypeScript shared package

**Key Technologies:**
- Backend: NestJS, TypeORM
- Frontend: Vue 3, Vite, TypeScript
- AI/RAG: Embedding models, Vector store (Milvus), Memory management
- Database: MySQL, Milvus (vector database)

Now I'll create a comprehensive README:

---

# RAG

一个基于检索增强生成（RAG）技术的智能对话系统，采用现代化微服务架构，支持知识库管理和智能问答。

## 项目特性

- 🧠 **智能对话** - 基于 RAG 技术的问答系统，支持上下文记忆
- 📚 **知识库管理** - 支持多种文档格式（PDF、CSV、JSON、Markdown 等）的上传和检索
- 🔍 **向量检索** - 基于 Milvus 向量数据库的高效语义搜索
- 💬 **现代 Web UI** - 简洁美观的Vue 3前端界面

## 技术栈

### 后端
- NestJS
- TypeORM
- MySQL
- Milvus (向量数据库)

### 前端
- Vue 3 + TypeScript
- Vite
- Shadcn Vue (UI组件)

### 核心包
- AI Core - RAG 核心功能实现

## 快速开始

### 前置要求

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose

### 安装

```bash
# 安装依赖
pnpm install
```

### 启动服务

#### 1. 启动数据库服务

```bash
# 启动 MySQL
cd packages/docker/mysql && docker-compose up -d

# 启动 Milvus
cd packages/docker/milvus && docker-compose up -d
```

#### 2. 启动后端服务

```bash
cd apps/server

# 开发模式（热重载）
pnpm run start:dev

# 或生产模式
pnpm run build
pnpm run start:prod
```

#### 3. 启动前端

```bash
cd apps/web

# 开发模式
pnpm run dev

# 构建生产版本
pnpm run build
```

## 项目结构

```
rag/
├── apps/
│   ├── server/          # NestJS 后端服务
│   │   └── src/
│   │       ├── chat/         # 对话模块
│   │       └── chat-history/ # 聊天历史模块
│   └── web/             # Vue 3 前端
│       └── src/
│           ├── components/   # UI组件
│           ├── pages/        # 页面
│           └── router/       # 路由配置
├── packages/
│   ├── ai-core/        # RAG 核心包
│   │   └── src/
│   │       ├── chat.model.ts     # 对话模型
│   │       ├── embedding.model.ts # 向量嵌入模型
│   │       ├── file.loading.ts  # 文件加载
│   │       ├── file.split.ts     # 文档分块
│   │       ├── memory.ts         # 记忆管理
│   │       ├── retrieve.doc.ts   # 文档检索
│   │       └── vector.store.ts  # 向量存储
│   ├── docker/         # Docker配置
│   │   ├── milvus/     # Milvus向量数据库
│   │   └── mysql/      # MySQL数据库
│   └── ts/             # TypeScript共享包
└── pnpm-workspace.yaml # pnpm工作区配置
```

## API 文档

后端服务默认运行在 `http://localhost:3000`

### 对话接口

```bash
# 发送消息
POST /chat
Content-Type: application/json

{
  "message": "你的问题",
  "conversationId": "对话ID（可选）"
}
```

## 环境变量

后端服务需要配置以下环境变量，详见 `apps/server/.env`（需自行创建）：

- `DATABASE_URL` - MySQL数据库连接地址
- `MILVUS_HOST` - Milvus服务地址
- `OPENAI_API_KEY` - OpenAI API密钥（用于GPT模型）

## 许可证

MIT License
