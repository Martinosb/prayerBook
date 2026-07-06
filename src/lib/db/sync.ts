/**
 * Push/pull sync engine — the local SQLite DB (see local-store.ts) is the
 * only thing every screen reads from; this file is what keeps it eventually
 * consistent with Supabase.
 *
 * Strategy (chosen for this app's scale — a personal prayer log, tens to
 * low hundreds of rows per table, not a multi-device collaborative app):
 * full-snapshot pull rather than incremental-since-cursor. Every sync cycle
 * pulls *all* of the signed-in user's rows per table and reconciles against
 * local state. This is simpler and more bandwidth than an incremental
 * cursor, but it's the only approach that trivially handles remote deletes
 * (the tables have no soft-delete/tombstone column remotely, so an
 * incremental "updated_at > cursor" pull would never learn a row was
 * removed — a full snapshot naturally does, via deleteIdsNotIn).
 *
 * Conflict resolution is last-write-wins by a dirty flag, not by
 * timestamp: a row with local unsynced edits (_dirty = 1) is never
 * overwritten by a pull, no matter how recent the remote version — it wins
 * until the next push clears its dirty flag. This is intentionally simple
 * because each row is single-owner (RLS-scoped to one auth.uid()) and this
 * app doesn't attempt real-time multi-device merge.
 */
import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

import { supabase } from "../supabase/client";
import {
  categoryStore,
  deleteIdsNotIn,
  logStore,
  planStore,
  profileStore,
  reminderStore,
  requestStore,
  scriptureStore,
} from "./local-store";

type Listener = (state: SyncState) => void;
export interface SyncState {
  syncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let state: SyncState = { syncing: false, lastSyncedAt: null, lastError: null };
const listeners = new Set<Listener>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSyncState(): SyncState {
  return state;
}

const jsonDaysOfWeek = (v: string | null): number[] | null => (v ? JSON.parse(v) : null);

// ------------------------------------------------------------------ push --

async function pushProfile(userId: string) {
  for (const p of profileStore.dirtyRows()) {
    if (p.id !== userId) continue;
    const { error } = await supabase
      .from("portal_profiles")
      .update({ timezone: p.timezone, phone: p.phone, sms_opt_in: p.sms_opt_in })
      .eq("id", p.id);
    if (!error) profileStore.clearDirty(p.id);
  }
}

async function pushCategories() {
  for (const row of categoryStore.dirtyRows()) {
    if (row._deleted) {
      const { error } = await supabase.from("portal_categories").delete().eq("id", row.id);
      if (!error) categoryStore.hardDelete(row.id);
      continue;
    }
    const { error } = await supabase.from("portal_categories").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        description: row.description,
        color: row.color,
      },
      { onConflict: "id" },
    );
    if (!error) categoryStore.clearDirty(row.id);
  }
}

async function pushRequests() {
  for (const row of requestStore.dirtyRows()) {
    if (row._deleted) {
      const { error } = await supabase.from("portal_prayer_requests").delete().eq("id", row.id);
      if (!error) requestStore.hardDelete(row.id);
      continue;
    }
    const { error } = await supabase.from("portal_prayer_requests").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        category_id: row.category_id,
        title: row.title,
        details: row.details,
        status: row.status as "active" | "answered" | "archived",
        answered_at: row.answered_at,
        voice_note_path: row.voice_note_path,
      },
      { onConflict: "id" },
    );
    if (!error) requestStore.clearDirty(row.id);
  }
}

async function pushScriptures() {
  for (const row of scriptureStore.dirtyRows()) {
    if (row._deleted) {
      const { error } = await supabase.from("portal_scriptures").delete().eq("id", row.id);
      if (!error) scriptureStore.hardDelete(row.id);
      continue;
    }
    const { error } = await supabase.from("portal_scriptures").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        request_id: row.request_id,
        content: row.content,
        reference: row.reference,
        source: row.source as "manual" | "ai",
        position: row.position,
      },
      { onConflict: "id" },
    );
    if (!error) scriptureStore.clearDirty(row.id);
  }
}

async function pushLogs() {
  for (const row of logStore.dirtyRows()) {
    if (row._deleted) {
      const { error } = await supabase.from("portal_prayer_logs").delete().eq("id", row.id);
      if (!error) logStore.hardDelete(row.id);
      continue;
    }
    const { error } = await supabase.from("portal_prayer_logs").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        request_id: row.request_id,
        prayed_on: row.prayed_on,
        prayed_at: row.prayed_at,
        duration_minutes: row.duration_minutes,
        note: row.note,
        voice_note_path: row.voice_note_path,
      },
      { onConflict: "id" },
    );
    if (!error) logStore.clearDirty(row.id);
  }
}

async function pushPlans() {
  for (const row of planStore.dirtyRows()) {
    if (row._deleted) {
      const { error } = await supabase.from("portal_prayer_plans").delete().eq("id", row.id);
      if (!error) planStore.hardDelete(row.id);
      continue;
    }
    const { error } = await supabase.from("portal_prayer_plans").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        request_id: row.request_id,
        category_id: row.category_id,
        title: row.title,
        frequency: row.frequency as "daily" | "weekly",
        days_of_week: jsonDaysOfWeek(row.days_of_week),
        times_per_period: row.times_per_period,
        window_start: row.window_start,
        window_end: row.window_end,
        start_date: row.start_date,
        end_date: row.end_date,
        is_active: row.is_active === 1,
      },
      { onConflict: "id" },
    );
    if (!error) planStore.clearDirty(row.id);
  }
}

async function pushReminders() {
  for (const row of reminderStore.dirtyRows()) {
    if (row._deleted) {
      const { error } = await supabase.from("portal_reminders").delete().eq("id", row.id);
      if (!error) reminderStore.hardDelete(row.id);
      continue;
    }
    const { error } = await supabase.from("portal_reminders").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        request_id: row.request_id,
        label: row.label,
        remind_time: row.remind_time,
        days_of_week: jsonDaysOfWeek(row.days_of_week) ?? [],
        lead_minutes: row.lead_minutes,
        is_active: row.is_active === 1,
      },
      { onConflict: "id" },
    );
    if (!error) reminderStore.clearDirty(row.id);
  }
}

// ------------------------------------------------------------------ pull --

async function pullCategories(userId: string) {
  const { data } = await supabase.from("portal_categories").select("*").eq("user_id", userId);
  for (const row of data ?? []) categoryStore.upsertFromRemote(row);
  deleteIdsNotIn("portal_categories", userId, (data ?? []).map((r) => r.id));
}

async function pullRequests(userId: string) {
  const { data } = await supabase.from("portal_prayer_requests").select("*").eq("user_id", userId);
  for (const row of data ?? []) requestStore.upsertFromRemote(row);
  deleteIdsNotIn("portal_prayer_requests", userId, (data ?? []).map((r) => r.id));
}

async function pullScriptures(userId: string) {
  const { data } = await supabase.from("portal_scriptures").select("*").eq("user_id", userId);
  for (const row of data ?? []) scriptureStore.upsertFromRemote(row);
  deleteIdsNotIn("portal_scriptures", userId, (data ?? []).map((r) => r.id));
}

async function pullLogs(userId: string) {
  const { data } = await supabase.from("portal_prayer_logs").select("*").eq("user_id", userId);
  for (const row of data ?? []) logStore.upsertFromRemote(row);
  deleteIdsNotIn("portal_prayer_logs", userId, (data ?? []).map((r) => r.id));
}

async function pullPlans(userId: string) {
  const { data } = await supabase.from("portal_prayer_plans").select("*").eq("user_id", userId);
  for (const row of data ?? []) planStore.upsertFromRemote(row);
  deleteIdsNotIn("portal_prayer_plans", userId, (data ?? []).map((r) => r.id));
}

async function pullReminders(userId: string) {
  const { data } = await supabase.from("portal_reminders").select("*").eq("user_id", userId);
  for (const row of data ?? []) reminderStore.upsertFromRemote(row);
  deleteIdsNotIn("portal_reminders", userId, (data ?? []).map((r) => r.id));
}

async function pullProfile(userId: string) {
  const { data } = await supabase.from("portal_profiles").select("*").eq("id", userId).maybeSingle();
  if (data) {
    const isDirty = profileStore.dirtyRows().some((r) => r.id === userId);
    profileStore.upsertFromRemote({ ...data, _dirtyLocally: isDirty });
  }
}

// -------------------------------------------------------------- runSync --

let inFlight: Promise<void> | null = null;

export async function runSync(userId: string): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    setState({ syncing: true, lastError: null });
    try {
      // Push in FK-dependency order (categories before requests, etc).
      await pushProfile(userId);
      await pushCategories();
      await pushRequests();
      await Promise.all([pushScriptures(), pushLogs(), pushPlans(), pushReminders()]);

      // Pull full snapshots — order doesn't matter here since we're only
      // reading, but keep it parallel for speed.
      await Promise.all([
        pullProfile(userId),
        pullCategories(userId),
        pullRequests(userId),
        pullScriptures(userId),
        pullLogs(userId),
        pullPlans(userId),
        pullReminders(userId),
      ]);

      setState({ syncing: false, lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      setState({ syncing: false, lastError: error instanceof Error ? error.message : "Sync failed" });
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

let triggersRegistered = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Call once after login. Wires foreground/reconnect/periodic sync triggers and runs an initial sync. */
export function registerSyncTriggers(userId: string): () => void {
  if (triggersRegistered) return () => {};
  triggersRegistered = true;

  const trigger = () => void runSync(userId);

  const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next === "active") trigger();
  });
  const netInfoUnsub = NetInfo.addEventListener((s) => {
    if (s.isConnected) trigger();
  });
  intervalHandle = setInterval(trigger, 5 * 60 * 1000);

  trigger(); // initial sync right after login

  return () => {
    appStateSub.remove();
    netInfoUnsub();
    if (intervalHandle) clearInterval(intervalHandle);
    triggersRegistered = false;
  };
}
