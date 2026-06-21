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

## 四、前端 `apps/web` 问题

## 五、安全 / 配置问题


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
