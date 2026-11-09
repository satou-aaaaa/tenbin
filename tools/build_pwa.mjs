// 使い方: node tools/build_pwa.mjs <元のHTML> <出力フォルダ>
//   元のHTML: アプリ本体（claude.ai 版の単体HTML hourei-quest.html）か、前に作った index.html。
//             index.html を渡すと、本体の部分だけを取り出して包み直す（元のHTMLが手元に無くても作り直せる）。
//   版（VER）: ふだんは今の時刻。SOURCE_DATE_EPOCH（秒）があればその時刻にする（同じ入力から同じ出力を作るため）。
//   ブラウザ: アイコンの PNG を描くのに Playwright の Chromium を使う。CHROMIUM_PATH があればそれを使う。
// 作るもの: index.html・jobun.json（条文の本文）・manifest.webmanifest・sw.js・アイコン4つ（どれも生成物。直接直さない）
import fs from "fs"; import path from "path";
import { chromium } from "playwright";
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("使い方: node tools/build_pwa.mjs <元のHTML> <出力フォルダ>"); process.exit(2); }
const epoch = process.env.SOURCE_DATE_EPOCH;
if (epoch && !/^\d+$/.test(epoch)) { console.error("SOURCE_DATE_EPOCH は秒の整数で指定する"); process.exit(2); }
const VER = new Date(epoch ? Number(epoch) * 1000 : Date.now()).toISOString().slice(0, 16).replace(/[-:T]/g, "");
// 外側（head と tail）の境目。tail の1行目（TAIL_START）を変えるときは、前に作った index.html からも
// 取り出せるよう、前の1行目を TAIL_STARTS に残す。
const HEAD_END = "</head><body>\n";
const TAIL_START = "\n<p style=\"text-align:center;margin:16px 0 24px;font:13px system-ui,sans-serif\"><a href=\"changes.html\"";
const TAIL_STARTS = [TAIL_START];
const MARK = "<script>window.TENBIN_PWA = true; window.TENBIN_VER = ";
const unwrap = (html) => {
  // 外側が付けた <script> の行で見分ける。本体のコメントにも「window.TENBIN_PWA = true」の文字があるため、
  // その文字だけで見分けると本体を index.html と取り違える。
  if (!html.includes(MARK)) return html; // アプリ本体そのもの
  const a = html.indexOf(HEAD_END);
  const ends = TAIL_STARTS.map((t) => html.lastIndexOf(t)).filter((i) => i > a);
  if (a < 0 || !ends.length) { console.error("index.html から本体の部分を取り出せない（外側の形が変わっている）"); process.exit(1); }
  return html.slice(a + HEAD_END.length, Math.min(...ends));
};
// Artifact の read で取った写しには、公開のときに付く外枠（<!doctype html>…<body> と </body></html>）が付いている。
// そのまま入れると index.html の中に二つ目の <!doctype> が入る（2026-11-04 #74 で起きた）ので、外枠を外す。
const stripArtifactFrame = (h) => {
  const m = h.match(/^<!doctype html><html><head>[\s\S]*?<\/head><body>\n/i);
  if (!m) return h;
  return h.slice(m[0].length).replace(/\n*<\/body><\/html>\s*$/i, "\n");
};
// 条文の本文（GY_JOBUN。約2.8MB）は jobun.json に分け、最初の画面が出たあとで読む（2026-11-09。index.html が 7.2MB に
// なり、Lighthouse の速さが下限の近くまで落ちた）。本体（claude.ai 版）は1つのファイルのまま変えず、ここで分ける。
// 分けたあとの index.html からも元の本体に戻せるよう、置き換えは決まった文字どうしにして、戻すとき（join）は逆にたどる。
const JOBUN_A = /^const GY_JOBUN = (\{.*\});$/m, JOBUN_B = /^Object\.assign\(GY_JOBUN, (\{.*\})\);$/m;
const JOBUN_A_OUT = `const GY_JOBUN = {}; // tenbin:jobun 条文の本文は jobun.json（tools/build_pwa.mjs が分ける）。最初の画面のあとで読む
// 届くまでに描いた「根拠条文（本文）」は仮の枠にしておき、届いたら描き直す。読めなければ、次に画面を押したときかネットが戻ったときに読み直す
window.TENBIN_JOBUN_WAIT = (refs) => \`<details class="jobun" open data-jbwait="\${JSON.stringify(refs).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><summary>根拠条文（本文）</summary><p class="jbsrc">条文の本文を読み込んでいます。つながらないときは、ネットにつないでから画面を押すと読み直します。</p></details>\`;
window.TENBIN_JOBUN = new Promise((ok) => {
  let busy = false, done = false, again = false;
  const get = (n) => fetch("jobun.json?v=" + window.TENBIN_VER, { priority: "low" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch((e) => n > 0 ? new Promise((w) => setTimeout(w, 3000)).then(() => get(n - 1)) : Promise.reject(e));
  // 仮の枠を本文に描き直す。閉じていたら閉じたまま、見出しにいたら見出しに戻す
  const fill = () => document.querySelectorAll("[data-jbwait]").forEach((el) => {
    try { GY_JB.__jbw = JSON.parse(el.dataset.jbwait); const t = document.createElement("template"); t.innerHTML = gyJobun({ id: "__jbw" });
      const nu = t.content.firstElementChild; if (!nu) return; const was = el.contains(document.activeElement);
      if (!el.open) nu.open = false; el.replaceWith(nu); if (was) nu.querySelector("summary")?.focus({ preventScroll: true }); } catch {} finally { delete GY_JB.__jbw; } });
  // 読んでいる間にネットが戻ったら、失敗したあとすぐ読み直す
  const load = () => { if (done) return; if (busy) { again = true; return; } busy = true; again = false;
    get(2).then(([a, b]) => { done = true; Object.assign(GY_JOBUN, a, b); window.TENBIN_JOBUN_WAIT = null; try { _seIdx = null; } catch {} fill();
      try { if (document.getElementById("seOut")) seRender(); } catch {} ok(true); })
      .catch(() => { busy = false; if (again) load(); }); };
  if (document.readyState === "complete") setTimeout(load, 0); else addEventListener("load", () => setTimeout(load, 0), { once: true });
  addEventListener("pointerdown", () => { if (!busy) load(); }, true); addEventListener("keydown", () => { if (!busy) load(); }, true); addEventListener("online", load);
});`;
const JOBUN_B_OUT = "// tenbin:jobun-more ほかの資格試験の条文の本文も jobun.json";
// 根拠条文の枠（gyJobun）は、本文が届く前なら仮の枠を返す。「解答からすぐ条文を見る」は、始めに条文の法令名を集めるので、本文が届いてから始める
const JOBUN_PATCH = [
  ["const refs = (typeof GY_JB !== \"undefined\" && GY_JB[q.id]) || []; if (!refs.length) return \"\";\n",
    "const refs = (typeof GY_JB !== \"undefined\" && GY_JB[q.id]) || []; if (!refs.length) return \"\";\n  if (window.TENBIN_JOBUN_WAIT && !refs.some(([k]) => GY_JOBUN[k])) return window.TENBIN_JOBUN_WAIT(refs);\n"],
  ["(() => {\n  if (typeof GY_JOBUN === \"undefined\") return;\n  // 略称 → GY_JOBUN の法令名",
    "window.TENBIN_JOBUN.then(() => {\n  if (typeof GY_JOBUN === \"undefined\") return;\n  // 略称 → GY_JOBUN の法令名"],
  ["})();\n// ===== 解答からすぐ条文を見る ここまで =====", "});\n// ===== 解答からすぐ条文を見る ここまで ====="],
];
const count = (s, t) => s.split(t).length - 1;
const fail = (m) => { console.error(m); process.exit(1); };
// 分けたあとの形（index.html から取り出した本体）なら、jobun.json を戻して元の本体にする
const joinJobun = (h) => {
  if (!h.includes(JOBUN_A_OUT)) return h;
  const f = path.join(path.dirname(src), "jobun.json");
  if (!fs.existsSync(f)) fail(`${f} が無い（index.html から作り直すときは、同じフォルダの jobun.json が要る）`);
  const [a, b] = JSON.parse(fs.readFileSync(f, "utf8"));
  if (count(h, JOBUN_A_OUT) !== 1 || count(h, JOBUN_B_OUT) !== 1) fail("index.html の条文の置き場所の印が1つずつでない");
  h = h.replace(JOBUN_A_OUT, () => `const GY_JOBUN = ${JSON.stringify(a)};`).replace(JOBUN_B_OUT, () => `Object.assign(GY_JOBUN, ${JSON.stringify(b)});`);
  for (const [orig, patched] of JOBUN_PATCH) { if (count(h, patched) !== 1) fail("条文の待ち合わせの印（JOBUN_PATCH）が見つからない"); h = h.replace(patched, () => orig); }
  return h;
};
// 元の本体から条文の本文を抜き出す。本体の形が変わって見つからないときは止める（黙って分けずに重いまま出さない）
const splitJobun = (h) => {
  const a = h.match(JOBUN_A), b = h.match(JOBUN_B);
  if ((!a || !b) && h.includes("const GY_JOBUN = {}; // tenbin:jobun")) fail("index.html の条文の置き場所が前の形（JOBUN_A_OUT を変えた）。前の形からは戻せないので、分ける前の本体（claude.ai 版か、分ける前の main の index.html）から作り直す。JOBUN_A_OUT を変えるときは、前の形も戻せるようにする");
  if (!a || !b) fail("本体に「const GY_JOBUN = {…};」か「Object.assign(GY_JOBUN, {…});」の1行が見つからない。本体の形が変わったら tools/build_pwa.mjs の JOBUN_A・JOBUN_B を合わせる");
  for (const [orig] of JOBUN_PATCH) if (count(h, orig) !== 1) fail("本体の gyJobun か「解答からすぐ条文を見る」の形が変わった。tools/build_pwa.mjs の JOBUN_PATCH を合わせる");
  const A = JSON.parse(a[1]), B = JSON.parse(b[1]);
  if (JSON.stringify(A) !== a[1] || JSON.stringify(B) !== b[1]) fail("条文の本文が JSON.stringify の形でない（分けて戻すと同じにならない）");
  let rest = h.replace(a[0], () => JOBUN_A_OUT).replace(b[0], () => JOBUN_B_OUT);
  for (const [orig, patched] of JOBUN_PATCH) rest = rest.replace(orig, () => patched);
  return { rest, json: `[${a[1]},\n${b[1]}]\n` };
};
const { rest: body, json: jobunJson } = splitJobun(joinJobun(stripArtifactFrame(unwrap(fs.readFileSync(src, "utf8")))));
fs.mkdirSync(out, { recursive: true });
const head = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#14302a">
<meta name="description" content="司法試験の論文式を、事例問題で練習する学習ゲーム">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="天秤の書">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#14302a}[hidden]{display:none!important}</style>
<script>window.TENBIN_PWA = true; window.TENBIN_VER = "${VER}";</script>
</head><body>
`;
const tail = `
<p style="text-align:center;margin:16px 0 24px;font:13px system-ui,sans-serif"><a href="changes.html" style="color:#cfe3d9">更新情報</a>　<a id="kofi" href="https://ko-fi.com/satouaaaaa" target="_blank" rel="noopener noreferrer" style="color:#cfe3d9">☕ Ko-fi で応援</a><br><span style="display:inline-block;margin-top:6px;color:#9fbfb2;font-size:12px">天秤の書は無料・広告なしで、ひとりで作っています。応援は、問題の追加と判例の確かめに使います。</span></p>
<details id="tenbin-about" style="max-width:640px;margin:0 auto 24px;padding:0 16px;color:#cfe3d9;font:13px/1.7 system-ui,sans-serif">
<summary style="text-align:center;cursor:pointer">このアプリについて（ご利用の前に）</summary>
<ul style="margin:8px 0 0;padding-left:1.2em">
<li>学習用のアプリで、法律相談ではありません。実際のトラブルは、弁護士や法テラスに相談してください。AIの添削欄にも、実際のトラブルは書かないでください。</li>
<li>司法試験・予備試験・行政書士試験・宅建試験・社労士試験・司法書士試験などの実施団体とは関係のない、個人が作った非公式のアプリです。</li>
<li>問題・模範答案・解説は、作者がAI（Claude）を使って作り、条文と判例を確かめています。それでも誤りや、法改正で古くなった内容がありえます。内容の正確さは保証できないので、大事なところは条文・判決文や教科書で確かめてください。</li>
<li>問題はすべてこのアプリのために作ったもので、過去問の文章は使っていません。条文は e-Gov 法令検索（デジタル庁）のデータをもとに作者が加工しています。判決文は裁判所ウェブサイトなどによります。</li>
<li>進み具合と答案は、この端末のブラウザの中にだけ保存し、作者には届きません。AIの添削を使ったときだけ、答案と問題の文が Anthropic へ送られます。文字の表示のため Google Fonts を読み込むので、そのとき通信の情報（IPアドレスなど）が Google に届きます。</li>
<li>問題と解説の文章の著作権は作者にあります。転載したいときは、Ko-fi のページからご連絡ください。</li>
</ul>
</details>
<div id="tenbin-kofi" role="status" style="display:none;position:fixed;left:16px;right:16px;margin:0 auto;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483645;max-width:520px;gap:8px 10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-radius:10px;background:#f4ecd4;color:#14302a;box-shadow:0 4px 16px rgba(0,0,0,.35);font:14px/1.5 system-ui,sans-serif">
<span id="tenbin-kofi-msg" style="flex:1 1 100%"></span>
<a id="tenbin-kofi-go" href="https://ko-fi.com/satouaaaaa" target="_blank" rel="noopener noreferrer" style="font-weight:bold;padding:6px 12px;border-radius:6px;background:#14302a;color:#f4ecd4;text-decoration:none">☕ 応援する</a>
<button type="button" id="tenbin-kofi-x" style="font:inherit;padding:6px 8px;border:0;background:none;color:#14302a;cursor:pointer;text-decoration:underline">閉じる</button>
<button type="button" id="tenbin-kofi-never" style="font:inherit;padding:6px 8px;border:0;background:none;color:#14302a;cursor:pointer;text-decoration:underline;margin-left:auto">もう出さない</button>
</div>
<div id="tenbin-update" role="status" style="display:none;position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;max-width:calc(100% - 32px);gap:12px;align-items:center;padding:10px 14px;border-radius:10px;background:#f4ecd4;color:#14302a;box-shadow:0 4px 16px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif">
<span>新しい版があります。区切りのよいところで更新してください。</span>
<button type="button" id="tenbin-update-go" style="font:inherit;font-weight:bold;padding:6px 12px;border:0;border-radius:6px;background:#14302a;color:#f4ecd4;cursor:pointer">更新</button>
<button type="button" id="tenbin-update-x" aria-label="閉じる" style="font:inherit;padding:6px 8px;border:0;background:none;color:#14302a;cursor:pointer">×</button>
</div>
<script>
// Service Worker の登録と、新しい版の案内。
// 答案の途中で画面が勝手に入れ替わらないよう、自動では再読み込みしない（「更新」を押したときだけ）。
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const sw = navigator.serviceWorker, bar = document.getElementById("tenbin-update");
  document.getElementById("tenbin-update-go").onclick = () => location.reload();
  document.getElementById("tenbin-update-x").onclick = () => { bar.style.display = "none"; };
  // 新しい SW が有効になったら版を聞き、この画面より新しければ案内を出す
  sw.addEventListener("message", e => { if (e.data && e.data.version && e.data.version !== window.TENBIN_VER) bar.style.display = "flex"; });
  sw.addEventListener("controllerchange", () => { if (sw.controller) sw.controller.postMessage("version"); });
  addEventListener("load", () => sw.register("sw.js").then(reg => {
    // 開いたままにする人のために、画面に戻ったとき（最短1時間おき）にも新しい版を確かめる
    let last = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - last > 36e5) { last = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(() => {}));
}
</script>
<div id="tenbin-backup" role="status" style="display:none;position:fixed;left:16px;right:16px;margin:0 auto;top:calc(12px + env(safe-area-inset-top));z-index:2147483646;max-width:520px;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-radius:10px;background:#f4ecd4;color:#14302a;box-shadow:0 4px 16px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif">
<span id="tenbin-backup-msg"></span>
<button type="button" id="tenbin-backup-go" style="font:inherit;font-weight:bold;padding:6px 12px;border:0;border-radius:6px;background:#14302a;color:#f4ecd4;cursor:pointer">書き出しへ</button>
<button type="button" id="tenbin-backup-x" style="font:inherit;padding:6px 8px;border:0;background:none;color:#14302a;cursor:pointer;text-decoration:underline">あとで</button>
</div>
<script>
// 記録を消えにくくする（PWA版だけ。claude.ai版には入らない）。
// 1. 永続ストレージを頼む: 容量が足りないときにブラウザが記録を消す対象から外してもらう。
//    web.dev の勧めに従い、読み込み直後ではなく最初の操作のときに1回だけ頼む（Firefox は確認を出すため）。
// 2. バックアップの案内: 書き出したことが無いか、最後の書き出しから14日たったら、目次の画面で上に案内を出す。
//    「あとで」で3日は出さない。書き出すと消える。
(() => {
  const DAY = 864e5, EVERY = 14, SNOOZE = 3;
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const st = navigator.storage;
  if (st && st.persist && st.persisted) {
    const ask = () => {
      removeEventListener("pointerdown", ask, true); removeEventListener("keydown", ask, true);
      st.persisted().then(p => p || st.persist()).catch(() => {});
    };
    addEventListener("pointerdown", ask, true); addEventListener("keydown", ask, true);
  }
  const bar = document.getElementById("tenbin-backup"), msg = document.getElementById("tenbin-backup-msg");
  // 記録が少しでもあるか（何も解いていないうちは案内しない）
  const hasData = () => { try { const v = JSON.parse(get("roppo-quest-v2") || "{}");
    return ["cases", "stats", "essays", "drafts", "norms"].some(k => v[k] && Object.keys(v[k]).length); } catch { return false; } };
  const due = () => {
    if (Date.now() < Number(get("tenbin-backup-snooze") || 0) || !hasData()) return "";
    const last = Number(get("tenbin-lastexp") || 0);
    if (!last) return "記録はこの端末のブラウザの中だけにあります。消えたときのために、書き出して控えを取っておきましょう。";
    const d = Math.floor((Date.now() - last) / DAY);
    return d >= EVERY ? "最後に記録を書き出してから" + d + "日たちました。控えを取り直しておきましょう。" : "";
  };
  // 書き出しボタンがある画面（目次）のときだけ出す
  let shown = false;
  const check = () => {
    const m = document.getElementById("expBtn") ? due() : "";
    if (m && msg.textContent !== m) msg.textContent = m; // 同じ文なら触らない（監視が回り続けないように）
    if (!!m !== shown) { shown = !!m; bar.style.display = m ? "flex" : "none"; }
  };
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; check(); }); } })
    .observe(document.body, { childList: true, subtree: true });
  check();
  document.addEventListener("click", e => {
    if (e.target.closest && e.target.closest("#expBtn")) { put("tenbin-lastexp", String(Date.now())); check(); }
  }, true);
  document.getElementById("tenbin-backup-go").onclick = () => {
    const b = document.getElementById("expBtn");
    // 書き出しボタンを包む折りたたみ（「その他」→「記録の引っ越し」）を全部開く
    for (let d = b && b.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    if (b) { b.scrollIntoView({ block: "center", behavior: "smooth" }); b.focus({ preventScroll: true }); }
  };
  document.getElementById("tenbin-backup-x").onclick = () => { put("tenbin-backup-snooze", String(Date.now() + SNOOZE * DAY)); check(); };
})();
</script>
<script>
// Ko-fi の応援のお願い（PWA版だけ）。
// Eclipse は「使い始めた瞬間」にお願いを出すようにして寄付が5〜6倍になった（blogs.eclipse.org 2013-04-09）。
// ここでは、取り組んだ問題の数が節目（10・30・60・100・200…）を越えて目次に戻ったときにだけ、下に1枚出す。
// 押し付けないように: 前に出してから30日は出さない／記録の控えの案内が出ている間は出さない／「もう出さない」で二度と出さない。
(() => {
  const DAY = 864e5, GAP = 30, STEPS = [10, 30, 60, 100, 200, 300, 500, 1000];
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const bar = document.getElementById("tenbin-kofi"), msg = document.getElementById("tenbin-kofi-msg");
  // 取り組んだ問題の数（論文・事件・択一の記録の数）
  const done = () => { try { const v = JSON.parse(get("roppo-quest-v2") || "{}");
    return ["cases", "essays", "stats"].reduce((n, k) => n + (v[k] ? Object.keys(v[k]).length : 0), 0); } catch { return 0; } };
  const step = n => STEPS.filter(s => n >= s).pop() || 0;
  const due = () => {
    if (get("tenbin-kofi-never") || !document.getElementById("expBtn")) return "";
    const back = document.getElementById("tenbin-backup"), upd = document.getElementById("tenbin-update");
    if ((back && back.style.display !== "none") || (upd && upd.style.display !== "none")) return "";
    const n = done(), s = step(n);
    if (!s || s <= Number(get("tenbin-kofi-step") || 0)) return "";
    if (Date.now() - Number(get("tenbin-kofi-last") || 0) < GAP * DAY) return "";
    return "これまでに " + n + " 問に取り組みました。おつかれさまです。天秤の書は無料・広告なしで、ひとりで作っています。役に立っていたら、コーヒー1杯ぶんの応援をもらえると、問題を増やす力になります。";
  };
  let shown = false;
  const hide = () => { shown = false; bar.style.display = "none"; };
  const seen = () => { put("tenbin-kofi-step", String(step(done()))); put("tenbin-kofi-last", String(Date.now())); };
  const check = () => {
    if (shown) { if (!document.getElementById("expBtn")) hide(); return; } // 出したら、目次から離れるまでそのまま
    const m = due(); if (!m) return;
    msg.textContent = m; shown = true; bar.style.display = "flex"; seen(); // 一度出したら、次の節目まで出さない
  };
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; check(); }); } })
    .observe(document.body, { childList: true, subtree: true });
  addEventListener("load", () => setTimeout(check, 800)); // 控えの案内のあとに判断する
  document.getElementById("tenbin-kofi-go").addEventListener("click", hide);
  document.getElementById("tenbin-kofi-x").onclick = hide;
  document.getElementById("tenbin-kofi-never").onclick = () => { put("tenbin-kofi-never", "1"); hide(); };
})();
</script>
</body></html>
`;
fs.writeFileSync(path.join(out, "index.html"), head + body + tail);
fs.writeFileSync(path.join(out, "jobun.json"), jobunJson);
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
  name: "天秤の書　論文答案クエスト", short_name: "天秤の書", lang: "ja",
  description: "司法試験の論文式を、事例問題で練習する学習ゲーム",
  id: "./", start_url: "./", scope: "./", display: "standalone", orientation: "any",
  background_color: "#14302a", theme_color: "#14302a",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}, null, 2));
fs.writeFileSync(path.join(out, "sw.js"), `// 天秤の書 Service Worker（オフライン用）。版: ${VER}
// tools/build_pwa.mjs が作る生成物。直接直さない。
const VER = "${VER}";
const CACHE = "tenbin-" + VER;
const SHELL = ["./", "index.html", "jobun.json", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
// HTTP キャッシュの古いファイルを新しい版のキャッシュに入れないよう、cache: "reload" で取り直す
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("tenbin-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 画面が版を聞いてきたら答える（新しい版の案内に使う）
self.addEventListener("message", e => { if (e.data === "version" && e.source) e.source.postMessage({ version: VER }); });
const offline = () => new Response("オフラインです。一度インターネットにつないで開いてください。", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  const font = u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (u.origin !== location.origin && !font) return;
  if (req.mode === "navigate") {
    // 画面（index.html・changes.html）: ネットを先に見て、つながらないか4秒で返らないときだけキャッシュを返す（network-first）。
    // デプロイ後にオンラインで開けば、1回目から新しい版が出る。
    const key = u.pathname.endsWith("/changes.html") ? req : "index.html";
    e.respondWith(caches.open(CACHE).then(async c => {
      const net = fetch(req).then(r => { if (r && r.ok) { const copy = r.clone(); e.waitUntil(c.put(key, copy)); } return r; }).catch(() => null);
      const late = new Promise(ok => setTimeout(ok, 4000, null));
      const first = await Promise.race([net, late]);
      if (first) return first;
      const hit = await c.match(key, { ignoreSearch: true });
      return hit || (await net) || offline();
    }));
    return;
  }
  // 条文の本文・アイコン・manifest・フォント: キャッシュをすぐ返し、裏で新しい版を取りに行く（stale-while-revalidate）。
  // 条文の本文は画面が jobun.json?v=版 で頼む。この SW と同じ版のときだけ ? のあとを見ずに引く（新しい画面に古い本文を渡さない）
  e.respondWith(caches.open(CACHE).then(async c => {
    const jb = u.pathname.endsWith("/jobun.json");
    const hit = await c.match(req, { ignoreSearch: jb && u.searchParams.get("v") === VER });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    // 版のちがう条文の本文は、つながらないときだけ手元の本文で代える（新しい画面を開いた直後に切れても、条文が出ないままにしない）
    return (await net) || (jb && await c.match(req, { ignoreSearch: true })) || offline();
  }));
});
`);
const icon = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#14302a"/>
<g transform="translate(50 50) scale(${pad}) translate(-50 -50)">
${pad > .8 ? `<rect x="6" y="6" width="88" height="88" rx="6" fill="none" stroke="#d4b25a" stroke-width="2"/><rect x="10" y="10" width="80" height="80" rx="4" fill="none" stroke="#d4b25a" stroke-width=".8"/>` : ""}
<g fill="none" stroke="#d4b25a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M50 22 V76 M38 78 H62 M22 32 H78"/>
<path d="M28 32 L18 56 M28 32 L38 56 M72 32 L62 56 M72 32 L82 56"/>
</g>
<g fill="#d4b25a"><circle cx="50" cy="21" r="4"/><path d="M15 56 H41 A13 9 0 0 1 15 56 Z"/><path d="M59 56 H85 A13 9 0 0 1 59 56 Z"/></g>
</g></svg>`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pg = await b.newPage();
for (const [f, size, pad] of [["icon-192.png", 192, 1], ["icon-512.png", 512, 1], ["apple-touch-icon.png", 180, 1], ["icon-maskable-512.png", 512, .72]]) {
  await pg.setViewportSize({ width: size, height: size });
  await pg.setContent(`<style>html,body{margin:0}</style>${icon(size, pad)}`);
  await pg.screenshot({ path: path.join(out, f), omitBackground: false });
}
await b.close();
console.log("built", VER, fs.readdirSync(out));
