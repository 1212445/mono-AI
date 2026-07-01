import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRunCodeOpts } from "./agent.tool.js";

type Lang = Parameters<typeof buildRunCodeOpts>[0];

/**
 * 一次性止血：列出并 kill 掉所有泄漏的 E2B 沙盒，腾出并发额度。
 * 仅在 `npx tsx src/test.ts cleanup` 时触发，普通 `pnpm test` 不受影响。
 * 跑完即可，不会动正常契约检查。
 */
async function cleanupLeakedSandboxes() {
  const { Sandbox } = await import("@e2b/code-interpreter");

  // 从 apps/server/.env 读 E2B_API_KEY，回写 process.env（SDK 自动读取）
  try {
    const envUrl = new URL("../../../apps/server/.env", import.meta.url);
    const raw = readFileSync(envUrl, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2]!.trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    console.warn("读不到 apps/server/.env，依赖已有的 E2B_API_KEY 环境变量");
  }

  if (!process.env.E2B_API_KEY) {
    console.error("E2B_API_KEY 未设置，退出");
    process.exit(1);
  }

  const all: Array<{ sandboxId: string; state?: string; startedAt?: unknown }> =
    [];
  const paginator = Sandbox.list();
  while (paginator.hasNext) {
    const page = await paginator.nextItems();
    all.push(...(page as typeof all));
  }

  console.log(`发现 ${all.length} 个沙盒：`);
  for (const info of all) {
    console.log(`  - ${info.sandboxId}  state=${info.state ?? "?"}`);
  }
  if (all.length === 0) {
    console.log("没有需要清理的沙盒。");
    return;
  }

  let killed = 0;
  let failed = 0;
  for (const info of all) {
    try {
      const ok = await Sandbox.kill(info.sandboxId);
      if (ok) {
        killed++;
        console.log(`  ✓ killed ${info.sandboxId}`);
      } else {
        failed++;
        console.log(`  ? not found ${info.sandboxId}`);
      }
    } catch (err) {
      failed++;
      console.log(
        `  ✗ kill 失败 ${info.sandboxId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(`\n完成：killed=${killed}，failed/not-found=${failed}`);
}

if (process.argv.includes("cleanup")) {
  await cleanupLeakedSandboxes();
  process.exit(0);
}

const fakeContext = {
  id: "fake-ctx",
  language: "python",
  cwd: "/home/user",
} as unknown as Parameters<typeof buildRunCodeOpts>[1];

function assertHasNoLanguage(
  opts: ReturnType<typeof buildRunCodeOpts>,
  where: string,
) {
  assert.ok(
    !("language" in opts),
    `${where}: opts 必须不含 language 字段，实际 = ${JSON.stringify(opts)}`,
  );
}

function assertHasNoContext(
  opts: ReturnType<typeof buildRunCodeOpts>,
  where: string,
) {
  assert.ok(
    !("context" in opts),
    `${where}: opts 必须不含 context 字段，实际 = ${JSON.stringify(opts)}`,
  );
}

// 复现 bug：context 存在时同时传 language，E2B 会拒绝
{
  const opts = buildRunCodeOpts("python", fakeContext, 5000);
  assertHasNoLanguage(opts, "python + context");
  assert.equal(opts.context, fakeContext);
  assert.equal(opts.timeoutMs, 5000);
  console.log("✓ python + context → 仅传 context");
}

// 所有 CONTEXT_SUPPORTED 语言都走 context-only 路径
for (const lang of ["python", "javascript", "r", "java"] as const satisfies readonly Lang[]) {
  const opts = buildRunCodeOpts(lang, fakeContext, 5000);
  assertHasNoLanguage(opts, `${lang} + context`);
  assert.equal(opts.context, fakeContext);
  console.log(`✓ ${lang} + context → 仅传 context`);
}

// typescript / bash 没有 context，只能走 language 路径
for (const lang of ["typescript", "bash"] as const satisfies readonly Lang[]) {
  const opts = buildRunCodeOpts(lang, undefined, 5000);
  assertHasNoContext(opts, `${lang} + undefined`);
  assert.equal(opts.language, lang);
  assert.equal(opts.timeoutMs, 5000);
  console.log(`✓ ${lang} + undefined → 仅传 language`);
}

// 边界：context 是 undefined 时不能漏出 context: undefined 字段
{
  const opts = buildRunCodeOpts("python", undefined, 5000);
  assertHasNoContext(opts, "python + undefined (createCodeContext 失败的回退路径)");
  assert.equal(opts.language, "python");
  console.log("✓ python + undefined → 仅传 language");
}

console.log("\n所有 buildRunCodeOpts 契约检查通过");

// ====================================================================
// Bug 复现：extractArtifacts 把 `formats` 当属性读，实际 SDK 里它是方法
//   源码：node_modules/@e2b/code-interpreter@2.6.0/dist/index.d.ts:246
//        formats(): string[]   ← 方法
//        而我们代码写的是 rAny.formats (属性)，for...of 一个函数 → 抛错
//   这个测试当前必失败（红），修复后必通过（绿）。
// ====================================================================
{
  const { extractArtifacts } = await import("./agent.tool.js");

  // 最小 Result 替身：照搬真实 SDK 形状——formats 是方法，不是有形数组
  const fakeResult = {
    formats() {
      return ["png"]; // SDK 内部实现：根据 png/svg/html 字段是否非空返回对应格式
    },
    png: "iVBORw0KGgoAA==", // 任意非空即可
    svg: undefined,
    html: undefined,
    json: undefined,
  };

  let thrown: unknown = null;
  let out: ReturnType<typeof extractArtifacts> = [];
  try {
    out = extractArtifacts([fakeResult as never]);
  } catch (err) {
    thrown = err;
  }

  assert.equal(thrown, null, `extractArtifacts 不应抛错，实际抛了：${thrown}`);
  assert.equal(
    out.length,
    1,
    `应产出 1 个 png artifact，实际 ${out.length} 个`,
  );
  assert.equal(out[0]?.type, "image/png");
  assert.equal(out[0]?.data, "iVBORw0KGgoAA==");
  assert.equal(out[0]?.truncated, false);
  console.log("✓ extractArtifacts 正确处理 formats() 方法签名（Bug#1 复现→修复）");
}