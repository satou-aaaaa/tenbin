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
<script>window.TENBIN_PWA = true;</script>
</head><body>
`;
const tail = `
<p style="text-align:center;margin:16px 0 24px;font:13px system-ui,sans-serif"><a href="changes.html" style="color:#cfe3d9">更新情報</a></p>
<script>
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
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
const CACHE = "tenbin-${VER}";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("tenbin-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// アプリ本体とフォント: キャッシュをすぐ返し、裏で新しい版を取りに行く（stale-while-revalidate）
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  const font = u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (u.origin !== location.origin && !font) return;
  // 更新情報（changes.html）は別のページなので、アプリ本体に置き換えない
  const key = req.mode === "navigate" && !u.pathname.endsWith("/changes.html") ? "index.html" : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: req.mode === "navigate" });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(key, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response("オフラインです。一度インターネットにつないで開いてください。", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
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
