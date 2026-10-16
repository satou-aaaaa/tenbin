// 使い方: node build_pwa.mjs <hourei-quest.html> <出力フォルダ>
import fs from "fs"; import path from "path";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VER = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const body = fs.readFileSync(src, "utf8");
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
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#14302a}</style>
<script>window.TENBIN_PWA = true; window.TENBIN_VER = "${VER}";</script>
</head><body>
`;
const tail = `
<p style="text-align:center;margin:16px 0 24px;font:13px system-ui,sans-serif"><a href="changes.html" style="color:#cfe3d9">更新情報</a></p>
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
</body></html>
`;
fs.writeFileSync(path.join(out, "index.html"), head + body + tail);
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
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
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
  // アイコン・manifest・フォント: キャッシュをすぐ返し、裏で新しい版を取りに行く（stale-while-revalidate）
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || offline();
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
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await b.newPage();
for (const [f, size, pad] of [["icon-192.png", 192, 1], ["icon-512.png", 512, 1], ["apple-touch-icon.png", 180, 1], ["icon-maskable-512.png", 512, .72]]) {
  await pg.setViewportSize({ width: size, height: size });
  await pg.setContent(`<style>html,body{margin:0}</style>${icon(size, pad)}`);
  await pg.screenshot({ path: path.join(out, f), omitBackground: false });
}
await b.close();
console.log("built", VER, fs.readdirSync(out));
