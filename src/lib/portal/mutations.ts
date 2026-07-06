import {
  categoryStore,
  logStore,
  planStore,
  profileStore,
  reminderStore,
  requestStore,
  scriptureStore,
} from "../db/local-store";
import { runSync } from "../db/sync";
import { supabase } from "../supabase/client";
import { normalizeGhanaPhone, usernameSchema } from "./validation";

export type ActionResult = { error: string } | { ok: true };

/** Fire-and-forget: push this device's change immediately if online, silently no-op if not. */
function syncSoon(userId: string) {
  void runSync(userId);
}

// ---------------------------------------------------------------- profile --
// Account creation and username uniqueness inherently require the network —
// unlike everything else in this file, these two still talk to Supabase
// directly rather than going through the local-first path.

export async function createProfile(
  userId: string,
  email: string,
  username: string,
): Promise<ActionResult> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid username" };
  }

  const { error } = await supabase
    .from("portal_profiles")
    .insert({ id: userId, username: parsed.data, email });

  if (error) {
    if (error.code === "23505") return { error: "That username is already taken" };
    return { error: "Could not create your profile" };
  }
  syncSoon(userId);
  return { ok: true };
}

export async function checkUsernameAvailable(username: string): Promise<boolean | null> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return null;
  const { data } = await supabase
    .from("portal_profiles")
    .select("id")
    .ilike("username", parsed.data)
    .maybeSingle();
  return !data;
}

export function updateProfile(
  userId: string,
  input: { timezone: string; phone?: string; smsOptIn: boolean },
): ActionResult {
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
  profileStore.update(userId, { timezone: input.timezone, phone, smsOptIn: input.smsOptIn });
  syncSoon(userId);
  return { ok: true };
}

// ------------------------------------------------------------ categories --

export interface CategoryInput {
  name: string;
  description?: string;
  color?: string;
}

// Local unique index (schema.ts) throws synchronously on a duplicate name —
// catching it here means the user sees the same friendly message the web
// app's server action produces, instantly, instead of the write silently
// failing forever during a later background push.
function isDuplicateNameError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export function createCategory(userId: string, input: CategoryInput): ActionResult {
  try {
    categoryStore.create(userId, input);
  } catch (err) {
    if (isDuplicateNameError(err)) return { error: "You already have a category with that name" };
    throw err;
  }
  syncSoon(userId);
  return { ok: true };
}

export function updateCategory(userId: string, id: string, input: CategoryInput): ActionResult {
  try {
    categoryStore.update(id, input);
  } catch (err) {
    if (isDuplicateNameError(err)) return { error: "You already have a category with that name" };
    throw err;
  }
  syncSoon(userId);
  return { ok: true };
}

export function deleteCategory(userId: string, id: string): ActionResult {
  categoryStore.softDelete(id);
  syncSoon(userId);
  return { ok: true };
}

// -------------------------------------------------------------- requests --

export interface RequestInput {
  categoryId: string;
  title: string;
  details?: string;
  voiceNotePath?: string;
}

export function createRequest(userId: string, input: RequestInput): ActionResult & { id?: string } {
  const request = requestStore.create(userId, input);
  syncSoon(userId);
  return { ok: true, id: request.id };
}

export function updateRequest(
  userId: string,
  id: string,
  input: { categoryId: string; title: string; details?: string },
): ActionResult {
  requestStore.update(id, input);
  syncSoon(userId);
  return { ok: true };
}

export function setRequestStatus(
  userId: string,
  id: string,
  status: "active" | "answered" | "archived",
): ActionResult {
  requestStore.setStatus(id, status);
  syncSoon(userId);
  return { ok: true };
}

export function deleteRequest(userId: string, id: string): ActionResult {
  requestStore.softDelete(id);
  syncSoon(userId);
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

/** Always stamps time at call — "so an offline log syncs with the moment it actually happened." */
export function logPrayer(userId: string, input: LogInput): ActionResult {
  const now = new Date();
  const prayedOn = input.prayedOn ?? now.toISOString().slice(0, 10);
  const prayedAt = input.prayedAt ?? now.toTimeString().slice(0, 5);
  logStore.create(userId, { ...input, prayedOn, prayedAt });
  syncSoon(userId);
  return { ok: true };
}

export function deleteLog(userId: string, id: string): ActionResult {
  logStore.softDelete(id);
  syncSoon(userId);
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

export function createPlan(userId: string, input: PlanInput): ActionResult {
  planStore.create(userId, input);
  syncSoon(userId);
  return { ok: true };
}

export function updatePlan(userId: string, id: string, input: PlanInput): ActionResult {
  planStore.update(id, input);
  syncSoon(userId);
  return { ok: true };
}

export function togglePlan(userId: string, id: string, isActive: boolean): ActionResult {
  planStore.toggle(id, isActive);
  syncSoon(userId);
  return { ok: true };
}

export function deletePlan(userId: string, id: string): ActionResult {
  planStore.softDelete(id);
  syncSoon(userId);
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

export function createReminder(userId: string, input: ReminderInput): ActionResult {
  reminderStore.create(userId, input);
  syncSoon(userId);
  return { ok: true };
}

export function updateReminder(userId: string, id: string, input: ReminderInput): ActionResult {
  reminderStore.update(id, input);
  syncSoon(userId);
  return { ok: true };
}

export function toggleReminder(userId: string, id: string, isActive: boolean): ActionResult {
  reminderStore.toggle(id, isActive);
  syncSoon(userId);
  return { ok: true };
}

export function deleteReminder(userId: string, id: string): ActionResult {
  reminderStore.softDelete(id);
  syncSoon(userId);
  return { ok: true };
}

// ------------------------------------------------------------ scriptures --

const MAX_SCRIPTURES_PER_REQUEST = 15;

export interface ScriptureEntry {
  content: string;
  reference?: string;
  source?: "manual" | "ai";
}

export function addScriptures(userId: string, requestId: string, entries: ScriptureEntry[]): ActionResult {
  const existing = scriptureStore.count(requestId);
  if (existing + entries.length > MAX_SCRIPTURES_PER_REQUEST) {
    return {
      error: `A prayer point can hold up to ${MAX_SCRIPTURES_PER_REQUEST} scriptures (you have ${existing})`,
    };
  }
  scriptureStore.createMany(userId, requestId, entries);
  syncSoon(userId);
  return { ok: true };
}

export function deleteScripture(userId: string, id: string): ActionResult {
  scriptureStore.softDelete(id);
  syncSoon(userId);
  return { ok: true };
}
