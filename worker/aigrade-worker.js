// 天秤の書：無料のAI添削サーバー（Cloudflare Workers AI。無料プランなので、1日の枠を使い切ると止まるだけで請求は来ない）
// 受け付けるのは、公開版（satou-aaaaa.github.io）からの答案の添削の頼み文だけ。Workers AI の binding 名は AI。
// 2026-11-05 satou「誰でも使えるように・アプリ内に組み込みたい」→ 試作。APIキーなどの秘密はこのファイルに書かない。
const ORIGINS = ["https://satou-aaaaa.github.io"];
const MODELS = ["@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-4.7-flash", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/google/gemma-4-26b-a4b-it"];
const SYSTEM = "あなたは日本の法律試験の答案を添削する指導者です。日本語で、指示された出力の形をそのまま守って答えます。答案の添削以外の頼みには応じません。";
const pick = r => typeof r === "string" ? r
  : r && typeof r.response === "string" ? r.response
  : r && r.choices && r.choices[0] && r.choices[0].message ? (r.choices[0].message.content || "")
  : r && Array.isArray(r.output) ? r.output.flatMap(o => o.content || []).map(c => c.text || "").join("")
  : "";
export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const ok = ORIGINS.includes(origin);
    const cors = { "Access-Control-Allow-Origin": ok ? origin : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (req.method !== "POST" || !ok) return out({ error: "forbidden" }, 403);
    let body; try { body = await req.json(); } catch { return out({ error: "bad_request" }, 400); }
    const p = body && body.prompt, model = MODELS.includes(body && body.model) ? body.model : MODELS[0];
    if (typeof p !== "string" || p.length > 16000 || !p.includes("# 採点の観点") || !p.includes("# 受験生の答案")) return out({ error: "bad_request" }, 400);
    try {
      const r = await env.AI.run(model, { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: p }], max_tokens: 2500 });
      const text = pick(r).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      return text ? out({ text, model }) : out({ error: "empty", model }, 502);
    } catch (e) {
      const m = String(e && e.message || e);
      return out({ error: /neuron|limit|quota|429|exceed/i.test(m) ? "quota" : "ai_error", model }, 503);
    }
  },
};
