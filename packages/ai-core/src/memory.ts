import { HumanMessage, AIMessage, BaseMessage } from "langchain";
import { model } from "./chat.model.js";

export interface ChatHistory {
  question: string;
  answer: string;
}

export interface ManagedContext {
  summaryBlock: string; // 早期对话累积摘要，调用方拼到首条 user message
  recentHistory: ChatHistory[]; // 最近 K 轮原始数据，调用方转 messages 保留角色标签
}

interface ContextState {
  summary: string; // 当前合并后的摘要
  summarizedUpTo: number; // 摘要覆盖到的轮次下标
}

const THRESHOLD_TOKENS = 800_000; // 1M 窗口的 80%
const KEEP_RECENT_TURNS = 5;
const MAX_CACHE_SIZE = 10; // 最大缓存会话数

const _cache = new Map<string, ContextState>();
/**
 * 缓存淘汰函数：当缓存条目数超过 MAX_CACHE_SIZE 时，
 * 按 Map 的插入顺序（FIFO）淘汰最早的若干个会话状态。
 *
 * 实现细节：
 * - JavaScript 的 Map 会保留键的插入顺序
 * - Array.from(_cache.keys()) 拿到的就是"从最旧到最新"
 * - .slice(0, _cache.size - MAX_CACHE_SIZE) 截取的是最旧的 N 个
 *
 * 注意：这是 FIFO，不是 LRU（最近最少使用）。
 * 长期被频繁访问的会话如果插入时已满，也会被淘汰。
 * 改成 LRU 需要在 ContextState 上加 lastAccessTime 并在 manageContext 入口处更新。
 */
function cleanupCache(): void {
  if (_cache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(_cache.keys()).slice(
      0,
      _cache.size - MAX_CACHE_SIZE,
    );
    keysToDelete.forEach((key) => _cache.delete(key));
  }
}

/**
 * 把 ChatHistory[] 转换为 LangChain 的 BaseMessage[]。
 *
 * 转换规则：每一轮 { question, answer } 展开成两条消息：
 *   - HumanMessage(question)  —— 用户发言
 *   - AIMessage(answer)       —— AI 发言
 *
 * 用 flatMap 而不是 map 是为了避免得到 [[H, A], [H, A], ...] 的嵌套数组，
 * 最终结果是一维的 [H, A, H, A, ...]，LangChain 才能正确按发言顺序处理。
 *
 * @param history - 历史对话数组
 * @returns LangChain 消息数组
 */
export function historyToMessages(history: ChatHistory[]): BaseMessage[] {
  return history.flatMap((h) => [
    new HumanMessage(h.question),
    new AIMessage(h.answer),
  ]);
}

/**
 * 上下文管理器：根据当前 token 用量决定如何处理会话历史。
 *
 * 核心策略（增量压缩）：
 *   1. 每个 session 维护一份 ContextState，记录"已压到哪一轮"
 *   2. 每次调用时，并行计算"已摘要 + 剩余原始 + 文件"的 token 数
 *   3. 未越线（<= 800K）→ 直接返回（带不带摘要看情况）
 *   4. 越线（> 800K）→ 把除最近 KEEP_RECENT_TURNS 之外的旧轮次压成新摘要，再合并到旧摘要里
 *
 * @param sessionId - 会话唯一标识（用于在 _cache 中定位状态）
 * @param history - 完整的历史对话（升序），每次都传全量，不传增量
 * @param fileContext - 用户上传的文件内容（拼到 user message），纳入 token 预算
 * @returns 管理后的上下文
 */
export async function manageContext(
  sessionId: string,
  history: ChatHistory[],
  fileContext: string = "",
): Promise<ManagedContext> {
  if (history.length === 0) {
    return { summaryBlock: "", recentHistory: [] };
  }

  const state = _cache.get(sessionId) ?? { summary: "", summarizedUpTo: 0 };
  const rawTurns = history.slice(state.summarizedUpTo);
  const totalRaw = rawTurns.map((h) => h.question + h.answer).join("");
  const llm = model();
  const [summaryTokens, rawTokens, fileTokens] = await Promise.all([
    state.summary ? llm.getNumTokens(state.summary) : Promise.resolve(0),
    totalRaw ? llm.getNumTokens(totalRaw) : Promise.resolve(0),
    fileContext ? llm.getNumTokens(fileContext) : Promise.resolve(0),
  ]);
  const totalTokens = summaryTokens + rawTokens + fileTokens;

  // 1. 未越线：直接返回，summaryBlock 与 recentTurns 不重叠
  if (totalTokens <= THRESHOLD_TOKENS) {
    return {
      summaryBlock: state.summary,
      recentHistory: history.slice(state.summarizedUpTo),
    };
  }

  // 2. 越线：把 raw 溢出部分压成新 chunk，再合并
  const overflowEnd = Math.max(
    state.summarizedUpTo,
    history.length - KEEP_RECENT_TURNS,
  );
  const overflowTurns = history.slice(state.summarizedUpTo, overflowEnd);
  if (overflowTurns.length === 0) {
    // 边界：连 KEEP_RECENT 都不够放，不压缩
    return {
      summaryBlock: state.summary,
      recentHistory: history.slice(-KEEP_RECENT_TURNS),
    };
  }

  const newChunk = await summarizeTurns(overflowTurns);
  state.summary = state.summary
    ? await mergeSummaries(state.summary, newChunk)
    : newChunk;
  state.summarizedUpTo = overflowEnd;
  _cache.set(sessionId, state);
  cleanupCache();

  return {
    summaryBlock: state.summary,
    recentHistory: history.slice(state.summarizedUpTo),
  };
}

/**
 * 调用 LLM 把一段对话压缩成简洁的中文摘要。
 *
 * 提示词要求保留四类信息（用于后续 LLM 推理时能"记得"）：
 *   - 主题        —— 用户在讨论什么
 *   - 关键需求    —— 用户的核心诉求
 *   - 已做决定    —— 双方达成共识的内容
 *   - 未解决分歧  —— 仍在争论的点
 *
 * 为什么是中文：项目是中文 RAG 系统，下游 prompt 也都是中文，
 * 摘要和正文语言保持一致可以减少下游理解成本。
 *
 * 注意：摘要质量直接影响后续对话的"长期记忆"效果，
 * 迭代这条 prompt 是优化这个文件 ROI 最高的地方。
 *
 * @param turns - 待压缩的对话轮次（多轮）
 * @returns 简洁的中文摘要文本
 */
async function summarizeTurns(turns: ChatHistory[]): Promise<string> {
  const res = await model().invoke([
    new HumanMessage(
      `将以下对话压缩成简洁中文摘要，保留：主题、关键需求、已做决定、未解决分歧。\n\n` +
        turns.map((h) => `用户: ${h.question}\nAI: ${h.answer}`).join("\n\n"),
    ),
  ]);
  const content = stripThinking(`${res.content}`);
  return content;
}

/**
 * 调用 LLM 合并两份历史摘要。
 *
 * 场景：每次触发压缩时都会生成新摘要块（newChunk），
 * 为了不丢信息，把"之前的累积摘要"和"新块"再合并一次。
 *
 * @param a - 更早的累积摘要
 * @param b - 刚生成的新摘要块
 * @returns 合并后的单份摘要
 */
async function mergeSummaries(a: string, b: string): Promise<string> {
  const res = await model().invoke([
    new HumanMessage(
      `合并以下两份对话摘要，去除重复内容，保留所有关键信息（主题、决定、分歧）。` +
        `按时间顺序组织，输出单份简洁摘要。\n\n` +
        `## 摘要 A（更早）\n${a}\n\n## 摘要 B（更近）\n${b}`,
    ),
  ]);
  const content = stripThinking(`${res.content}`);
  return content;
}

/**
 * 去除 LLM 输出中的 <think>...</think> 思考块。
 *
 * 原因：部分模型（Ollama qwen/deepseek-r1 等）会在 content 里夹杂思考过程，
 * 这部分对"长期记忆摘要"无价值，反而会增加后续 prompt 长度、引入噪声。
 *
 * @param text - 原始 LLM 输出文本
 * @returns 去除思考块后的纯文本
 */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

