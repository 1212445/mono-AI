import assert from "node:assert/strict";
import { buildRunCodeOpts } from "./agent.tool.js";

type Lang = Parameters<typeof buildRunCodeOpts>[0];

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