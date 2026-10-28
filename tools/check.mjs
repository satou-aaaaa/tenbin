// 天秤の書（PWA版）の最低限の検査。Claude を使わず CI（.github/workflows/check.yml）で回す。
// 1. index.html の中の <script> と sw.js の文法  2. manifest.webmanifest が JSON として読めるか
// 3. sw.js の SHELL（オフライン用に先に取るファイル）が全部あるか・版が index.html と sw.js でそろっているか
// 4. アイコンの PNG の大きさが manifest の sizes どおりか
// 5. ブラウザで開いて、JS のエラーが出ないか・画面に何か描かれるか（--browser のときだけ）
// 6. index.html から作り直して、index.html・sw.js・manifest が今のものと同じか（--rebuild のときだけ）。
//    違えば、生成物を手で直したか、tools/build_pwa.mjs を直したのに作り直していない。
// 使い方: node tools/check.mjs [--browser] [--rebuild]
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
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
let mf = null;
try {
  mf = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
  for (const ic of mf.icons || []) readFileSync(ic.src.replace(/^\.?\//, ""));
  if (!(mf.icons || []).length) throw new Error("icons が無い");
  ok("manifest.webmanifest とアイコン");
} catch (e) { ng("manifest.webmanifest かアイコンが読めない: " + e.message); }

// 3. SHELL と版
const sw = readFileSync("sw.js", "utf8");
const shell = sw.match(/const SHELL = (\[[^\]]*\]);/);
if (!shell) ng("sw.js に SHELL が見つからない");
else {
  const missing = JSON.parse(shell[1]).filter((u) => u !== "./" && !existsSync(u.replace(/^\.?\//, "")));
  if (missing.length) ng("sw.js の SHELL にあるのにファイルが無い: " + missing.join(", "));
  else ok("sw.js の SHELL のファイルが全部ある");
}
const swVer = (sw.match(/const VER = "(\d{12})";/) || [])[1];
const htmlVer = (html.match(/window\.TENBIN_VER = "(\d{12})"/) || [])[1];
if (!swVer || swVer !== htmlVer) ng(`版がそろっていない（index.html: ${htmlVer}・sw.js: ${swVer}）`);
else ok("版が index.html と sw.js でそろっている（" + swVer + "）");

// 4. アイコンの大きさ（PNG の先頭 IHDR から幅と高さを読む）
const pngSize = (f) => {
  const b = readFileSync(f);
  if (b.readUInt32BE(0) !== 0x89504e47 || b.toString("ascii", 12, 16) !== "IHDR") throw new Error(f + " が PNG でない");
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};
const wantSizes = [...(mf?.icons || []).map((ic) => [ic.src.replace(/^\.?\//, ""), ic.sizes]), ["apple-touch-icon.png", "180x180"]];
for (const [f, want] of wantSizes) {
  try { const got = pngSize(f); if (got === want) ok(`${f} の大きさ ${got}`); else ng(`${f} の大きさが ${got}（${want} のはず）`); }
  catch (e) { ng(`${f} の大きさを読めない: ${e.message}`); }
}

// 5. ブラウザで開く
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
// 6. 作り直して比べる（版は今の index.html と同じにする。アイコンは Chromium の版で画素が揺れるので比べない）
if (process.argv.includes("--rebuild") && swVer) {
  const v = swVer, epoch = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(8, 10), +v.slice(10, 12)) / 1000;
  const out = mkdtempSync(join(tmpdir(), "tenbin-build-"));
  try {
    execFileSync(process.execPath, ["tools/build_pwa.mjs", "index.html", out], { stdio: "pipe", env: { ...process.env, SOURCE_DATE_EPOCH: String(epoch) } });
    for (const f of ["index.html", "sw.js", "manifest.webmanifest"]) {
      if (readFileSync(join(out, f), "utf8") === readFileSync(f, "utf8")) ok(`作り直した ${f} が今のものと同じ`);
      else ng(`作り直した ${f} が今のものと違う。生成物を手で直さず、node tools/build_pwa.mjs <元のHTML> . で作り直す`);
    }
    // 本体（claude.ai 版の単体HTML）からも作れるか。本体だけを取り出したファイルから作り直し、同じ index.html になるか確かめる
    const html = readFileSync("index.html", "utf8"), a = html.indexOf("</head><body>\n"), z = html.lastIndexOf('\n<p style="text-align:center;margin:16px 0 24px;font:13px system-ui,sans-serif"><a href="changes.html"');
    if (a < 0 || z < a) ng("index.html から本体を取り出せない（check.mjs の境目を build_pwa.mjs に合わせる）");
    else {
      const src = join(out, "app.html"), out2 = join(out, "from-app");
      writeFileSync(src, html.slice(a + "</head><body>\n".length, z));
      execFileSync(process.execPath, ["tools/build_pwa.mjs", src, out2], { stdio: "pipe", env: { ...process.env, SOURCE_DATE_EPOCH: String(epoch) } });
      if (readFileSync(join(out2, "index.html"), "utf8") === html) ok("本体のHTMLから作り直しても同じ index.html になる");
      else ng("本体のHTMLから作り直すと index.html が変わる（build_pwa.mjs が本体を index.html と取り違えていないか）");
    }
  } catch (e) { ng("作り直しに失敗: " + String(e.stderr || e.message).split("\n").slice(0, 5).join(" ")); }
}

process.exit(bad ? 1 : 0);
