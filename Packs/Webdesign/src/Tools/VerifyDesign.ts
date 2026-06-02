#!/usr/bin/env bun
/*
Usage:
  VerifyDesign.ts <url-or-path> <out-dir> [--viewport WIDTHxHEIGHT] [--a11y|--no-a11y]
  VerifyDesign.ts --compare <before.png> <after.png> <out-dir>

Runs a thin Interceptor-driven smoke check for a rendered design. The viewport is
validated and reported, but not applied because Interceptor exposes no viewport
verb. Accessibility checks are viewport-independent tree heuristics, not axe-core.
Use --lighthouse to run the Lighthouse CLI when it is installed on PATH.
*/
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type TreeNode = {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  alt?: string;
  href?: string;
  level?: number;
  children?: TreeNode[];
};
type Violation = { type: string; count: number; examples: { ref?: string; text?: string }[] };
type A11yResult = {
  engine: "interceptor-tree-heuristic";
  limitations: string[];
  violations: Violation[];
  pass: boolean;
};
type LighthouseResult = {
  engine: "lighthouse-cli";
  skipped?: true;
  reason?: string;
  report?: string;
  scores?: Record<string, number>;
  pass: boolean;
};
type NormalOptions = {
  mode: "normal";
  input: string;
  outDir: string;
  w: number;
  h: number;
  a11y: boolean;
  lighthouse: boolean;
};
type CompareOptions = {
  mode: "compare";
  before: string;
  after: string;
  outDir: string;
};
type Options = NormalOptions | CompareOptions;

function resolveInterceptorBin(): string {
  const found = Bun.spawnSync(["which", "interceptor"]);
  const bin = found.stdout.toString().trim();
  if (found.exitCode !== 0 || bin.length === 0) {
    console.error("interceptor CLI not found on PATH — install the Interceptor skill (see ~/.claude/skills/Interceptor/SKILL.md)");
    process.exit(127);
  }
  return bin;
}

async function run(argv: string[], timeout: number): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", signal: AbortSignal.timeout(timeout) });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, stdout, stderr };
}

function walkTree(node: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(node);
  for (const child of node.children ?? []) walkTree(child, out);
  return out;
}

function textOf(n: TreeNode): string {
  return `${n.name ?? ""} ${n.text ?? ""}`.trim();
}

function add(map: Map<string, Violation>, type: string, node: TreeNode): void {
  const v = map.get(type) ?? { type, count: 0, examples: [] };
  v.count += 1;
  if (v.examples.length < 5) v.examples.push({ ref: node.ref, text: textOf(node) });
  map.set(type, v);
}

function a11yFromTree(root: TreeNode): A11yResult {
  const nodes = walkTree(root);
  const violations = new Map<string, Violation>();
  let previousHeading = 0;
  let sawHeading = false;
  for (const n of nodes) {
    const role = (n.role ?? "").toLowerCase();
    const label = textOf(n);
    if (role === "img" && !label && !n.alt) add(violations, "img-alt", n);
    if (role === "button" && !label) add(violations, "button-name", n);
    if (role === "a" && (!label || !n.href)) add(violations, "link-name", n);
    if (["textbox", "combobox", "spinbutton"].includes(role) && !label) add(violations, "form-label", n);
    if (role === "heading" && typeof n.level === "number") {
      if (!sawHeading && n.level > 1) add(violations, "heading-order", n);
      if (sawHeading && n.level > previousHeading + 1) add(violations, "heading-order", n);
      sawHeading = true;
      previousHeading = n.level;
    }
  }
  const list = [...violations.values()];
  return {
    engine: "interceptor-tree-heuristic",
    limitations: ["no-contrast-check", "no-dynamic-aria-live-check", "no-css-parsed-check"],
    violations: list,
    pass: list.length === 0,
  };
}

function usage(): string {
  return "usage: VerifyDesign.ts <url-or-path> <out-dir> [--viewport WIDTHxHEIGHT] [--a11y|--no-a11y] [--lighthouse]\n       VerifyDesign.ts --compare <before.png> <after.png> <out-dir>";
}

function parseArgs(): Options {
  const args = Bun.argv.slice(2);
  let viewport = "1440x900";
  let a11y = true;
  let compare = false;
  let lighthouse = false;
  const positional: string[] = [];
  while (args.length) {
    const flag = args.shift() ?? "";
    if (flag === "--compare") compare = true;
    else if (flag === "--viewport") viewport = args.shift() ?? "";
    else if (flag === "--a11y") a11y = true;
    else if (flag === "--no-a11y") a11y = false;
    else if (flag === "--lighthouse") lighthouse = true;
    else if (flag.startsWith("--")) {
      console.error(`unknown flag: ${flag}`);
      process.exit(2);
    } else positional.push(flag);
  }
  if (compare) {
    const [before, after, outDir] = positional;
    if (!before || !after || !outDir) {
      console.error(usage());
      process.exit(2);
    }
    return { mode: "compare", before, after, outDir };
  }
  const [input, outDir] = positional;
  if (!input || !outDir) {
    console.error(usage());
    process.exit(2);
  }
  const m = /^(\d+)x(\d+)$/.exec(viewport);
  const w = m ? Number(m[1]) : 0;
  const h = m ? Number(m[2]) : 0;
  if (!m || w < 320 || h < 320 || w > 7680 || h > 7680) {
    console.error("invalid viewport; expected WIDTHxHEIGHT with each value in [320, 7680]");
    process.exit(2);
  }
  return { mode: "normal", input, outDir, w, h, a11y, lighthouse };
}

function asImageSrc(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : pathToFileURL(resolve(pathOrUrl)).href;
}

async function commandCompare(before: string, after: string, outDir: string): Promise<number> {
  const beforePath = resolve(before);
  const afterPath = resolve(after);
  const [beforeStat, afterStat] = await Promise.all([stat(beforePath).catch(() => null), stat(afterPath).catch(() => null)]);
  if (!beforeStat || !afterStat) {
    console.error(`compare inputs must exist: ${beforePath}, ${afterPath}`);
    return 2;
  }
  const dir = resolve(outDir);
  await mkdir(dir, { recursive: true });
  const html = join(dir, "compare.html");
  const result = {
    before: beforePath,
    after: afterPath,
    sideBySide: html,
    generatedAt: new Date().toISOString(),
    pass: true,
  };
  await writeFile(
    html,
    `<!doctype html><meta charset="utf-8"><title>Design Compare</title><style>body{font:14px system-ui;margin:0}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}img{max-width:100%;border:1px solid #ddd}h2{font-size:14px}</style><main><section><h2>Before</h2><img src="${asImageSrc(beforePath)}"></section><section><h2>After</h2><img src="${asImageSrc(afterPath)}"></section></main>\n`,
  );
  await writeFile(join(dir, "compare.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function lighthouseCheck(url: string, outDir: string): Promise<LighthouseResult> {
  const found = Bun.spawnSync(["which", "lighthouse"]);
  const bin = found.stdout.toString().trim();
  if (found.exitCode !== 0 || bin.length === 0) {
    return { engine: "lighthouse-cli", skipped: true, reason: "lighthouse CLI not found on PATH", pass: false };
  }
  const report = join(outDir, "lighthouse.json");
  const result = await run(
    [bin, url, "--output=json", `--output-path=${report}`, "--quiet", "--chrome-flags=--headless=new --no-sandbox"],
    180_000,
  );
  if (result.code !== 0) {
    return { engine: "lighthouse-cli", reason: result.stderr || "lighthouse failed", report, pass: false };
  }
  const raw = await readFile(report, "utf8").catch(() => "");
  const parsed = raw ? JSON.parse(raw) : {};
  const categories = parsed.categories ?? {};
  const scores: Record<string, number> = {};
  for (const [key, value] of Object.entries(categories)) {
    const score = (value as { score?: number }).score;
    if (typeof score === "number") scores[key] = score;
  }
  const pass = Object.values(scores).length > 0 && Object.values(scores).every((score) => score >= 0.9);
  return { engine: "lighthouse-cli", report, scores, pass };
}

async function resolveUrl(input: string): Promise<{ url: string; resolvedUrl: string }> {
  if (/^https?:\/\//.test(input)) return { url: input, resolvedUrl: input };
  const abs = resolve(input);
  const s = await stat(abs).catch(() => null);
  if (!s) {
    console.error(`path does not exist: ${abs}`);
    process.exit(2);
  }
  return { url: input, resolvedUrl: pathToFileURL(abs).href };
}

async function main(): Promise<void> {
  if (Bun.argv.slice(2).length === 0) {
    console.error(usage());
    return;
  }
  const opts = parseArgs();
  if (opts.mode === "compare") {
    process.exit(await commandCompare(opts.before, opts.after, opts.outDir));
  }
  const { url, resolvedUrl } = await resolveUrl(opts.input);
  const outDir = resolve(opts.outDir);
  const made = await run(["mkdir", "-p", outDir], 5_000);
  if (made.code !== 0) {
    console.error(made.stderr || "failed to create output directory");
    process.exit(2);
  }
  const bin = resolveInterceptorBin();
  const timestamp = new Date().toISOString();
  await run([bin, "open", resolvedUrl], 60_000);
  await run([bin, "wait-stable"], 30_000);
  const shot = join(outDir, `${timestamp.replace(/[:.]/g, "-")}.png`);
  let screenshot: string | null = shot;
  let screenshotError: string | undefined;
  const s = await run([bin, "screenshot", shot], 30_000);
  if (s.code !== 0) {
    screenshot = null;
    screenshotError = s.stderr || "screenshot failed";
  }
  let a11y: A11yResult | { skipped: true };
  if (opts.a11y) {
    const tree = await run([bin, "tree", "--json"], 30_000);
    if (tree.code === 0) {
      a11y = a11yFromTree(JSON.parse(tree.stdout) as TreeNode);
    } else {
      a11y = {
        engine: "interceptor-tree-heuristic",
        limitations: ["no-contrast-check", "no-dynamic-aria-live-check", "no-css-parsed-check"],
        violations: [{ type: "tree-unavailable", count: 1, examples: [{ text: tree.stderr || "tree failed" }] }],
        pass: false,
      };
    }
  } else {
    a11y = { skipped: true };
  }
  const lighthouse = opts.lighthouse ? await lighthouseCheck(resolvedUrl, outDir) : { skipped: true };
  const a11yPass = "skipped" in a11y ? true : a11y.pass;
  const lighthousePass = opts.lighthouse ? (lighthouse as LighthouseResult).pass : true;
  const pass = screenshot !== null && a11yPass && lighthousePass;
  const result = {
    url,
    resolvedUrl,
    viewport: { w: opts.w, h: opts.h },
    screenshot,
    ...(screenshotError ? { screenshotError } : {}),
    a11y,
    lighthouse,
    pass,
    timestamp,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 1);
}

await main();
