# RAG 智能对话系统

基于检索增强生成（RAG）技术的智能对话系统，支持多轮对话、知识库管理、多格式文档检索、流式回答、Agent 网络检索、代码沙盒执行与图片理解。

## 功能特性

- 🧠 **多轮对话** — 基于 SessionId 的上下文记忆，支持普通对话与 RAG 增强两种模式
- 📚 **知识库管理** — 上传 PDF / CSV / JSON / Markdown 等文档，经嵌入后存入 Milvus 向量库
- 🔍 **语义检索** — 基于 Milvus 的相似度检索 + 可选 Rerank 重排序
- 💬 **流式输出** — 后端通过 SSE（Server-Sent Events）逐 chunk 推送，附带心跳保活与错误气泡
- 🤖 **Agent 模式** — 模型按需调用工具：Tavily 联网搜索、E2B 代码沙盒（python / js / ts / bash / r / java），沙盒产物（PNG / SVG / HTML / JSON）回传到前端独立渲染
- 📎 **会话级文件** — 对话中上传文件（最多 5 个），图片走多模态理解、其他格式自动抽取文本作为上下文
- 🕘 **历史回溯** — MySQL 持久化聊天记录与会话元数据，按 SessionId 查询

## 技术栈

### 前端 `apps/web`
- Vue 3.5 + TypeScript 5.9 + Vite 8
- Tailwind CSS v4（`@tailwindcss/vite`）
- Shadcn Vue（基于 `reka-ui` 原语）+ `class-variance-authority` + `tailwind-merge` + `clsx`
- Pinia 状态管理、Vue Router（hash 模式）
- `markdown-it` + `highlight.js` 渲染 Markdown 与代码高亮
- `vue-sonner` 消息提示、`@tanstack/vue-table` 表格、`axios` HTTP、`lucide-vue-next` 图标、`@vueuse/core` 组合式工具

### 后端 `apps/server`
- NestJS 11（Fastify/Express，默认 Express）
- TypeORM 0.3 + MySQL（`mysql2` 驱动）
- `@nestjs/config` 加载 `.env`，`multer` 内存式 multipart 解析
- `webpack` HMR 热重载（`webpack-hmr.config.js`）

### AI 核心 `packages/ai-core`
- LangChain：`@langchain/core` / `@langchain/community` / `@langchain/classic` / `@langchain/ollama` / `@langchain/openai`
- 向量库：`@zilliz/milvus2-sdk-node`（Milvus 2.x SDK）
- 文档处理：`pdf-parse` + LangChain `textsplitters`
- 校验：`zod`
- 代码沙盒：`@e2b/code-interpreter`（隔离执行 + 30 分钟自动重建）
- 默认 LLM 走 **MiniMax** 兼容协议（也支持 OpenAI / Ollama），支持多模态图片输入

### 基础设施
- MySQL（端口 3309）— 聊天历史、文件管理
- Milvus Standalone（端口 19530、ETCD 2379、MinIO）— 向量存储
- pnpm 10.30.3 workspace

## 项目结构

```
rag/
├── apps/
│   ├── server/                  # @rag/server — NestJS 后端（端口 3000）
│   │   └── src/
│   │       ├── chat/            # 对话模块（SSE 流式）
│   │       ├── chat-history/    # 聊天历史持久化
│   │       ├── chat-session/    # 会话元数据（侧边栏列表）
│   │       ├── file-management/ # 知识库文件管理
│   │       ├── entities/        # TypeORM 实体
│   │       ├── upload/          # 上传文件存储目录
│   │       └── utils/           # 文件解析等工具
│   └── web/                     # Vue 3 前端（端口 5173）
│       └── src/
│           ├── pages/
│           │   ├── home/        # 首页
│           │   ├── chat/        # 对话页（流式渲染）
│           │   └── kb/          # 知识库管理
│           ├── components/      # 通用组件（含 ink-reveal / magnetic-text / typewriter / cascade-text 等自研动画组件）
│           ├── store/           # Pinia 状态
│           └── router/          # 路由（hash 模式）
└── packages/
    ├── ai-core/                 # @rag/ai-core — LangChain RAG 核心（需 build）
    ├── utils/                   # @rag/utils — 共享前端工具
    ├── ts/                      # @rag/ts — 共享 TS 配置/类型
    └── docker/
        ├── milvus/              # Milvus standalone + etcd + minio
        └── mysql/               # MySQL 8
```

依赖关系：`apps/server → @rag/ai-core → @rag/ts`，`apps/web → @rag/utils`。

## 快速开始

### 环境要求
- Node.js ≥ 18
- pnpm ≥ 10（项目使用 `pnpm@10.30.3`）
- Docker & Docker Compose

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动基础设施

```bash
# MySQL（端口 3309，root/123456，库名 rag）
cd packages/docker/mysql && docker compose up -d

# Milvus Standalone（端口 19530）
cd packages/docker/milvus && docker compose up -d
```

### 3. 配置后端环境变量

在 `apps/server/.env`（**需自建**，已在 `.gitignore` 中）：

```env 示例
# MySQL（端口默认 3309，按 docker-compose 实际配置修改）
db_host=localhost
db_port=3309
db_user=root
db_password=123456
db_database=rag

# Milvus
milvus_url=localhost:19530
milvus_collectionName=rag_docs

# LLM（用什么都行，我这里用的minimax）
MINIMAX_API_KEY=your-minimax-api-key
MINIMAX_GROUP_ID=your-group-id

# Rerank（可选）
RERANK_API_KEY=your-rerank-key
RERANK_URL=https://your-rerank-endpoint
RERANK_MODEL=your-rerank-model

# Tavily 网络检索（Agent 联网搜索工具）
tavily_api=your-tavily-key

# E2B 代码沙盒（Agent 代码执行工具，SDK 自动从环境变量读取）
E2B_API_KEY=your-e2b-key

# Web CORS
web_origin=http://localhost:5173

# 服务端口
PORT=3000
```

### 4. 启动开发服务

三个终端：

```bash
# 终端 1：构建 ai-core（修改后必须重新构建）
cd packages/ai-core && pnpm run build

# 终端 2：后端（webpack HMR）
cd apps/server && pnpm run start:dev

# 终端 3：前端
cd apps/web && pnpm run dev
```

访问：
- 前端：http://localhost:5173
- 后端：http://localhost:3000

### ai-core 预构建

ai-core 是 ESM 包，后端通过 `workspace:*` 引用其 `dist/`，**修改后必须重新构建**：

```bash
cd packages/ai-core && pnpm run build
```

## 开发规范

- **新增 TypeORM 实体**：在 `src/entities/` 创建类，然后在 `app.module.ts` 的 `entities: []` 数组挂上。`synchronize: true` 会自动建表。
- **新增模块**：标准 NestJS 模式，在 `app.module.ts` 的 `imports: []` 注册。
- **复用 ai-core 能力**：`apps/server` 通过 `import { model, embedding, retrieveDocuments, ragChat, chat, agent, ... } from '@rag/ai-core'` 引入，禁止在后端直接拼装 LangChain。
- **前端样式**：统一使用 Tailwind v4 原子类 + `cn()`（`clsx` + `tailwind-merge`）合并。
- **XSS 防护**：所有用户 / LLM 文本走 markdown-it 渲染时启用严格白名单；沙盒 artifact 走独立渲染通道，不与 markdown 管道混用。

## 许可证

MIT
