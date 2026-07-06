// Supabase Edge Function — AI scripture/quote suggestions for the RN app.
// Ported from Connexional-Prayer-Board/app/api/portal/ai-suggestions/route.ts
// + lib/portal/groq.ts. That Next.js route only accepts cookie-based auth
// (see lib/supabase/server.ts), which a native app can't produce, so this
// function exists purely to give the mobile client an equivalent endpoint
// authenticated the standard way (Authorization: Bearer <user JWT>) that
// Supabase Edge Functions verify natively — the deployed web app is
// untouched.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const AI_COOLDOWN_SECONDS = 15;

const SYSTEM_PROMPT = `You suggest Bible scriptures and short Christian quotes that support a prayer topic.
Rules:
- Only use well-known Bible verses you are certain exist, with accurate "Book Chapter:Verse" references.
- For quotes, use short quotes from well-known Christian figures; the reference is the person's name.
- Never invent references. Vary the books/authors you draw from.
- Respond ONLY with JSON in this exact shape:
{"suggestions":[{"type":"scripture","reference":"Philippians 4:6","text":"..."}]}
"type" is "scripture" or "quote".`;

interface Suggestion {
  type: "scripture" | "quote";
  reference: string;
  text: string;
}

function isValidSuggestion(s: unknown): s is Suggestion {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  return (
    (v.type === "scripture" || v.type === "quote") &&
    typeof v.reference === "string" &&
    v.reference.length > 0 &&
    v.reference.length <= 120 &&
    typeof v.text === "string" &&
    v.text.length > 0 &&
    v.text.length <= 1000
  );
}

async function generateSuggestions(params: {
  title: string;
  details: string | null;
  count: number;
  kind: "scripture" | "quote" | "mixed";
  avoidReferences: string[];
}): Promise<Suggestion[] | { error: string }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return { error: "AI suggestions are not configured yet" };

  const kindLine =
    params.kind === "mixed"
      ? "a mix of Bible scriptures and Christian quotes"
      : params.kind === "quote"
        ? "Christian quotes"
        : "Bible scriptures";

  const userPrompt = [
    `Prayer topic: ${params.title}`,
    params.details ? `Details: ${params.details}` : null,
    `Give exactly ${params.count} suggestions: ${kindLine}.`,
    params.avoidReferences.length
      ? `Do NOT repeat these references: ${params.avoidReferences.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.7,
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (res.status === 429) {
        return { error: "The AI is busy right now — try again in a minute" };
      }
      if (!res.ok) {
        console.error("Groq error:", res.status, await res.text());
        continue;
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content) continue;

      const parsed = JSON.parse(content);
      const suggestions = parsed?.suggestions;
      if (!Array.isArray(suggestions) || suggestions.length === 0) continue;
      if (!suggestions.every(isValidSuggestion)) continue;

      return suggestions.slice(0, params.count);
    } catch (error) {
      console.error("Groq request failed:", error);
    }
  }

  return { error: "Could not generate suggestions — please try again" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { requestId?: string; count?: number; kind?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const requestId = body.requestId;
  const count = body.count;
  const kind = body.kind;
  if (
    typeof requestId !== "string" ||
    typeof count !== "number" ||
    count < 1 ||
    count > 20 ||
    (kind !== "scripture" && kind !== "quote" && kind !== "mixed")
  ) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("last_ai_request_at")
    .eq("id", user.id)
    .single();

  if (profile?.last_ai_request_at) {
    const elapsed = (Date.now() - new Date(profile.last_ai_request_at).getTime()) / 1000;
    if (elapsed < AI_COOLDOWN_SECONDS) {
      return new Response(
        JSON.stringify({
          error: `Please wait ${Math.ceil(AI_COOLDOWN_SECONDS - elapsed)}s before generating again`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const { data: prayerRequest } = await supabase
    .from("portal_prayer_requests")
    .select("title, details")
    .eq("id", requestId)
    .maybeSingle();

  if (!prayerRequest) {
    return new Response(JSON.stringify({ error: "Prayer point not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: existing } = await supabase
    .from("portal_scriptures")
    .select("reference")
    .eq("request_id", requestId)
    .not("reference", "is", null);

  await supabase
    .from("portal_profiles")
    .update({ last_ai_request_at: new Date().toISOString() })
    .eq("id", user.id);

  const result = await generateSuggestions({
    title: prayerRequest.title,
    details: prayerRequest.details,
    count,
    kind,
    avoidReferences: (existing ?? []).map((row) => row.reference as string).filter(Boolean),
  });

  if ("error" in result) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ suggestions: result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
