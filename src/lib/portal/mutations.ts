import { format } from "date-fns";

import { supabase } from "../supabase/client";
import { normalizeGhanaPhone, usernameSchema } from "./validation";

export type ActionResult = { error: string } | { ok: true };

// ---------------------------------------------------------------- profile --

export async function createProfile(
  userId: string,
  email: string,
  username: string,
): Promise<ActionResult> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid username" };
  }

  // No admin client on the mobile app — RLS forbids reading other users'
  // profiles, so the live pre-check the web app does via a service-role
  // client isn't available here. We rely on the DB's unique index and
  // surface its violation with the same friendly message.
  const { error } = await supabase
    .from("portal_profiles")
    .insert({ id: userId, username: parsed.data, email });

  if (error) {
    if (error.code === "23505") return { error: "That username is already taken" };
    return { error: "Could not create your profile" };
  }
  return { ok: true };
}

export async function checkUsernameAvailable(username: string): Promise<boolean | null> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return null; // invalid, not a network result
  const { data } = await supabase
    .from("portal_profiles")
    .select("id")
    .ilike("username", parsed.data)
    .maybeSingle();
  return !data;
}

export async function updateProfile(
  userId: string,
  input: { timezone: string; phone?: string; smsOptIn: boolean },
): Promise<ActionResult> {
  let phone: string | null = null;
  if (input.phone) {
    phone = normalizeGhanaPhone(input.phone);
    if (!phone) {
      return { error: "Enter a valid Ghana number (e.g. 0241234567 or 233241234567)" };
    }
  }
  if (input.smsOptIn && !phone) {
    return { error: "Add a phone number to enable SMS reminders" };
  }

  const { error } = await supabase
    .from("portal_profiles")
    .update({ timezone: input.timezone, phone, sms_opt_in: input.smsOptIn })
    .eq("id", userId);

  if (error) return { error: "Could not save settings" };
  return { ok: true };
}

// ------------------------------------------------------------ categories --

export interface CategoryInput {
  name: string;
  description?: string;
  color?: string;
}

export async function createCategory(userId: string, input: CategoryInput): Promise<ActionResult> {
  const { error } = await supabase.from("portal_categories").insert({
    user_id: userId,
    name: input.name,
    description: input.description || null,
    color: input.color || null,
  });
  if (error) {
    if (error.code === "23505") return { error: "You already have a category with that name" };
    return { error: "Could not create category" };
  }
  return { ok: true };
}

export async function updateCategory(id: string, input: CategoryInput): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_categories")
    .update({
      name: input.name,
      description: input.description || null,
      color: input.color || null,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "You already have a category with that name" };
    return { error: "Could not update category" };
  }
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { error } = await supabase.from("portal_categories").delete().eq("id", id);
  if (error) return { error: "Could not delete category" };
  return { ok: true };
}

// -------------------------------------------------------------- requests --

export interface RequestInput {
  categoryId: string;
  title: string;
  details?: string;
  voiceNotePath?: string;
}

export async function createRequest(
  userId: string,
  input: RequestInput,
): Promise<ActionResult & { id?: string }> {
  const { data, error } = await supabase
    .from("portal_prayer_requests")
    .insert({
      user_id: userId,
      category_id: input.categoryId,
      title: input.title,
      details: input.details || null,
      voice_note_path: input.voiceNotePath || null,
    })
    .select("id")
    .single();
  if (error) return { error: "Could not create prayer point" };
  return { ok: true, id: data.id };
}

export async function updateRequest(
  id: string,
  input: { categoryId: string; title: string; details?: string },
): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_prayer_requests")
    .update({
      category_id: input.categoryId,
      title: input.title,
      details: input.details || null,
    })
    .eq("id", id);
  if (error) return { error: "Could not update prayer point" };
  return { ok: true };
}

export async function setRequestStatus(
  id: string,
  status: "active" | "answered" | "archived",
): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_prayer_requests")
    .update({
      status,
      answered_at: status === "answered" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: "Could not update status" };
  return { ok: true };
}

export async function deleteRequest(id: string): Promise<ActionResult> {
  const { data: existing } = await supabase
    .from("portal_prayer_requests")
    .select("voice_note_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("portal_prayer_requests").delete().eq("id", id);
  if (error) return { error: "Could not delete prayer point" };

  if (existing?.voice_note_path) {
    await supabase.storage.from("portal-voice-notes").remove([existing.voice_note_path]);
  }
  return { ok: true };
}

// ------------------------------------------------------------------ logs --

export interface LogInput {
  requestId: string;
  prayedOn?: string;
  prayedAt?: string;
  durationMinutes?: number;
  note?: string;
  voiceNotePath?: string;
}

/**
 * Direct write — always stamps time at call, matching the web app's
 * logPrayer() wrapper semantics. See queueLogPrayer() in offline-queue.ts
 * for the offline-aware entry point every screen should actually call.
 */
export async function logPrayerAction(userId: string, input: LogInput): Promise<ActionResult> {
  const { error } = await supabase.from("portal_prayer_logs").insert({
    user_id: userId,
    request_id: input.requestId,
    ...(input.prayedOn ? { prayed_on: input.prayedOn } : {}),
    prayed_at: input.prayedAt || null,
    duration_minutes: input.durationMinutes ?? null,
    note: input.note || null,
    voice_note_path: input.voiceNotePath || null,
  });
  if (error) return { error: "Could not log your prayer" };
  return { ok: true };
}

export function stampLogInput(input: LogInput): LogInput {
  const now = new Date();
  return {
    ...input,
    prayedOn: input.prayedOn ?? format(now, "yyyy-MM-dd"),
    prayedAt: input.prayedAt ?? format(now, "HH:mm"),
  };
}

export async function deleteLog(id: string): Promise<ActionResult> {
  const { data: existing } = await supabase
    .from("portal_prayer_logs")
    .select("voice_note_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("portal_prayer_logs").delete().eq("id", id);
  if (error) return { error: "Could not delete log entry" };

  if (existing?.voice_note_path) {
    await supabase.storage.from("portal-voice-notes").remove([existing.voice_note_path]);
  }
  return { ok: true };
}

// ----------------------------------------------------------------- plans --

export interface PlanInput {
  title: string;
  requestId?: string;
  categoryId?: string;
  frequency: "daily" | "weekly";
  daysOfWeek?: number[];
  timesPerPeriod: number;
  windowStart?: string;
  windowEnd?: string;
  endDate?: string;
}

function planToRow(input: PlanInput) {
  return {
    title: input.title,
    request_id: input.requestId ?? null,
    category_id: input.categoryId ?? null,
    frequency: input.frequency,
    days_of_week:
      input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7
        ? input.daysOfWeek
        : null,
    times_per_period: input.timesPerPeriod,
    window_start: input.windowStart ?? null,
    window_end: input.windowEnd ?? null,
    end_date: input.endDate ?? null,
  };
}

export async function createPlan(userId: string, input: PlanInput): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_prayer_plans")
    .insert({ ...planToRow(input), user_id: userId });
  if (error) return { error: "Could not create plan" };
  return { ok: true };
}

export async function updatePlan(id: string, input: PlanInput): Promise<ActionResult> {
  const { error } = await supabase.from("portal_prayer_plans").update(planToRow(input)).eq("id", id);
  if (error) return { error: "Could not update plan" };
  return { ok: true };
}

export async function togglePlan(id: string, isActive: boolean): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_prayer_plans")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: "Could not update plan" };
  return { ok: true };
}

export async function deletePlan(id: string): Promise<ActionResult> {
  const { error } = await supabase.from("portal_prayer_plans").delete().eq("id", id);
  if (error) return { error: "Could not delete plan" };
  return { ok: true };
}

// ------------------------------------------------------------- reminders --

export interface ReminderInput {
  label: string;
  remindTime: string;
  daysOfWeek: number[];
  leadMinutes: number;
  requestId?: string;
}

function reminderToRow(input: ReminderInput) {
  return {
    label: input.label,
    remind_time: input.remindTime,
    days_of_week: [...input.daysOfWeek].sort(),
    lead_minutes: input.leadMinutes,
    request_id: input.requestId ?? null,
  };
}

export async function createReminder(userId: string, input: ReminderInput): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_reminders")
    .insert({ ...reminderToRow(input), user_id: userId });
  if (error) return { error: "Could not create reminder" };
  return { ok: true };
}

export async function updateReminder(id: string, input: ReminderInput): Promise<ActionResult> {
  const { error } = await supabase.from("portal_reminders").update(reminderToRow(input)).eq("id", id);
  if (error) return { error: "Could not update reminder" };
  return { ok: true };
}

export async function toggleReminder(id: string, isActive: boolean): Promise<ActionResult> {
  const { error } = await supabase
    .from("portal_reminders")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: "Could not update reminder" };
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  const { error } = await supabase.from("portal_reminders").delete().eq("id", id);
  if (error) return { error: "Could not delete reminder" };
  return { ok: true };
}

// ------------------------------------------------------------ scriptures --

const MAX_SCRIPTURES_PER_REQUEST = 15;

export interface ScriptureEntry {
  content: string;
  reference?: string;
  source?: "manual" | "ai";
}

export async function addScriptures(
  userId: string,
  requestId: string,
  entries: ScriptureEntry[],
): Promise<ActionResult> {
  const { count } = await supabase
    .from("portal_scriptures")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);

  const existing = count ?? 0;
  if (existing + entries.length > MAX_SCRIPTURES_PER_REQUEST) {
    return {
      error: `A prayer point can hold up to ${MAX_SCRIPTURES_PER_REQUEST} scriptures (you have ${existing})`,
    };
  }

  const rows = entries.map((entry, i) => ({
    user_id: userId,
    request_id: requestId,
    content: entry.content,
    reference: entry.reference || null,
    source: entry.source ?? "manual",
    position: existing + i,
  }));

  const { error } = await supabase.from("portal_scriptures").insert(rows);
  if (error) return { error: "Could not add scripture" };
  return { ok: true };
}

export async function deleteScripture(id: string): Promise<ActionResult> {
  const { error } = await supabase.from("portal_scriptures").delete().eq("id", id);
  if (error) return { error: "Could not remove scripture" };
  return { ok: true };
}
