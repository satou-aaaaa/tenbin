// 天秤の書 Service Worker（オフライン用）。版: 202610281209
// tools/build_pwa.mjs が作る生成物。直接直さない。
const VER = "202610281209";
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
