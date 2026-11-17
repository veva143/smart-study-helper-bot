// Cloudflare Pages Function: POST /api/chat
// Tries free AI services one by one. If all fail it returns 503 and the page answers from its offline library.
// Model names change often, so Gemini models are read from the live list of the API instead of being fixed.
const SYSTEM = "You are the study assistant of the Smart Study Helper Bot website, used by college students. " +
  "Answer questions on ANY subject clearly and correctly. Use simple English (if the student writes Hinglish, reply in Hinglish). " +
  "Structure: short definition, step by step explanation, a small example, and 2 to 3 exam points when useful. " +
  "Keep it under 300 words unless asked for more. If you are not sure, say so instead of guessing.";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const late = (t0) => Date.now() - t0 > 30000;          // stop trying new models after 30 seconds
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("no reply in " + ms / 1000 + "s")), ms))]);

let modelCache = null;
async function geminiModels(env) {
  if (env.GEMINI_MODEL) return [env.GEMINI_MODEL];
  if (modelCache) return modelCache;
  let names = [];
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      names = (d.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace("models/", ""))
        .filter(n => /flash/.test(n) && !/preview|exp|image|tts|live|audio|thinking|embed|robot|computer|vision|-\d{3}$/.test(n));
      names.sort((a, b) => (/latest/.test(b) - /latest/.test(a)) || (/lite/.test(a) - /lite/.test(b)) || (a < b ? 1 : -1));
    }
  } catch (e) { /* use the fallback names */ }
  modelCache = names.length ? names.slice(0, 3) : ["gemini-flash-latest", "gemini-flash-lite-latest"];
  return modelCache;
}

async function gemini(env, msgs, t0) {
  if (!env.GEMINI_API_KEY) throw new Error("gemini: no key");
  const errs = [];
  for (const model of await geminiModels(env)) {
    if (late(t0)) { errs.push("deadline"); break; }
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(9000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: 900, temperature: 0.4 }
        })
      });
      if (!r.ok) { errs.push(model + " HTTP " + r.status); if (r.status === 401 || r.status === 403) break; modelCache = null; continue; }
      const d = await r.json();
      const t = d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
      if (t) return { reply: t, source: "Gemini" };
      errs.push(model + " empty");
    } catch (e) { errs.push(model + " " + (e.name === "TimeoutError" ? "no reply in 9s" : e.message)); }
  }
  throw new Error("gemini: " + errs.join(", "));
}

function cfText(d) {
  if (typeof d === "string") return d;
  return d?.response || d?.result?.response || d?.choices?.[0]?.message?.content || d?.output_text ||
    (Array.isArray(d?.output) ? d.output.flatMap(o => o.content || []).map(c => c.text || "").join("") : "") || "";
}

async function workersAI(env, msgs, t0) {
  if (!env.AI) throw new Error("cloudflare AI: binding not added");
  const errs = [], list = [env.CF_MODEL, "@cf/google/gemma-4-26b-a4b-it", "@cf/openai/gpt-oss-20b", "@cf/zai-org/glm-4.7-flash"].filter(Boolean);
  for (const model of list) {
    if (late(t0)) { errs.push("deadline"); break; }
    try {
      const d = await withTimeout(env.AI.run(model, { messages: [{ role: "system", content: SYSTEM }, ...msgs], max_tokens: 700 }), 12000);
      const t = cfText(d);
      if (t) return { reply: t, source: "Cloudflare AI" };
      errs.push(model + " empty");
    } catch (e) { errs.push(model.split("/").pop() + " " + String(e.message || e).slice(0, 90)); }
  }
  throw new Error("cloudflare AI: " + errs.join(", "));
}

async function groq(env, msgs, t0) {
  if (!env.GROQ_API_KEY) throw new Error("groq: no key");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(9000),
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
    body: JSON.stringify({ model: env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: SYSTEM }, ...msgs], max_tokens: 700, temperature: 0.4 })
  });
  if (!r.ok) throw new Error("groq HTTP " + r.status);
  const t = (await r.json()).choices?.[0]?.message?.content;
  if (!t) throw new Error("groq empty");
  return { reply: t, source: "Groq" };
}

// Open /api/chat in the browser to see which services are configured (no secrets are shown)
export async function onRequestGet({ env }) {
  return json({ ok: true, gemini: !!env.GEMINI_API_KEY, cloudflareAI: !!env.AI, groq: !!env.GROQ_API_KEY });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "no question" }, 400);

  // Cache: the same single question is answered from the cache, so free limits last longer
  const last = msgs[msgs.length - 1].content.trim().toLowerCase();
  const cache = caches.default, key = new Request("https://cache.local/chat?q=" + encodeURIComponent(last));
  if (msgs.length === 1) { const hit = await cache.match(key); if (hit) return hit; }

  const t0 = Date.now(), errors = [];
  for (const layer of [gemini, workersAI, groq]) {
    try {
      const out = await layer(env, msgs, t0);
      if (msgs.length === 1) await cache.put(key, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" } }));
      return json(out);
    } catch (e) { errors.push(String(e.message || e)); }
  }
  return json({ error: "all AI services busy", errors }, 503);
}
