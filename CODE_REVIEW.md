# 项目代码审查报告

## 二、后端 `apps/server` 问题

### B4. `Promise.all` 导致向量化失败时 DB 已写入【P1】

`file-management.service.ts:40-49`：

```ts
const [saved] = await Promise.all([
  this.fileManagementRepository.save(newFile),
  (async () => { const docs = await loading(...); ... await vectorStore(...); })(),
]);
return { message: '上传成功', data: saved };
```

- 若 `vectorStore` 失败，DB 已存记录，但 Milvus 没数据。文件管理列表里有，但 RAG 检索不到。
- 同样 `loading` 失败时已写入 DB。
- **修复**：先做向量化，成功后再 `save(newFile)`，或包事务回滚 Milvus（用 try/catch 删除已写入 chunks）。

## 三、AI 核心 `packages/ai-core` 问题

### C10. `file.split.ts:13-30` 用 `docs[0]?.metadata.ext` 推断切分策略【P2】

- 只看第一个文档的 ext，假设同 batch 全部是同一种扩展
- 实际上 `vectorStore` 把多文件 chunks 都塞一起，跨文件时就乱
- 应该在每个 chunk 的 metadata 上保留 ext 字段，splitter 按 metadata 动态选

### C11. `retrieve.doc.ts` 用 MultiQuery 但只 sort 一次【P2】

```ts
const semanticRetriever = MultiQueryRetriever.fromLLM({ llm, retriever: vectorStore.asRetriever({ k: topK * 3 }), queryCount: 4 });
const results = await semanticRetriever.invoke(query);
const reranked = await rerankDocuments(query, results, topK);
```

- `queryCount: 4` 让 LLM 扩出 4 个 query，每个拿 topK*3 = 9 条
- 最多 36 条送 rerank 取 topK
- 但 `topK*3` 太小，4 query 都可能重复召回相同 chunks
- **建议**：rerank 之前做去重。

### C12. `test.ts` 不符合测试约定【P2】

`packages/ai-core/src/test.ts` 是手写断言测试（用 `node:assert`）。命名上不匹配 Jest/Vitest 规范，应该用 Vitest 框架重写。

---

## 四、前端 `apps/web` 问题

### D1. 路由参数变化时不重载历史【P0】

`pages/chat/index.vue:48-77`：`onMounted` 只在组件挂载时跑一次。但 `/chat/:id` 是**同一组件**，从 `/chat/A` 跳到 `/chat/B`：

- `MessageList` 组件实例被复用（`ref="messageListRef"`）
- `messages` ref 还是 A 的内容
- `loadHistory` 不会自动触发
- **修复**：用 `watch(() => route.params.id, ...)` 监听变化并重载。

### D2. `MessageList.vue` 中 SSE fetch 写死 `http://localhost:3000`【P1】

`MessageList.vue:210`：`fetch("http://localhost:3000/chat", ...)`

- 跟 `axios.config.ts:4` 的 baseURL 重复且不一致
- 部署到线上必须改源码
- **建议**：用环境变量（Vite 的 `import.meta.env.VITE_API_BASE`）

### D3. `MessageList.vue:117-123` `formatToolArgs` 取第一个 value【P2】

```ts
const first = Object.values(args)[0];
if (typeof first === "string") return first.length > 24 ? first.slice(0, 24) + "…" : first;
```

对 `code_sandbox({ language, code })` 会显示 `code` 前 24 字符（"import numpy as np\n…"）而不是 `language: python`。

- **建议**：按 schema 知道字段名，显式取 `args.language || args.query`。

### D4. `MessageList.vue:313-318` reader 结束后 SSE 残留 buffer 处理不严谨【P1】

```ts
if (sseBuffer.trim()) feed("\n\n");
```

- 一个 SSE 事件以 `\n\n` 结尾，但 `feed` 用 `indexOf("\n\n")` 分割
- 如果流最后是 `data: x` 但没有 `\n\n`，sseBuffer 非空
- 主动补 `\n\n` 后处理——但 `\n\n` 末尾多出空 boundary 会被 `feed` 当成下一个空事件再 dispatch 一次
- **建议**：用 `sseBuffer + "\n\n"` 一次跑完，结束后丢弃。

### D5. `markdown/index.vue:8` `html: true` XSS 风险【P0】

- markdown 内容来自 LLM 输出，模型可能被 prompt injection 注入 `<script>` 标签
- `html: true` 会让 `<script>` 直接进 DOM
- 建议关掉 `html` 或用 DOMPurify 过滤

### D6. `MessageList.vue:421-426` 错误兜底覆盖 SSE 已显示内容【P2】

```ts
messages.value[messageIndex].blocks = [{ type: "answer", content: "抱歉，发生了错误...", typed: "..." }];
```

- 在外层 catch 中直接把 blocks 替换为单条 answer
- 但 SSE 流如果已经部分输出（typed != content），会被擦掉
- **建议**：append 一个错误块而不是覆盖。

### D7. `axios.config.ts` 无拦截器逻辑【P1】

```ts
server.interceptors.request.use(config => config, error => Promise.reject(error));
server.interceptors.response.use(response => response, error => Promise.reject(error));
```

拦截器空转，对 4xx/5xx 没有任何统一处理（toast / 401 跳转）。而 `MessageList.vue` 又自己 fetch 不走 axios——拦截器形同虚设。

### D8. `router/index.ts:30-56` 路由守卫只跑一次【P1】

```ts
let allSessionLoaded = false;
router.beforeEach(async (_to, _from, next) => {
  if (!allSessionLoaded) {
    allSessionLoaded = true;
    ...
  }
  next();
});
```

- 全局单次标志，session 新建后不会刷新
- 用户上传新文件、创建新对话后，侧边栏不会更新
- 侧边栏依赖 `chatStore.allSession`，但只在 `chat/index.vue:67-71` 手动 `unshift`，且**只在新对话首次发送时**——历史路由过来、刷新、跨页都不更新
- **建议**：把 `allSession` 拉取做成响应式（如 composable 监听 sessionId 变化）。

### D9. `store/index.ts:9` 类型不一致【P2】

```ts
interface session { sessionId: string; title: string; lastActiveTime: Date; }
```

- API 返回 `string`（ISO 时间）
- home `handleSend` / chat `onMounted` 都手动 `new Date()` 包装
- 类型与运行时不一致

### D10. 前端 `chat/index.vue:33-46` 与 home `handleSend` 风格分裂【P2】

- home：`const sessionId = crypto.randomUUID();`
- 后端：`` `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` ``
- 两种 sessionId 风格混用，前端 UUID 后端 timestamp。
- 后端生成 sessionId 逻辑在 `generateSessionId` 私有方法，但前端的 home / card 路径根本不让后端生成——如果前端 UUID 与后端 timestamp 重复（或 prefix 不同），会话管理会乱。
- **建议**：统一交给后端生成（`POST /chat` 不带 sessionId 时返回），前端不自己造。

### D11. `chat/index.vue:67-71` 手动维护 `allSession` 不可靠【P1】

```ts
chatStore.allSession.unshift({
  sessionId, title: q.slice(0, 20), lastActiveTime: new Date(),
});
```

- `q.slice(0, 20)` 与后端 `ChatSession.title length: 20` 限制对齐——但若 `q` 长度 < 20 不会补，且后端可能还会裁剪
- 重复 sessionId 出现时不会去重
- **建议**：发送成功后从 `findAll` 接口刷新，或把 `allSession` 改用后端数据为 single source of truth。

### D12. `MessageList.vue:198-201` `sendMessage` 中 `controller` 传出去但未暴露【P2】

- `AbortController` 在 `send()` 中创建，未保存到 `defineExpose` 里
- 用户切到其他页面 / 切到其他 session，无法 cancel 在飞的请求
- **建议**：暴露 `abort()`，或在组件卸载时主动 abort。

### D13. `MessageList.vue:126-162` 打字机状态机边界【P2】

- `startTyping` 用 `isTyping` 互斥锁
- 但当新内容 append 进来时，type() 可能因为 `typed === content`（之前已经 typed 完）而 `found=false` 直接退出，不再排 setTimeout
- 下一个 setTimeout 不会被排，新内容永远不打字
- 实际：因为 type() 内每次都遍历 blocks，理论上能 pick up 后续内容，但**如果当前遍历时新内容还没到**——`typed === content` 之后 type() 跑完会 exit，但**新内容 append 不会重启 type 链**
- 看一下 dispatch 流程：`appendToBlock` → `if (!isTyping.value) startTyping(messageIndex)` 重新启动——OK，兜底
- 但有竞争：type() 跑过 `found = false` 之前，如果新内容刚好 append，isTyping 还是 true，新 startTyping 不会进。下一轮 type() 会发现 `found = true` 继续打字——OK
- 看起来最终是 OK 的，但**逻辑绕**，新人难以读懂。

### D14. `router/index.ts:50` `console.error` 用作错误处理【P2】

```ts
} catch (err) {
  allSessionLoaded = false;
  console.error("加载历史会话失败", err);
}
```

- 没 toast 通知用户"侧边栏加载失败"
- 用户看到的是空侧边栏，但不知道为啥

### D15. 前端无 ESLint / Prettier 配置【P1】

- `apps/web/` 下没有 `.eslintrc.*` / `.prettierrc`，CI 不一致
- `apps/server/` 配了 flat config，UI 没有

### D16. 缺少 `useHead` / `app.title` 国际化【P2】

- `App.vue` 不知是否存在，全局 title 没改
- 进入 `/chat/:id` 时浏览器 tab 仍是默认

---

## 五、安全 / 配置问题

### S1. `.env` 包含明文密钥【P0】

`apps/server/.env` 含 `MINIMAX_API_KEY`, `tavily_api`, `RERANK_API_KEY`, `E2B_API_KEY` 明文。

- 确认 `.gitignore` 里有 `.env`（已确认）
- 仍需给协作者一份 `.env.example`（**完全缺失**）
- 建议立刻加 `.env.example`。

### S2. 软编码密钥 / 端点【P1】

- `chat.model.ts:12` `https://api.minimax.chat/v1` 写死
- `embedding.model.ts:7-9` `http://localhost:11434` 写死
- `axios.config.ts:4` `http://localhost:3000` 写死
- `MessageList.vue:210` `http://localhost:3000/chat` 写死
- 应统一从 `import.meta.env` / `process.env` 读。

### S3. CORS credentials=true 但 origin 单一【P1】

`main.ts:20-23` `credentials: true` + `origin: string`，未来加 CDN 域名容易出问题。

---

## 六、CLAUDE.md 提到的命令与实际可执行性

| 命令 | 实际 | 备注 |
|---|---|---|
| `pnpm run start:dev` | OK | webpack HMR 模式 |
| `pnpm run build` (server) | OK | nest build |
| `pnpm run gen` | OK | typeorm-model-generator |
| `pnpm run dev` (web) | OK | Vite |
| `pnpm run build` (web) | OK | vue-tsc + vite build |
| `pnpm run build` (ai-core) | OK | tsc，**但** server 引用 dist |
| `pnpm test` (ai-core) | OK | tsx src/test.ts，但只是手写 assert |

---

## 七、修复优先级建议

### 立即修（P0 阻断功能 / 安全）

1. **B1** SSE 监听客户端断开
2. **B2** `toImageDataUrl` mime 死代码
3. **B3** 错误后仍发 [DONE]
4. **A2** ChatSession 唯一约束
5. **A1** mode 1/2 语义错位（设计决策）
6. **C7** artifact 丢在前端
7. **D1** 路由切换 messages 残留
8. **D5** markdown html:true XSS
9. **S1** .env.example 缺失

### 本迭代修（P1 显著体验 / 性能 / 可维护）

1. **B4** Promise.all 数据一致性
2. **C1** embedding/chat 硬编码
3. **C4** Milvus 客户端缓存
4. **C5** Milvus schema 显式
5. **C6** 沙盒超时过长
6. **D2** SSE fetch 硬编码
7. **D7** axios 拦截器空转
8. **D8** 路由守卫一次性
9. **D11** allSession 维护
10. **B8** dropCollection 默认值
11. **B11** CORS 健壮性
12. **B14** 零单测
13. **A4** synchronize 生产风险

### 后续优化（P2 锦上添花）

1. **A3** 死代码清理
2. **B5** 重复查询
3. **C2** LRU 改写
4. **C8** args 内存泄漏
5. **C10** splitter metadata 动态
6. **D3** formatToolArgs
7. **D13** 打字机状态机
8. 其他列出的 P2 项

---

## 八、亮点（值得保留的设计）

1. **心跳 + 前端 watchdog** 双保险（`chat.service.ts:70-76` + `MessageList.vue:226-232`），20s watchdog 配合 10s 心跳，实战可靠。
2. **`rerankDocuments` 全链路降级**（`rerank.model.ts:45-116`）：配置缺失、超时、网络错都返回原始顺序，不抛错——很好的容错设计。
3. **SSE 状态机 `parseAgentStream`**（`common.chat.ts:28-129`）：用 5 个状态机切 think/answer/tool_call，处理流式 + tool_call args 累积 + 多类型混合，鲁棒。
4. **`flushPending` 防御性尾包**（`common.chat.ts:123-128`）：流结束后把 pending 残留 yield 出去，避免内容丢失。
5. **`stripThinking`**（`memory.ts:197-199`）：摘要前先把 `<think>` 块剥掉，避免噪声进入长期记忆。
6. **沙盒 `_creating` 互斥**（`agent.tool.ts:97-115`）：成功失败都清 `_creating`，避免 rejected promise 永久缓存。
7. **打字机 `armWatchdog` 重置**（`MessageList.vue:255, 263, 267, 280, 290`）：每个事件都 arm，避免误触。
8. **E2B 双上下文**（`agent.tool.ts:138-152`）：按语言缓存 context，跨调用保留变量。

---

## 附录：问题编号索引

| 编号 | 模块 | 文件:行 | 严重程度 | 类别 |
|---|---|---|---|---|
| A1 | 架构 | chat.service.ts:79-143 | P0 | 设计语义 |
| A2 | 架构 | chat-session.entity.ts:9 | P0 | 数据一致性 |
| A3 | 架构 | chat-history.service.ts:38-45 | P2 | 死代码 |
| A4 | 架构 | app.module.ts:30 | P1 | 生产风险 |
| B1 | 后端 | chat.service.ts:28-172 | P0 | 资源浪费 |
| B2 | 后端 | file.util.ts:28-30 | P0 | 逻辑错误 |
| B3 | 后端 | chat.service.ts:144-171 | P0 | 状态混乱 |
| B4 | 后端 | file-management.service.ts:40-49 | P1 | 数据一致性 |
| B5 | 后端 | chat.service.ts:52-59 | P2 | 性能 |
| B6 | 后端 | chat-session.service.ts:18-32 | P2 | 功能缺失 |
| B7 | 后端 | file-management.controller.ts | P1 | 路径硬编码 |
| B8 | 后端 | vector.store.ts:51 | P1 | 一致性 |
| B9 | 后端 | vector.store.ts:64-67 | P2 | 注入风险 |
| B10 | 后端 | chat.controller.ts:50-53 | P2 | 路由设计 |
| B11 | 后端 | main.ts:20-23 | P1 | 健壮性 |
| B12 | 后端 | chat-history.entity.ts:8-13 | P2 | 性能 |
| B13 | 后端 | （无） | — | — |
| B14 | 后端 | apps/server/src/ | P1 | 测试覆盖 |
| C1 | AI核心 | chat.model.ts / embedding.model.ts | P1 | 硬编码 |
| C2 | AI核心 | memory.ts:21-45 | P2 | 缓存策略 |
| C3 | AI核心 | memory.ts:155-164 | P2 | 摘要策略 |
| C4 | AI核心 | retrieve.doc.ts | P1 | 性能 |
| C5 | AI核心 | vector.store.ts:31-43 | P1 | schema 推断 |
| C6 | AI核心 | agent.tool.ts:91-95 | P1 | 成本控制 |
| C7 | AI核心 | agent.tool.ts / MessageList.vue | P1 | 功能缺失 |
| C8 | AI核心 | common.chat.ts:94-108 | P2 | 内存泄漏 |
| C9 | AI核心 | file.loading.ts:10 | P1 | 硬编码 |
| C10 | AI核心 | file.split.ts:13-30 | P2 | splitter 策略 |
| C11 | AI核心 | retrieve.doc.ts | P2 | 去重 |
| C12 | AI核心 | test.ts | P2 | 测试框架 |
| D1 | 前端 | chat/index.vue:48-77 | P0 | 路由 bug |
| D2 | 前端 | MessageList.vue:210 | P1 | 硬编码 |
| D3 | 前端 | MessageList.vue:117-123 | P2 | 字段选择 |
| D4 | 前端 | MessageList.vue:313-318 | P1 | SSE 解析 |
| D5 | 前端 | markdown/index.vue:8 | P0 | XSS 风险 |
| D6 | 前端 | MessageList.vue:421-426 | P2 | 错误处理 |
| D7 | 前端 | axios.config.ts | P1 | 拦截器空转 |
| D8 | 前端 | router/index.ts:30-56 | P1 | 状态同步 |
| D9 | 前端 | store/index.ts:9 | P2 | 类型不一致 |
| D10 | 前端 | chat/index.vue:33-46 | P2 | ID 风格分裂 |
| D11 | 前端 | chat/index.vue:67-71 | P1 | 状态维护 |
| D12 | 前端 | MessageList.vue:198-201 | P2 | 资源释放 |
| D13 | 前端 | MessageList.vue:126-162 | P2 | 状态机 |
| D14 | 前端 | router/index.ts:50 | P2 | 用户反馈 |
| D15 | 前端 | apps/web/ | P1 | 工程化 |
| D16 | 前端 | App.vue | P2 | title 缺失 |
| S1 | 安全 | apps/server/.env | P0 | 密钥管理 |
| S2 | 安全 | 多个文件 | P1 | 硬编码 |
| S3 | 安全 | main.ts:20-23 | P1 | CORS 健壮性 |

---

**统计**：P0 = 9 个 / P1 = 19 个 / P2 = 22 个 / 合计 50 个问题
