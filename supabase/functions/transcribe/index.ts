// Supabase Edge Function — voice-note upload + transcription for the RN app.
// Ported from Connexional-Prayer-Board/app/api/portal/transcribe/route.ts +
// lib/portal/transcribe.ts. Same rationale as ai-suggestions/index.ts: gives
// the mobile client a Bearer-token-authenticated equivalent without
// touching the deployed Next.js app (which only accepts cookie auth).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const BUCKET = "portal-voice-notes";
const MAX_BYTES = 15 * 1024 * 1024;
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

const EXT_BY_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

async function transcribeAudio(audio: Blob, filename: string): Promise<{ text: string } | { error: string }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return { error: "Voice transcription is not configured yet" };

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", MODEL);
  form.append("response_format", "json");

  try {
    const res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (res.status === 429) {
      return { error: "The transcription service is busy — try again in a minute" };
    }
    if (!res.ok) {
      console.error("Groq transcription error:", res.status, await res.text());
      return { error: "Could not transcribe that recording — please try again" };
    }

    const json = await res.json();
    const text = json?.text;
    if (typeof text !== "string" || !text.trim()) {
      return { error: "Didn't catch any speech in that recording" };
    }
    return { text: text.trim() };
  } catch (error) {
    console.error("Groq transcription request failed:", error);
    return { error: "Could not reach the transcription service" };
  }
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

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return new Response(JSON.stringify({ error: "No recording received" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (audio.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: "Recording is too long — keep it under 2 minutes" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ext = EXT_BY_TYPE[audio.type] ?? "webm";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: audio.type || "audio/webm" });

  if (uploadError) {
    console.error("Voice note upload failed:", uploadError);
    return new Response(JSON.stringify({ error: "Could not save that recording" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await transcribeAudio(audio, `recording.${ext}`);

  if ("error" in result) {
    return new Response(JSON.stringify({ path, error: result.error }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ path, transcript: result.text }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
