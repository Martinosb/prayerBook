import { supabase } from "../supabase/client";
import type { AiSuggestion } from "./types";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export type SuggestionKind = "scripture" | "quote" | "mixed";

export async function generateAiSuggestions(input: {
  requestId: string;
  count: number;
  kind: SuggestionKind;
}): Promise<{ suggestions: AiSuggestion[] } | { error: string }> {
  try {
    const res = await authedFetch("ai-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error ?? "Could not generate suggestions" };
    return json;
  } catch {
    return { error: "Could not reach the AI service — check your connection" };
  }
}

export async function transcribeVoiceNote(
  uri: string,
  mimeType: string,
): Promise<{ path: string; transcript?: string; error?: string }> {
  const ext = mimeType.split("/")[1] ?? "m4a";
  const form = new FormData();
  // React Native's fetch FormData accepts this { uri, name, type } shape
  // in place of a Blob for file uploads.
  form.append("audio", {
    uri,
    name: `recording.${ext}`,
    type: mimeType,
  } as unknown as Blob);

  const res = await authedFetch("transcribe", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok && !json.path) throw new Error(json.error ?? "Could not upload recording");
  return json;
}
