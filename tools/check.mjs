// 天秤の書（PWA版）の最低限の検査。Claude を使わず CI（.github/workflows/check.yml）で回す。
// 1. index.html の中の <script> と sw.js の文法  2. manifest.webmanifest が JSON として読めるか
// 3. ブラウザで開いて、JS のエラーが出ないか・画面に何か描かれるか（--browser のときだけ）
// 使い方: node tools/check.mjs [--browser]
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";

let bad = 0;
const ng = (m) => { bad++; console.log("NG " + m); console.log("::error::" + m); };
const ok = (m) => console.log("OK " + m);

// 1. 文法
const html = readFileSync("index.html", "utf8");
const dir = mkdtempSync(join(tmpdir(), "tenbin-"));
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
scripts.forEach((m, i) => {
  const isModule = /type=["']module["']/.test(m[1]);
  if (/type=["'](?!module|text\/javascript)/.test(m[1])) return; // JSON などは対象外
  const f = join(dir, `script${i}.${isModule ? "mjs" : "js"}`);
  writeFileSync(f, m[2]);
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); ok(`index.html の <script> ${i + 1} 番目の文法`); }
  catch (e) { ng(`index.html の <script> ${i + 1} 番目に文法の誤り: ${String(e.stderr).split("\n").slice(0, 5).join(" ")}`); }
});
try { execFileSync(process.execPath, ["--check", "sw.js"], { stdio: "pipe" }); ok("sw.js の文法"); }
catch (e) { ng("sw.js に文法の誤り: " + String(e.stderr).split("\n")[0]); }

// 2. manifest
try {
  const mf = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
  for (const ic of mf.icons || []) readFileSync(ic.src.replace(/^\.?\//, ""));
  ok("manifest.webmanifest とアイコン");
} catch (e) { ng("manifest.webmanifest かアイコンが読めない: " + e.message); }

// 3. ブラウザで開く
if (process.argv.includes("--browser")) {
  const { chromium } = await import("playwright");
  const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  const server = createServer((req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[/\\]+/, "") || "index.html";
    if (p.includes("..")) { res.writeHead(403).end(); return; }
    try { const b = readFileSync(p); res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }).end(b); }
    catch { res.writeHead(404).end(); }
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errors = [];
  for (const vp of [{ name: "スマホ", width: 390, height: 844 }, { name: "PC", width: 1280, height: 800 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
    // 外のフォントは CI の揺れの元なので読まない（無くても表示はできる）
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const text = (await page.evaluate(() => document.body.innerText || "")).trim();
    if (text.length < 20) ng(`${vp.name}の画面がほとんど空（${text.length}文字）`);
    else ok(`${vp.name}の画面で開けた（${text.length}文字）`);
    await page.close();
  }
  await browser.close(); server.close();
  if (errors.length) errors.forEach((e) => ng("JS のエラー: " + e)); else ok("JS のエラーなし");
}
process.exit(bad ? 1 : 0);
