import { tool } from "langchain";
import * as z from "zod";
import {
  Sandbox,
  type Context,
  type Execution,
  type Result,
} from "@e2b/code-interpreter";

// 搜索工具
export const searchTool = tool(
  async ({ query }) => {
    if (!process.env.tavily_api) {
      throw new Error("tavily_api 环境变量未配置");
    }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.tavily_api}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: 5,
        include_raw_content: true,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Tavily API 失败: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as {
      results?: Array<{
        title: string;
        content: string;
        raw_content?: string | null;
        url: string;
      }>;
    };

    return (
      data.results
        ?.map((r, i) => {
          const detail = r.raw_content?.trim() || r.content;
          const truncated =
            detail.length > 8000
              ? detail.slice(0, 8000) + "\n[内容已截断]"
              : detail;
          return `[${i + 1}] ${r.title}\nURL: ${r.url}\n\n${truncated}`;
        })
        .join("\n\n---\n\n") || "未找到相关结果"
    );
  },
  {
    name: "web_search",
    description:
      "联网搜索最新信息或训练数据之外的内容。返回每个结果的标题、URL 和清洗后的正文（已自动抓取页面，无需再调其他工具）。输入应为简洁明确的搜索关键词。",
    schema: z.object({
      query: z.string().describe("搜索关键词，尽量简洁明确"),
    }),
  },
);

// 代码沙盒工具
type Lang = "python" | "javascript" | "typescript" | "bash" | "r" | "java";

// e2b 的 createCodeContext 只对部分语言有意义，bash/typescript 走默认 context
const CONTEXT_SUPPORTED: ReadonlySet<Lang> = new Set([
  "python",
  "javascript",
  "r",
  "java",
]);

interface SandboxState {
  sb: Sandbox;
  // 每种语言一个独立 context：同语言跨调用保留变量，跨语言互不污染
  contexts: Partial<Record<Lang, Context>>;
  createdAt: number;
}

interface CodeArtifact {
  type: "image/png" | "image/svg+xml" | "text/html" | "application/json";
  index: number;
  data: string;
  truncated: boolean;
}

const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_CHARS = 20_000;
const MAX_ARTIFACT_CHARS = 200_000;
const MAX_PNG_CHARS = 1_500_000;
const SANDBOX_REFRESH_MS = 30 * 60 * 1000;

let _state: SandboxState | null = null;
let _creating: Promise<SandboxState> | null = null;

async function getState(): Promise<SandboxState> {
  if (_state) {
    const stale = Date.now() - _state.createdAt > SANDBOX_REFRESH_MS;
    if (stale || !(await isAlive(_state.sb))) {
      await safeKill(_state);
      _state = null;
    }
  }
  if (_state) return _state;
  if (_creating) return _creating;
  // 成功/失败都清掉 _creating，避免 rejected promise 永久缓存
  _creating = createState().finally(() => {
    _creating = null;
  });
  return _creating;
}

async function createState(): Promise<SandboxState> {
  const sb = await Sandbox.create();
  return { sb, contexts: {}, createdAt: Date.now() };
}

async function isAlive(sb: Sandbox): Promise<boolean> {
  try {
    return await sb.isRunning();
  } catch {
    return false;
  }
}

async function safeKill(state: SandboxState): Promise<void> {
  try {
    await state.sb.kill();
  } catch {
    // 忽略：sandbox 已死
  }
}

async function getOrCreateContext(
  state: SandboxState,
  language: Lang,
): Promise<Context | undefined> {
  if (!CONTEXT_SUPPORTED.has(language)) return undefined;
  const cached = state.contexts[language];
  if (cached) return cached;
  try {
    const ctx = await state.sb.createCodeContext({ language });
    state.contexts[language] = ctx;
    return ctx;
  } catch {
    return undefined;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n[输出已截断，共 ${s.length} 字符]`;
}

function formatError(err: Execution["error"]): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const e = err as { name?: string; value?: string; traceback?: string };
  const head = [e.name, e.value].filter(Boolean).join(": ");
  return e.traceback ? `${head}\n${e.traceback}` : head;
}

function extractArtifacts(results: Result[] | undefined): CodeArtifact[] {
  if (!results || results.length === 0) return [];
  const out: CodeArtifact[] = [];
  results.forEach((r, i) => {
    const rAny = r as unknown as { formats?: string[] };
    const formats = rAny.formats ?? [];
    for (const fmt of formats) {
      if (fmt === "png" && r.png) {
        const truncated = r.png.length > MAX_PNG_CHARS;
        out.push({
          type: "image/png",
          index: i,
          data: truncated ? r.png.slice(0, MAX_PNG_CHARS) : r.png,
          truncated,
        });
      } else if (fmt === "svg" && r.svg) {
        const truncated = r.svg.length > MAX_ARTIFACT_CHARS;
        out.push({
          type: "image/svg+xml",
          index: i,
          data: truncated
            ? r.svg.slice(0, MAX_ARTIFACT_CHARS) + "..."
            : r.svg,
          truncated,
        });
      } else if (fmt === "html" && r.html) {
        const truncated = r.html.length > MAX_ARTIFACT_CHARS;
        out.push({
          type: "text/html",
          index: i,
          data: truncated
            ? r.html.slice(0, MAX_ARTIFACT_CHARS) + "..."
            : r.html,
          truncated,
        });
      } else if (fmt === "json" && r.json !== undefined) {
        const s = JSON.stringify(r.json);
        const truncated = s.length > MAX_OUTPUT_CHARS;
        out.push({
          type: "application/json",
          index: i,
          data: truncated ? truncate(s, MAX_OUTPUT_CHARS) : s,
          truncated,
        });
      }
    }
  });
  return out;
}

function summarizeArtifacts(artifacts: CodeArtifact[]): string {
  if (artifacts.length === 0) return "";
  const counts = new Map<CodeArtifact["type"], number>();
  for (const a of artifacts) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([t, n]) => `${n} 个 ${t}`)
    .join("、");
  return `（已生成 ${artifacts.length} 个产出物：${summary}，已附在 artifact 字段，前端可直接渲染）`;
}

export const codeTool = tool(
  async ({ language, code }) => {
    let state = await getState();
    try {
      const context = await getOrCreateContext(state, language);
      const execution = await state.sb.runCode(code, {
        language,
        ...(context ? { context } : {}),
        timeoutMs: TIMEOUT_MS,
      });

      const stdout = truncate(
        (execution.logs?.stdout ?? []).join(""),
        MAX_OUTPUT_CHARS,
      );
      const stderr = truncate(
        (execution.logs?.stderr ?? []).join(""),
        MAX_OUTPUT_CHARS,
      );
      const text = execution.text ?? "";
      const error = formatError(execution.error);
      const artifacts = extractArtifacts(execution.results);

      const parts: string[] = [];
      if (stdout) parts.push(stdout);
      if (text) parts.push(`[返回值] ${text}`);
      if (artifacts.length > 0) parts.push(summarizeArtifacts(artifacts));
      if (stderr) parts.push(`[stderr]\n${stderr}`);
      if (error) parts.push(`[错误] ${error}`);
      const content = parts.length > 0 ? parts.join("\n") : "(无输出)";

      // content_and_artifact：content 进 LLM，artifact 进前端
      return { content, artifact: artifacts };
    } catch (err) {
      // 沙盒级故障：API key 错 / 网络断 / sandbox 死掉，标记下次重建
      _state = null;
      const message = err instanceof Error ? err.message : String(err);
      return `[沙盒执行失败] ${message}`;
    }
  },
  {
    name: "code_sandbox",
    description:
      "在隔离的 E2B 沙盒中执行代码并返回输出。支持 python / javascript / typescript / bash / r / java。" +
      "适用场景：算法题求解、数学计算、数据分析、运行代码验证想法、" +
      "以及任何需要真实执行而非推理的编程问题。" +
      "代码片段必须自包含、可独立运行（同一语言跨调用会保留变量，跨语言互不污染）。" +
      "图表/HTML/JSON 等产出物通过 artifact 字段返回给前端渲染。",
    schema: z.object({
      language: z
        .enum(["python", "javascript", "typescript", "bash", "r", "java"])
        .describe("代码语言"),
      code: z.string().describe("要执行的完整、可独立运行的代码"),
    }),
    responseFormat: "content_and_artifact",
  },
);

/**
 * 应用关闭时调用，释放 sandbox 资源。
 * 不注册 SIGINT/SIGTERM handler，交给上层（NestJS）调用。
 */
export async function disposeCodeTool(): Promise<void> {
  if (_creating) {
    try {
      await _creating;
    } catch {
      // create 失败无需处理
    }
  }
  if (_state) {
    await safeKill(_state);
    _state = null;
  }
}
