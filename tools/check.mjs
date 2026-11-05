// 天秤の書（PWA版）の最低限の検査。Claude を使わず CI（.github/workflows/check.yml）で回す。
// 1. index.html の中の <script> と sw.js の文法  2. manifest.webmanifest が JSON として読めるか
// 3. sw.js の SHELL（オフライン用に先に取るファイル）が全部あるか・版が index.html と sw.js でそろっているか
// 4. アイコンの PNG の大きさが manifest の sizes どおりか
// 5. ブラウザで開いて、JS のエラーが出ないか・画面に何か描かれるか・hidden の枠が隠れるか・残り時間の幅が動かないか（--browser のときだけ）
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
// 1b. main にある関数が消えていないか（2026-11-05：古い Artifact を土台に作り直して、PR #87 の agChat「ふだんのClaudeで添削」が消えかけた）
// 生成物は本体（Artifact）からまるごと作るので、土台が古いと main の機能が黙って消える。わざと消すときは tools/removed-ok.txt に名前を1行ずつ書く
{
  const names = (h) => new Set([...h.matchAll(/^(?:async\s+)?function\s+([\w$]+)\s*\(|^(?:const|let)\s+([\w$]+)\s*=/gm)].map((m) => m[1] || m[2]));
  let base = null;
  try {
    execFileSync("git", ["fetch", "-q", "--depth=1", "origin", "main"], { stdio: "pipe" });
    base = execFileSync("git", ["show", "FETCH_HEAD:index.html"], { stdio: "pipe", maxBuffer: 64 << 20 }).toString();
  } catch { base = null; }
  if (!base) ok("main の index.html が取れないので、消えた関数は確かめない");
  else {
    const allow = new Set(existsSync("tools/removed-ok.txt") ? readFileSync("tools/removed-ok.txt", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : []);
    const now = names(html), gone = [...names(base)].filter((n) => !now.has(n) && !allow.has(n));
    if (gone.length) ng(`main にある関数が index.html から消えている: ${gone.slice(0, 15).join(", ")}。最新の本体（Artifact・共有フォルダ）から作り直したか確かめる。わざと消したなら tools/removed-ok.txt に書く`);
    else ok("main にある関数は index.html に全部ある");
  }
}
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

// 3b. 応援（Ko-fi）は下のただのリンク（2026-10-31 satouさんが Ko-fi に決めた。外のスクリプトは読まない）
const kofi = (html.match(/<a id="kofi" href="https:\/\/ko-fi\.com\/satouaaaaa"[^>]*>/) || [""])[0];
if (!((kofi.match(/\brel="([^"]*)"/) || [])[1] || "").split(/\s+/).includes("noopener")) ng("下に Ko-fi の応援リンク（noopener つき）が無い");
else if (/<script\b[^>]*\bsrc\s*=/i.test(html) || /createElement\(\s*["'`]script/i.test(html) || /\bimport\(\s*["'`](https?:)?\/\//i.test(html)) ng("index.html が外のスクリプトを読んでいる（script src・createElement(\"script\")・外への import()）");
else ok("下に Ko-fi の応援リンクがある（ただのリンク）");
// 3c. 節目のお願い（#tenbin-kofi）も、ただのリンク（noopener つき）で、「もう出さない」があること
const kofiGo = (html.match(/<a id="tenbin-kofi-go" href="https:\/\/ko-fi\.com\/satouaaaaa"[^>]*>/) || [""])[0];
if (!/\brel="[^"]*\bnoopener\b/.test(kofiGo) || !html.includes('id="tenbin-kofi-never"')) ng("節目の応援のお願いに、noopener つきのリンクか「もう出さない」が無い");
else ok("節目の応援のお願いは、ただのリンクで「もう出さない」がある");
// 3d. 「このアプリについて」（免責・非公式・データの扱い）が外側にあること。宣伝・公開の前提なので、消えたら落とす
const about = (html.match(/<details id="tenbin-about"[\s\S]*?<\/details>/) || [""])[0];
const need = ["法律相談ではありません", "非公式", "正確さは保証できない", "過去問の文章は使っていません", "e-Gov 法令検索", "Google Fonts", "Anthropic"];
const miss = need.filter((w) => !about.includes(w));
if (miss.length) ng("「このアプリについて」が無いか、次の言葉が抜けている: " + miss.join("・"));
else ok("「このアプリについて」（免責・非公式・データの扱い）がある");
// 3e. 外枠は一つだけ。Artifact の写しの外枠ごと入れると、二つ目の <!doctype> や </body></html> が中に入る
const docs = (html.match(/<!doctype/gi) || []).length, ends = (html.match(/<\/body>/gi) || []).length;
if (docs !== 1 || ends > 1) ng(`index.html に <!doctype> が ${docs} 個、</body> が ${ends} 個ある（Artifact の写しの外枠が中に入っている）`);
else ok("index.html の外枠は一つだけ");

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
    // hidden を付けた枠は、クラスで display を決めていても隠れること（claude.ai 版の外側と同じ。外れると空の枠が出る）
    const shown = await page.evaluate(() => { const d = document.createElement("section"); d.className = "win msg"; d.hidden = true; d.textContent = "x";
      (document.getElementById("app") || document.body).appendChild(d); const v = d.getClientRects().length > 0; d.remove(); return v; });
    if (shown) ng(`${vp.name}: hidden を付けた枠が見えている（外側の [hidden]{display:none!important} が抜けている）`); else ok(`${vp.name}: hidden の枠は隠れる`);
    // 1秒ごとに変わる残り時間（role="timer"）は、数字が変わっても幅と周りの位置が動かないこと（明朝体の数字は字ごとに幅がちがい、スマホで上部がカクカクした。2026-10-31）
    const jit = await page.evaluate(() => {
      if (typeof gyExamOpen !== "function" || typeof gyExamTick !== "function") return null;
      const keep = S.gyExam; gyExamOpen(true); const x = S.gyExam, seen = new Set();
      for (const ms of [0, 1111000, 2222000, 3333000, 4444000, 5555000, 6666000, 7777000, 8888000, 9999000, 10799000, 10801000, 11999000]) {
        x.used = ms; x.t0 = Date.now(); gyExamTick();
        const t = document.querySelector('[role="timer"]').getBoundingClientRect(), q = document.querySelector(".gyq").getBoundingClientRect();
        seen.add([t.width, t.top, q.top].map((v) => Math.round(v * 10) / 10).join("/"));
      }
      gyExamPause(); S.gyExam = keep; showOffice(); return [...seen];
    });
    if (jit === null) ok(`${vp.name}: 模試の画面がないので残り時間の幅は確かめない`);
    else if (jit.length === 1) ok(`${vp.name}: 模試の残り時間の幅と位置が変わらない`);
    else ng(`${vp.name}: 模試の残り時間が変わるたびに幅か位置が動く（${jit.join(" , ")}）。.gytimer の幅を固定する`);
    // 横にはみ出さないこと（文字の大きさ「標準」「大」の両方で、目次・論文式・さがす・学習の記録・模試の画面）。
    // 「大」は .wrap を zoom で拡大するので、端まで貼りつける帯（margin-inline: -16px）が広がって 2px はみ出していた（2026-11-04）
    const wide = await page.evaluate(() => {
      const out = [], keepFs = document.documentElement.dataset.fs || "n";
      const screens = [["目次", () => showOffice()], ["論文式", () => typeof showRonbun === "function" && showRonbun()],
        ["さがす", () => typeof showSearch === "function" && showSearch()], ["学習の記録", () => typeof showRecord === "function" && showRecord()],
        ["行政書士の模試", () => { if (typeof gyExamOpen !== "function") return; const k = S.gyExam; gyExamOpen(true); gyExamPause(); S.gyExam = k; }],
        ...(typeof XM_LIST !== "undefined" ? XM_LIST.filter((c) => c.mocks && c.mocks.length).map((c) => [`${c.short}の模試`, () => { const st = xmSt(c.key), k = st.cur; xmOpen(c, c.mocks[0]); xmPause(); st.cur = k; }]) : [])];
      for (const fs of ["n", "l"]) {
        document.documentElement.dataset.fs = fs;
        for (const [name, go] of screens) { try { go(); } catch (e) { out.push(`${name}（${fs}）: ${e.message}`); continue; }
          const w = document.documentElement.scrollWidth - innerWidth; if (w > 0) out.push(`${name}（文字${fs === "l" ? "大" : "標準"}）で ${w}px`); }
      }
      document.documentElement.dataset.fs = keepFs; showOffice(); return out;
    });
    if (wide.length) ng(`${vp.name}: 横にはみ出す: ${wide.join(" / ")}`); else ok(`${vp.name}: 文字の大きさ標準・大で、目次・模試の画面が横にはみ出さない`);
    await page.close();
  }
  // 応援のお願い: 何も解いていないうちは出ない。10問を越えて目次を開くと1回だけ出る。「もう出さない」のあとは出ない
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`応援: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const vis = () => page.evaluate(() => { const b = document.getElementById("tenbin-kofi"); return !!b && b.style.display !== "none"; });
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const v0 = await vis();
    // 控えの案内は「あとで」にしておく（両方が同時に出ないことは別に確かめる）
    await page.evaluate(() => { const st = { cases: {}, essays: {}, stats: {} }; for (let i = 0; i < 12; i++) st.stats["q" + i] = [1, 1];
      localStorage.setItem("roppo-quest-v2", JSON.stringify(st)); localStorage.setItem("tenbin-lastexp", String(Date.now())); });
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
    const v1 = await vis();
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
    const v2 = await vis(); // 同じ節目では二度出ない
    await page.evaluate(() => { localStorage.removeItem("tenbin-kofi-step"); localStorage.removeItem("tenbin-kofi-last"); localStorage.setItem("tenbin-kofi-never", "1"); });
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
    const v3 = await vis();
    if (!v0 && v1 && !v2 && !v3) ok("応援のお願いは節目に1回だけ出て、「もう出さない」で止まる");
    else ng(`応援のお願いの出かたがおかしい（記録なし:${v0}・10問越え:${v1}・2回目:${v2}・もう出さない:${v3}）`);
    await page.close();
  }
  // 択一の答えと解説が食い違わないこと（2026-11-05）。毎日問題を足すので、手で見落としても CI で止める。
  // 1) 形：選択肢2つ以上・空や重複なし・正解の番号が範囲内・肢ごとの解説の数＝選択肢の数・id の重複なし
  // 2) 「正解です」で始まる解説は正解の肢だけ。「正しいものはどれか」で正解でない肢の解説が「正しい」で始まる（逆も）ものはだめ
  // 3) 組合せ（ア・ウ など）：答えの組と問いの向き（正しい／誤り）から決まる記述ごとの正誤と、解説・詳しい解説の「アは誤り」などが合うこと
  //    （画面の「肢ごとの正誤」は答えから○×を付け、理由は解説から取るので、食い違うと○なのに理由が「誤り」になる）
  // 4) 個数問題：正解の解説の「ア○ イ×…」の数と答え（一つ〜五つ）が合うこと
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`答えの点検: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const lists = [], seen = new Set(), names = new Set();
      for (const sc of document.scripts) for (const m of sc.textContent.matchAll(/(?:^|[;\n]\s*)(?:const|let|var)\s+([A-Z][A-Z0-9_]+)\s*=/g)) names.add(m[1]);
      const walk = (v, path, depth) => { if (!v || typeof v !== "object" || seen.has(v) || depth > 4) return; seen.add(v);
        if (Array.isArray(v)) { const qs = v.filter((x) => x && typeof x === "object" && Array.isArray(x.c) && "a" in x && !seen.has(x)); if (qs.length) { qs.forEach((x) => seen.add(x)); lists.push([path, qs]); }
          v.forEach((x, i) => { if (x && typeof x === "object" && !Array.isArray(x.c)) walk(x, `${path}[${i}]`, depth + 1); }); }
        else for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, depth + 1); };
      for (const n of names) { let v; try { v = (0, eval)(n); } catch { continue; } walk(v, n, 0); }
      const NEG = /誤っている|誤りである|妥当でない|正しくない|適切でない|不適当な|不適切な/;
      const LAB = /^[ア-オ](?:[ 　・と]?[ア-オ])+$/, NUM = { "一つ": 1, "二つ": 2, "三つ": 3, "四つ": 4, "五つ": 5 };
      const ASSERT = /([ア-オ](?:[・と][ア-オ])*)(?:は|が|も|とも)(?:、)?(?:ともに|いずれも|どちらも)?(妥当でない|正しくない|適切でない|誤り|誤って|誤った|妥当|正しい|適切)/g;
      const bad = [], ids = new Map(); let n = 0;
      for (const [src, qs] of lists) for (const q of qs) {
        n++; const id = q.id || src, P = (m) => bad.push(`${id}：${m}`), c = q.c, lead = String(q.q || "").split("\n")[0], neg = NEG.test(lead);
        if (q.id) { if (ids.has(q.id)) P(`id が ${ids.get(q.id)} と重複`); else ids.set(q.id, src); }
        if (c.length < 2) P("選択肢が2つ未満");
        if (c.some((x) => typeof x !== "string" || !x.trim())) P("空の選択肢がある");
        else if (new Set(c.map((x) => x.trim())).size !== c.length) P("同じ選択肢が2つある");
        if (!Number.isInteger(q.a) || q.a < 0 || q.a >= c.length) { P(`正解の番号が範囲外（a=${q.a}）`); continue; }
        const ex = Array.isArray(q.ex) ? q.ex.map(String) : null;
        if (ex) {
          if (ex.length !== c.length) P(`肢ごとの解説の数（${ex.length}）と選択肢の数（${c.length}）が違う`);
          ex.forEach((e, i) => { if (i !== q.a && /^正解/.test(e)) P(`正解でない肢${i + 1}の解説が「正解」で始まる`); });
          if (/どれか|選べ/.test(lead)) ex.forEach((e, i) => {
            const says = /^(正しい|妥当です|適切です)/.test(e) ? true : /^(誤り|誤っ|妥当でない|正しくない|適切でない|不適切)/.test(e) ? false : null;
            if (says !== null && says !== ((i === q.a) !== neg)) P(`肢${i + 1}の解説「${e.slice(0, 20)}…」が、答え（${q.a + 1}）と問いの向き（${neg ? "誤り" : "正しい"}を選ぶ）に合わない`); });
          if (c.every((x) => x in NUM) && /いくつ/.test(lead)) {
            const e = ex[q.a] || "", o = (e.match(/[ア-オ]○/g) || []).length, x = (e.match(/[ア-オ]×/g) || []).length;
            if (o + x >= 3 && (neg ? x : o) !== NUM[c[q.a]]) P(`個数問題：正解の解説は○${o}・×${x}なのに答えが「${c[q.a]}」`);
          }
        }
        if (c.every((t) => LAB.test(t.trim()))) {
          const set = c[q.a].match(/[ア-オ]/g), truth = (k) => set.includes(k) !== neg, off = new Set();
          for (const t of [...(ex || [String(q.ex || "")]), ...(q.d || []).map((r) => [].concat(r).join(" "))])
            for (const m of t.matchAll(ASSERT)) { const pos = /^(妥当|正しい|適切)$/.test(m[2]);
              for (const k of m[1].match(/[ア-オ]/g)) if (truth(k) !== pos) off.add(`答えからは${k}が${truth(k) ? "正しい" : "誤り"}なのに解説は「${m[0]}」`); }
          if (off.size) P(`組合せ（答え「${c[q.a]}」）：${[...off].join(" / ")}`);
        }
      }
      return { n, lists: lists.length, bad };
    });
    if (r.n < 100) ng(`択一の問題が見つからない（${r.n}問）。check.mjs の探し方を見直す`);
    else if (r.bad.length) ng(`択一の答えと解説が食い違う（${r.n}問中 ${r.bad.length}件）: ${r.bad.slice(0, 15).join(" / ")}`);
    else ok(`択一${r.n}問（${r.lists}か所）の答え・選択肢・解説が食い違っていない`);
    await page.close();
  }
  // 画面の色（深緑・紙）：どちらでも文字が背景に埋もれないこと（WCAG の 4.5:1、大きな字は 3:1）。2026-11-05「紙」を追加。
  // 色を変数（var(--chalk) など）でなく直に書くと、片方の色で読めなくなるので落とす。選んだ色は読み込み直しても残ること
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`画面の色: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const hasTheme = await page.evaluate(() => typeof setTheme === "function");
    if (!hasTheme) ok("画面の色の切り替えがない版なので確かめない");
    else for (const th of ["dark", "paper"]) {
      await page.evaluate((t) => localStorage.setItem("tenbin-theme", t), th);
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
      const r = await page.evaluate(async () => {
        const tick = () => new Promise((res) => setTimeout(res, 50));
        const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
        const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const blend = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
        const bgOf = (el) => { const L = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { L.push(c); if (c[3] >= 1) break; } }
          let b = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]; for (let i = L.length - 1; i >= 0; i--) b = blend(L[i], b); return b; };
        const screens = [["目次", () => { showOffice(); document.querySelectorAll("#app details").forEach((d) => d.open = true); }], ["論文式", () => showRonbun()],
          ["学習の記録", () => typeof showRecord === "function" && showRecord()],
          ["択一の解説", () => { const c = XM_LIST[0]; xmRun(c, { deck: [c.qs[0]], i: 0, right: 0, title: "検査" }); $app.querySelectorAll(".choices button")[1].click(); }],
          ["行政書士の模試", () => { if (typeof gyExamOpen !== "function") return; const k = S.gyExam; gyExamOpen(true); gyExamPause(); S.gyExam = k; }]];
        const out = [], theme = document.documentElement.dataset.theme || "dark";
        for (const [name, go] of screens) {
          try { go(); } catch (e) { out.push(`${name}: ${e.message}`); continue; } await tick();
          const w = document.createTreeWalker($app, NodeFilter.SHOW_TEXT), seen = new Set();
          while (w.nextNode()) { const el = w.currentNode.parentElement; if (!w.currentNode.textContent.trim() || !el.getClientRects().length || el.closest("button:disabled")) continue;
            const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity < 0.5) continue; const fg0 = parse(cs.color); if (!fg0) continue;
            const bg = bgOf(el), fg = blend(fg0, bg), a = lum(fg), b = lum(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const size = parseFloat(cs.fontSize), need = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66) ? 3 : 4.5;
            const key = `${el.tagName}.${el.className}`; if (cr < need && !seen.has(key)) { seen.add(key); out.push(`${name}の「${w.currentNode.textContent.trim().slice(0, 12)}」（${key}）が ${cr.toFixed(1)}:1`); } }
        }
        showOffice(); return { theme, out };
      });
      const want = th === "paper" ? "paper" : "dark";
      if (r.theme !== want) ng(`画面の色「${th}」を選んで読み込み直すと「${r.theme}」になる（選んだ色が残らない）`);
      else if (r.out.length) ng(`画面の色「${th === "paper" ? "紙" : "深緑"}」で読みにくい文字がある: ${r.out.slice(0, 10).join(" / ")}`);
      else ok(`画面の色「${th === "paper" ? "紙" : "深緑"}」で、目次・論文式・学習の記録・解説・模試の文字が読める濃さ`);
    }
    await page.close();
  }
  // 組合せ問題（ア〜オから2つ・ア〜ウの○×）は、ほかの択一と同じ見た目で出ること（2026-11-04 satou「2つ選択するタイプの問題の出題と解説が見づらい」）
  // 出題：「ア　…」の記述が1つずつ枠（.kmst li）に分かれる。解説：選択肢が組（ア・ウ など）なら、ほかの問題と同じ「肢ごとの正誤」（.kmw li）が記述の数だけ出て、全部に記述の文と ○× が付く（2026-11-04 satou「組合せ問題だけ解答に問題文が書かれていない」）。
  // 新しい試験や問題の形を足して、この表示から漏れたら落とす。スマホ幅で横にはみ出さないことも確かめる
  for (const vp of [{ name: "スマホ", width: 390, height: 844, all: true }, { name: "PC", width: 1280, height: 800, all: false }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on("pageerror", (e) => errors.push(`組合せ問題（${vp.name}）: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const r = await page.evaluate(async (all) => {
      if (typeof XM_LIST === "undefined" || typeof GY_ALL === "undefined") return null;
      const tick = () => new Promise((res) => setTimeout(res, 0));
      const nSt = (q) => { const L = (q.q || "").split("\n").map((s) => s.trim()).filter(Boolean); let n = 0; for (let i = L.length - 1; i >= 0 && /^[ア-オ][　 ]/.test(L[i]); i--) n++; return n >= 3 ? n : 0; };
      const isLab = (t) => /^[ア-オ](?:[ 　・と]?[ア-オ])+$|^(?:[ア-オ][○×][ 　・]*){2,}$/.test(t.trim());
      let jobs = [...XM_LIST.flatMap((c) => c.qs.filter(nSt).map((q) => [q, () => xmRun(c, { deck: [q], i: 0, right: 0, title: "検査" })])),
        ...GY_ALL.filter((q) => gyKind(q) === "go" && nSt(q)).map((q) => [q, () => gyRun({ deck: [q], i: 0, right: 0, title: "検査" })])];
      if (!all) jobs = jobs.filter((_, i) => i % 25 === 0);
      const bad = [];
      for (const [q, go] of jobs) {
        go(); await tick();
        const st = $app.querySelectorAll(".kmst li").length, lab = isLab(q.c[q.a] || "");
        $app.querySelector(".choices button").click(); await tick(); await tick();
        const w = [...$app.querySelectorAll(".kmw li")];
        if (st !== nSt(q)) bad.push(`${q.id}：記述が枠に分かれていない（${st}/${nSt(q)}）`);
        else if (lab && (w.length !== st || w.some((li) => !li.querySelector(".gytf") || !(li.querySelector(".gyct") || {}).textContent))) bad.push(`${q.id}：解説の肢ごとの正誤に、記述の文と○×が出ない（${w.length}/${st}）`);
        if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`${q.id}：横にはみ出す`);
        if (bad.length > 10) break;
      }
      showOffice(); return { n: jobs.length, bad };
    }, vp.all);
    if (r === null) ok(`${vp.name}: 組合せ問題がないので確かめない`);
    else if (r.bad.length) ng(`${vp.name}: 組合せ問題の表示がおかしい（${r.n}問中）: ${r.bad.join(" / ")}`);
    else ok(`${vp.name}: 組合せ問題${r.n}問の記述が枠に分かれ、解説の肢ごとの正誤に記述の文と○×が出る`);
    await page.close();
  }
  // 語群から選ぶ問題（行政書士の多肢選択式・社労士の選択式）で、語群の並びから答えが分からないこと（2026-11-05 satou「選択肢が順番に並んでいて答えを推測できてしまう」）。
  // 本試験の語群はばらばらの順（行政書士 令和7年度 問題41〜43）。データは正解をまとまりの先頭に書きがちなので、画面に出た順で確かめる。
  // 落とす並び：①データの順のまま ②正解の位置が等間隔（1・5・9・13 など） ③正解が続きの位置に固まる ④同じ試験の3問以上で正解の位置が同じ
  // ⑤練習と模試で語群の番号が違う ⑥開き直すと並びが変わる ⑦正解の語が語群にない・同じ語が二つある。新しい問題・試験を足して漏れたら落とす
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`語群の並び: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      const tick = () => new Promise((res) => setTimeout(res, 0)), sets = [];
      const shown = (sel) => [...$app.querySelectorAll(sel)].map((li) => li.textContent.replace(/^[①-⑳]/, "").trim());
      if (typeof GY_ALL !== "undefined") {
        const qs = GY_ALL.filter((q) => gyKind(q) === "tashi"), items = [], keep = S.gyExam;
        for (const q of qs) {
          gyRun({ deck: [q], i: 0, right: 0, title: "検査" }); await tick(); const a = shown(".gywords li");
          gyRun({ deck: [q], i: 0, right: 0, title: "検査" }); await tick(); const a2 = shown(".gywords li");
          S.gyExam = { ids: [q.id], cur: 0, ans: {}, perm: {}, flag: {}, t0: 0, used: 0, back: "" }; gyExamQ(); await tick(); const b = shown(".gywords li");
          items.push({ id: q.id, data: q.words, ans: q.ans.map((i) => q.words[i]), views: [["練習", a], ["練習（開き直し）", a2], ["模試", b]] });
        }
        S.gyExam = keep; if (typeof gyExamPause === "function") gyExamPause();
        sets.push(["行政書士 多肢選択式", items]);
      }
      if (typeof SR_SEN !== "undefined") {
        const items = [];
        for (const q of SR_SEN) { srPractice({ key: "sharoshi" }, [q], 0, "検査"); await tick(); const a = shown(".srwords li");
          srPractice({ key: "sharoshi" }, [q], 0, "検査"); await tick();
          items.push({ id: q.id, data: [...q.ans, ...q.w], ans: q.ans, views: [["練習", a], ["練習（開き直し）", shown(".srwords li")]] }); }
        if (typeof srPause === "function") srPause();
        sets.push(["社労士 選択式", items]);
      }
      showOffice(); return sets;
    });
    for (const [name, items] of r) {
      const bad = [], seen = {};
      for (const it of items) {
        const [[, v0]] = it.views, p = it.ans.map((w) => v0.indexOf(w)), k = p.length;
        if (new Set(it.data).size !== it.data.length) bad.push(`${it.id}：語群に同じ語が二つある`);
        if (p.includes(-1)) { bad.push(`${it.id}：正解の語が語群に出ていない`); continue; }
        const diff = it.views.find(([, v]) => v.join("|") !== v0.join("|"));
        if (diff) bad.push(`${it.id}：「${it.views[0][0]}」と「${diff[0]}」で語群の順が違う`);
        const raw = it.views.find(([, v]) => v.join("|") === it.data.join("|"));
        if (raw) bad.push(`${it.id}：「${raw[0]}」の語群がデータの順のまま`);
        const g = p.slice(1).map((x, i) => x - p[i]);
        if (k >= 3 && g.every((d) => d === g[0])) bad.push(`${it.id}：正解の位置が等間隔（${p.map((x) => x + 1).join("・")}）`);
        if (Math.max(...p) - Math.min(...p) <= k) bad.push(`${it.id}：正解が続きの位置に固まる（${p.map((x) => x + 1).join("・")}）`);
        const key = p.join(","); (seen[key] = seen[key] || []).push(it.id);
      }
      for (const [key, ids] of Object.entries(seen)) if (ids.length >= 3) bad.push(`${ids.length}問で正解の位置が同じ（${key.split(",").map((x) => +x + 1).join("・")}：${ids.slice(0, 5).join("・")}）`);
      if (!items.length) ok(`${name}: 問題がないので確かめない`);
      else if (bad.length) ng(`${name}の語群から答えが推測できる（${items.length}問中）: ${bad.slice(0, 12).join(" / ")}`);
      else ok(`${name}${items.length}問の語群は、正解の位置が規則的でなく、どの画面でも同じ番号`);
    }
    if (!r.length) ok("語群から選ぶ問題がないので確かめない");
    await page.close();
  }
  // 解説の「肢ごとの正誤」は、どの形式でも「肢の文＝太字・理由＝細字」でそろうこと（2026-11-05 satou「組み合わせ問題以外では、問題文を太字、解説を細字としています。これに合わせるように」）
  // 形式：ほかの試験の択一・組合せ、行政書士の5肢択一・組合せ（練習）、行政書士の模試の見直し。どれかで肢の文が出ない・太さがちがえば落とす
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`解説の文字の太さ: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      if (typeof XM_LIST === "undefined" || typeof GY_ALL === "undefined") return null;
      const tick = () => new Promise((res) => setTimeout(res, 0)), out = [];
      const look = async (name, go, answer = true) => {
        go(); await tick(); if (answer) { $app.querySelector(".choices button").click(); await tick(); }
        await tick();
        const li = [...$app.querySelectorAll(".gyex li")].find((l) => l.offsetParent);
        if (!li) { out.push([name, "肢ごとの正誤が出ない"]); return; }
        const t = li.querySelector(":scope > p.gyct"), x = li.querySelector(":scope > p.gycx");
        if (!t || !t.textContent.trim()) { out.push([name, "肢の文が出ない"]); return; }
        out.push([name, `${getComputedStyle(t).fontWeight}/${x ? getComputedStyle(x).fontWeight : "なし"}`]);
      };
      const isK = (q) => /\n[ア-オ][　 ]/.test(q.q || "") && /組合せ/.test(q.q || "");
      for (const c of XM_LIST) {
        const n = c.qs.find((q) => !isK(q) && !q.tfq && (q.c || []).length >= 4), k = c.qs.find(isK);
        if (n) await look(`${c.name}の択一`, () => xmRun(c, { deck: [n], i: 0, right: 0, title: "検査" }));
        if (k) await look(`${c.name}の組合せ`, () => xmRun(c, { deck: [k], i: 0, right: 0, title: "検査" }));
      }
      const gn = GY_ALL.find((q) => gyKind(q) === "go" && !gyKumi(q)), gk = GY_ALL.find((q) => gyKind(q) === "go" && gyKumi(q) && isK(q));
      await look("行政書士の5肢択一", () => gyRun({ deck: [gn], i: 0, right: 0, title: "検査" }));
      if (gk) await look("行政書士の組合せ", () => gyRun({ deck: [gk], i: 0, right: 0, title: "検査" }));
      const keep = S.gyExam;
      for (const [name, q] of [["行政書士の模試の見直し（択一）", gn], ["行政書士の模試の見直し（組合せ）", gk]]) {
        if (!q) continue;
        S.gyExam = { ids: [q.id], perm: { [q.id]: [0, 1, 2, 3, 4] }, ans: { [q.id]: 0 }, flag: {}, kp: {}, used: 0, cur: 0, step: "done", day: "" };
        await look(name, () => gyExamReview(0, false), false);
      }
      S.gyExam = keep; if (typeof gyExamPause === "function") gyExamPause(); showOffice(); return out;
    });
    if (r === null) ok("択一の問題がないので解説の文字の太さは確かめない");
    else {
      const bad = r.filter(([, v]) => !/^(700|bold)\/(400|normal|なし)$/.test(v));
      if (bad.length) ng(`解説の肢ごとの正誤で、肢の文が太字・理由が細字になっていない形式がある: ${bad.map(([n, v]) => `${n}（${v}）`).join(" / ")}`);
      else ok(`解説の肢ごとの正誤は、${r.length}の形式すべてで肢の文が太字・理由が細字`);
    }
    await page.close();
  }
  // 「くわしい解説」は答え合わせの結果のすぐ下（肢ごとの正誤より上）に出て、間違えたら「選んだ肢が違う理由・ひっかけ所」、正解なら「関連知識」が先頭に来ること
  // （2026-11-05 satou「くわしい解説の部分も改善できるかも」。スマホでは肢ごとの正誤の下＝約2,300px下にあり読まれにくかった。research/detail-explain-2026-11-05.md）
  // 新しい試験や形式を足して、解説が出ない・下に残る・並びが違えば落とす。択一は全部、間違い（1番目）と正解の両方で確かめる
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`くわしい解説: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      if (typeof XM_LIST === "undefined" || typeof GY_ALL === "undefined") return null;
      const tick = () => new Promise((res) => setTimeout(res, 0)), bad = []; let n = 0;
      const jobs = [...XM_LIST.flatMap((c) => c.qs.map((q) => [q, () => xmRun(c, { deck: [q], i: 0, right: 0, title: "検査" })])),
        ...GY_ALL.filter((q) => gyKind(q) !== "kiji").map((q) => [q, () => gyRun({ deck: [q], i: 0, right: 0, title: "検査" })])];
      for (const [q, go] of jobs) for (const last of [false, true]) {
        go(); await tick();
        const bs = [...$app.querySelectorAll(".choices button")]; if (!bs.length) continue;
        n++; bs[last ? bs.length - 1 : 0].click(); await tick(); await tick();
        const det = $app.querySelector(".gydet"), res = $app.querySelector(".gyres"), ex = $app.querySelector(".gyexw");
        if (!det) { bad.push(`${q.id}：くわしい解説が出ない`); continue; }
        const ok = res && res.classList.contains("ok"), heads = [...det.querySelectorAll("li.dtc > b")].map((b) => b.textContent);
        const key = ok ? /^関連知識$/ : /^(?:あなたの選んだ肢\d+が違う理由|ひっかけ所|落としやすい点)$/;
        if (!det.classList.contains("dtup") || (ex && !(det.compareDocumentPosition(ex) & 4))) bad.push(`${q.id}：くわしい解説が結果のすぐ下にない`);
        else if (heads.some((h) => (ok ? /^関連知識$/ : /^(?:ひっかけ所|落としやすい点)$/).test(h)) && !key.test(heads[0] || "")) bad.push(`${q.id}：${ok ? "正解" : "不正解"}なのに先頭が「${heads[0]}」`);
        if (bad.length > 10) break;
      }
      showOffice(); return { n, bad };
    });
    if (r === null) ok("択一の問題がないので、くわしい解説の位置は確かめない");
    else if (r.bad.length) ng(`くわしい解説の位置・並びがおかしい（${r.n}回中）: ${r.bad.join(" / ")}`);
    else ok(`くわしい解説は、択一${r.n}回の答え合わせすべてで結果のすぐ下に出て、正誤に合わせて並ぶ`);
    await page.close();
  }
  // 解答からすぐ条文を見られること（2026-11-05 satou「解答と条文が離れた位置に置かれていますが、解答からすぐに条文がみれるようにしたい」）。
  // 答え合わせ・見直し・論文の模範答案・研修の解説の中の「民法96条3項」などが押せて（button.jl）、押すとその場に条文が開き、もう一度押すと閉じる。
  // 落とすもの：①法令名つきで書いた条文で、アプリに本文があるのに押せないもの（すべての択一と論文で数える）
  // ②形式ごとに、押すと開かない・閉じない・横にはみ出す ③出題中の問題の文・選択肢に出る。新しい試験や画面を足して漏れたら落とす
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(`条文を開く: ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      if (typeof GY_JOBUN === "undefined" || typeof XM_LIST === "undefined") return null;
      const tick = () => new Promise((res) => setTimeout(res, 0)), bad = [], miss = [], forms = {};
      const laws = [...new Set(Object.keys(GY_JOBUN).map((k) => k.replace(/\d+条(?:の\d+)*$/, "")))].sort((a, b) => b.length - a.length);
      const RE = new RegExp(`(?<!旧|改正前の?)(${laws.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})第?(\\d+)条((?:の\\d+)*)`, "g");
      const SKIP = ".question, .choices, .kmst, .kmlead, .mine, .checks, .jobun, .jlbox, .cites, button, textarea, select, summary, a, h4, label";
      const look = async (name, id, full) => {
        await tick(); await tick();
        const f = forms[name] = forms[name] || { n: 0, open: 0 }; f.n++;
        if ($app.querySelector(".question button.jl, .choices button.jl, .kmst button.jl, .mine button.jl")) bad.push(`${name} ${id}：問題の文に出る`);
        const w = document.createTreeWalker($app, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) { const el = n.parentElement; if (!el.closest(".msg, .cmp") || el.closest(SKIP)) continue;
          for (const m of n.nodeValue.matchAll(RE)) if (GY_JOBUN[m[1] + m[2] + "条" + (m[3] || "")] && miss.length < 30) miss.push(`${id}「${m[0]}」`); }
        const b = $app.querySelector("button.jl"); if (!b || !full) return;
        b.click(); await tick(); const box = document.getElementById(b.getAttribute("aria-controls") || "-");
        if (!box || !box.querySelector(".jbart")) bad.push(`${name} ${id}：押しても条文が開かない`); else f.open++;
        if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`${name} ${id}：開くと横にはみ出す`);
        b.click(); await tick(); if (b.getAttribute("aria-expanded") !== "false" || (box && box.isConnected)) bad.push(`${name} ${id}：閉じない`);
      };
      const every = (l, k) => l.filter((_, i) => i % k === 0);
      for (const q of GY_ALL) { const k = gyKind(q); gyRun({ deck: [q], i: 0, right: 0, title: "検査" }); await tick();
        if ($app.querySelector("button.jl")) bad.push(`${q.id}：出題中に出る`);
        if (k === "go") $app.querySelector(".choices button").click();
        else if (k === "tashi") { $app.querySelectorAll(".gysel select").forEach((s) => s.value = s.options[1].value); document.getElementById("gyCheck").click(); }
        else document.getElementById("gyShow").click();
        await look(`行政書士（${GY_KIND_NAME[k]}）`, q.id, true); }
      for (const c of XM_LIST) for (const q of c.qs) { xmRun(c, { deck: [q], i: 0, right: 0, title: "検査" }); await tick(); $app.querySelector(".choices button").click(); await look(c.short || c.key, q.id, true); }
      try { const keep = S.gyExam; S.gyExam = gyExamNew(); gyExamFinish(); for (const i of [0, 20, 40, 45, 50]) { gyExamReview(i); await look("行政書士の模試の見直し", i, true); } S.gyExam = keep; } catch (e) { bad.push("行政書士の模試の見直し：" + e.message); }
      for (const c of XM_LIST) { if (!(c.mocks || []).length) continue; try { xmOpen(c, c.mocks[0]); await tick(); if ($app.querySelector("button.jl")) bad.push(`${c.key}：模試の出題中に出る`); xmFinish(); for (const i of [0, 3]) { xmReview(i); await look("ほかの試験の模試の見直し", c.key + i, true); } } catch (e) { bad.push(`${c.key} の模試の見直し：` + e.message); } }
      if (typeof xmIv !== "undefined") clearInterval(xmIv); if (typeof gyExamIv !== "undefined") clearInterval(gyExamIv);
      for (const p of probs()) { writeCompare(p.id); $app.querySelectorAll("details.modeld").forEach((d) => d.open = true); await look("論文の模範答案", p.id, true); }
      for (const q of every(AREAS.flatMap((a) => a.qs), 3)) { drillQ({ deck: [q], i: 0, right: 0 }); await tick(); $app.querySelector(".choices button").click(); await look("研修・ドリル", q.id, true); }
      for (const [name, f] of Object.entries(forms)) if (f.open < f.n * 0.6) bad.push(`${name}：条文を開けた画面が少ない（${f.open}/${f.n}）`);
      showOffice(); return { bad, miss, forms };
    });
    if (r === null) ok("条文のデータがないので、条文を開く検査はしない");
    else {
      if (r.miss.length) ng(`解説に法令名つきで書いた条文が押せない（本文はある）: ${r.miss.slice(0, 15).join(" / ")}`);
      if (r.bad.length) ng(`解説から条文を開けない画面がある: ${r.bad.slice(0, 12).join(" / ")}`);
      if (!r.miss.length && !r.bad.length) ok(`解説の条文番号を押すとその場で条文が開く（${Object.entries(r.forms).map(([k, f]) => `${k} ${f.open}/${f.n}`).join("・")}）`);
    }
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
