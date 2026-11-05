// Cloudflare Pages Function: POST /api/chat
// Tries free AI services one by one. If all fail it returns 503 and the page answers from its offline library.
const SYSTEM = "You are the study assistant of the Smart Study Helper Bot website, used by college students. " +
  "Answer questions on ANY subject clearly and correctly. Use simple English (if the student writes Hinglish, reply in Hinglish). " +
  "Structure: short definition, step by step explanation, a small example, and 2 to 3 exam points when useful. " +
  "Keep it under 300 words unless asked for more. If you are not sure, say so instead of guessing.";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function gemini(env, msgs) {
  if (!env.GEMINI_API_KEY) throw new Error("no key");
  const model = env.GEMINI_MODEL || "gemini-flash-latest";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 900, temperature: 0.4 }
    })
  });
  if (!r.ok) throw new Error("gemini " + r.status);
  const d = await r.json();
  const t = d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!t) throw new Error("empty");
  return { reply: t, source: "Gemini" };
}

async function workersAI(env, msgs) {
  if (!env.AI) throw new Error("no binding");
  const d = await env.AI.run(env.CF_MODEL || "@cf/meta/llama-3.1-8b-instruct", { messages: [{ role: "system", content: SYSTEM }, ...msgs], max_tokens: 700 });
  if (!d?.response) throw new Error("empty");
  return { reply: d.response, source: "Cloudflare AI" };
}

async function groq(env, msgs) {
  if (!env.GROQ_API_KEY) throw new Error("no key");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
    body: JSON.stringify({ model: env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: SYSTEM }, ...msgs], max_tokens: 700, temperature: 0.4 })
  });
  if (!r.ok) throw new Error("groq " + r.status);
  const d = await r.json();
  const t = d.choices?.[0]?.message?.content;
  if (!t) throw new Error("empty");
  return { reply: t, source: "Groq" };
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

  for (const layer of [gemini, workersAI, groq]) {
    try {
      const out = await layer(env, msgs);
      const res = json(out);
      if (msgs.length === 1) { const c = new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" } }); await cache.put(key, c); }
      return res;
    } catch (e) { /* try the next layer */ }
  }
  return json({ error: "all AI services busy" }, 503);
}
