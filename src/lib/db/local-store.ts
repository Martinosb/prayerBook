import { getDb, nowIso } from "./client";
import type {
  Category,
  PlanFrequency,
  PrayerLog,
  PrayerPlan,
  PrayerRequest,
  Profile,
  Reminder,
  RequestStatus,
  Scripture,
} from "../portal/types";

const b2i = (v: boolean) => (v ? 1 : 0);
const i2b = (v: number) => v === 1;
const arr2json = (v: number[] | null | undefined) => JSON.stringify(v ?? []);
const json2arr = (v: string | null): number[] => (v ? JSON.parse(v) : []);

// ---------------------------------------------------------------- rows ----

interface ProfileRow {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  sms_opt_in: number;
  timezone: string;
  last_ai_request_at: string | null;
  created_at: string;
  updated_at: string;
  _dirty: number;
  _deleted: number;
}
interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  _dirty: number;
  _deleted: number;
}
interface RequestRow {
  id: string;
  user_id: string;
  category_id: string;
  title: string;
  details: string | null;
  status: string;
  answered_at: string | null;
  voice_note_path: string | null;
  created_at: string;
  updated_at: string;
  _dirty: number;
  _deleted: number;
}
interface ScriptureRow {
  id: string;
  user_id: string;
  request_id: string;
  content: string;
  reference: string | null;
  source: string;
  position: number;
  created_at: string;
  _dirty: number;
  _deleted: number;
}
interface LogRow {
  id: string;
  user_id: string;
  request_id: string;
  prayed_on: string;
  prayed_at: string | null;
  duration_minutes: number | null;
  note: string | null;
  voice_note_path: string | null;
  created_at: string;
  _dirty: number;
  _deleted: number;
}
interface PlanRow {
  id: string;
  user_id: string;
  request_id: string | null;
  category_id: string | null;
  title: string;
  frequency: string;
  days_of_week: string | null;
  times_per_period: number;
  window_start: string | null;
  window_end: string | null;
  start_date: string;
  end_date: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  _dirty: number;
  _deleted: number;
}
interface ReminderRow {
  id: string;
  user_id: string;
  request_id: string | null;
  label: string;
  remind_time: string;
  days_of_week: string;
  lead_minutes: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  _dirty: number;
  _deleted: number;
}

function profileFromRow(r: ProfileRow): Profile {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    phone: r.phone,
    sms_opt_in: i2b(r.sms_opt_in),
    timezone: r.timezone,
    last_ai_request_at: r.last_ai_request_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function categoryFromRow(r: CategoryRow): Category {
  return {
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    description: r.description,
    color: r.color,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function requestFromRow(r: RequestRow): PrayerRequest {
  return {
    id: r.id,
    user_id: r.user_id,
    category_id: r.category_id,
    title: r.title,
    details: r.details,
    status: r.status as RequestStatus,
    answered_at: r.answered_at,
    voice_note_path: r.voice_note_path,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function scriptureFromRow(r: ScriptureRow): Scripture {
  return {
    id: r.id,
    user_id: r.user_id,
    request_id: r.request_id,
    content: r.content,
    reference: r.reference,
    source: r.source as "manual" | "ai",
    position: r.position,
    created_at: r.created_at,
  };
}
function logFromRow(r: LogRow): PrayerLog {
  return {
    id: r.id,
    user_id: r.user_id,
    request_id: r.request_id,
    prayed_on: r.prayed_on,
    prayed_at: r.prayed_at,
    duration_minutes: r.duration_minutes,
    note: r.note,
    voice_note_path: r.voice_note_path,
    created_at: r.created_at,
  };
}
function planFromRow(r: PlanRow): PrayerPlan {
  return {
    id: r.id,
    user_id: r.user_id,
    request_id: r.request_id,
    category_id: r.category_id,
    title: r.title,
    frequency: r.frequency as PlanFrequency,
    days_of_week: r.days_of_week ? json2arr(r.days_of_week) : null,
    times_per_period: r.times_per_period,
    window_start: r.window_start,
    window_end: r.window_end,
    start_date: r.start_date,
    end_date: r.end_date,
    is_active: i2b(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function reminderFromRow(r: ReminderRow): Reminder {
  return {
    id: r.id,
    user_id: r.user_id,
    request_id: r.request_id,
    label: r.label,
    remind_time: r.remind_time,
    days_of_week: json2arr(r.days_of_week),
    lead_minutes: r.lead_minutes,
    is_active: i2b(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// -------------------------------------------------------------- profile ---

export const profileStore = {
  get(userId: string): Profile | null {
    const row = getDb().getFirstSync<ProfileRow>(
      "SELECT * FROM portal_profiles WHERE id = ? AND _deleted = 0",
      userId,
    );
    return row ? profileFromRow(row) : null;
  },
  upsertLocal(userId: string, email: string, username: string): Profile {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `INSERT INTO portal_profiles (id, username, email, phone, sms_opt_in, timezone, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, NULL, 0, 'Africa/Accra', ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, email = excluded.email, _dirty = 1, updated_at = excluded.updated_at`,
      userId,
      username,
      email,
      now,
      now,
    );
    return profileStore.get(userId)!;
  },
  update(userId: string, patch: { timezone: string; phone: string | null; smsOptIn: boolean }): Profile {
    const db = getDb();
    db.runSync(
      `UPDATE portal_profiles SET timezone = ?, phone = ?, sms_opt_in = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
      patch.timezone,
      patch.phone,
      b2i(patch.smsOptIn),
      nowIso(),
      userId,
    );
    return profileStore.get(userId)!;
  },
  upsertFromRemote(row: Profile & { _dirtyLocally: boolean }) {
    if (row._dirtyLocally) return; // local edit hasn't been pushed yet — don't clobber it
    getDb().runSync(
      `INSERT INTO portal_profiles (id, username, email, phone, sms_opt_in, timezone, last_ai_request_at, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET username=excluded.username, email=excluded.email, phone=excluded.phone,
         sms_opt_in=excluded.sms_opt_in, timezone=excluded.timezone, last_ai_request_at=excluded.last_ai_request_at,
         updated_at=excluded.updated_at, _dirty=0`,
      row.id,
      row.username,
      row.email,
      row.phone,
      b2i(row.sms_opt_in),
      row.timezone,
      row.last_ai_request_at,
      row.created_at,
      row.updated_at,
    );
  },
  dirtyRows(): (Profile & { _dirty: number })[] {
    return getDb()
      .getAllSync<ProfileRow>("SELECT * FROM portal_profiles WHERE _dirty = 1")
      .map((r) => ({ ...profileFromRow(r), _dirty: r._dirty }));
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_profiles SET _dirty = 0 WHERE id = ?", id);
  },
};

// ------------------------------------------------------------ categories --

export const categoryStore = {
  listForUser(userId: string): Category[] {
    return getDb()
      .getAllSync<CategoryRow>(
        "SELECT * FROM portal_categories WHERE user_id = ? AND _deleted = 0 ORDER BY created_at ASC",
        userId,
      )
      .map(categoryFromRow);
  },
  getById(id: string): Category | null {
    const row = getDb().getFirstSync<CategoryRow>(
      "SELECT * FROM portal_categories WHERE id = ? AND _deleted = 0",
      id,
    );
    return row ? categoryFromRow(row) : null;
  },
  requestCount(categoryId: string): number {
    const row = getDb().getFirstSync<{ n: number }>(
      "SELECT COUNT(*) as n FROM portal_prayer_requests WHERE category_id = ? AND _deleted = 0",
      categoryId,
    );
    return row?.n ?? 0;
  },
  create(userId: string, input: { name: string; description?: string; color?: string }): Category {
    const id = crypto.randomUUID();
    const now = nowIso();
    getDb().runSync(
      `INSERT INTO portal_categories (id, user_id, name, description, color, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      id,
      userId,
      input.name,
      input.description ?? null,
      input.color ?? null,
      now,
      now,
    );
    return categoryStore.getById(id)!;
  },
  update(id: string, input: { name: string; description?: string; color?: string }): Category {
    getDb().runSync(
      `UPDATE portal_categories SET name = ?, description = ?, color = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
      input.name,
      input.description ?? null,
      input.color ?? null,
      nowIso(),
      id,
    );
    return categoryStore.getById(id)!;
  },
  softDelete(id: string) {
    getDb().runSync("UPDATE portal_categories SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", nowIso(), id);
    // Cascade locally to match the remote FK cascade (requests -> scriptures/logs, plans).
    const requests = getDb().getAllSync<{ id: string }>(
      "SELECT id FROM portal_prayer_requests WHERE category_id = ? AND _deleted = 0",
      id,
    );
    for (const r of requests) requestStore.softDelete(r.id);
    getDb().runSync(
      "UPDATE portal_prayer_plans SET _deleted = 1, _dirty = 1, updated_at = ? WHERE category_id = ? AND _deleted = 0",
      nowIso(),
      id,
    );
  },
  dirtyRows() {
    return getDb().getAllSync<CategoryRow>("SELECT * FROM portal_categories WHERE _dirty = 1");
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_categories SET _dirty = 0 WHERE id = ?", id);
  },
  hardDelete(id: string) {
    getDb().runSync("DELETE FROM portal_categories WHERE id = ?", id);
  },
  upsertFromRemote(row: Category) {
    getDb().runSync(
      `INSERT INTO portal_categories (id, user_id, name, description, color, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, color=excluded.color,
         updated_at=excluded.updated_at, _dirty=0
       WHERE (SELECT _dirty FROM portal_categories WHERE id = excluded.id) = 0`,
      row.id,
      row.user_id,
      row.name,
      row.description,
      row.color,
      row.created_at,
      row.updated_at,
    );
  },
  allIdsForUser(userId: string): string[] {
    return getDb()
      .getAllSync<{ id: string }>("SELECT id FROM portal_categories WHERE user_id = ?", userId)
      .map((r) => r.id);
  },
};

// -------------------------------------------------------------- requests --

export const requestStore = {
  listForUser(userId: string): PrayerRequest[] {
    return getDb()
      .getAllSync<RequestRow>(
        "SELECT * FROM portal_prayer_requests WHERE user_id = ? AND _deleted = 0 ORDER BY created_at DESC",
        userId,
      )
      .map(requestFromRow);
  },
  listActiveForUser(userId: string): PrayerRequest[] {
    return getDb()
      .getAllSync<RequestRow>(
        "SELECT * FROM portal_prayer_requests WHERE user_id = ? AND status = 'active' AND _deleted = 0 ORDER BY created_at DESC",
        userId,
      )
      .map(requestFromRow);
  },
  getById(id: string): PrayerRequest | null {
    const row = getDb().getFirstSync<RequestRow>(
      "SELECT * FROM portal_prayer_requests WHERE id = ? AND _deleted = 0",
      id,
    );
    return row ? requestFromRow(row) : null;
  },
  create(userId: string, input: { categoryId: string; title: string; details?: string; voiceNotePath?: string }): PrayerRequest {
    const id = crypto.randomUUID();
    const now = nowIso();
    getDb().runSync(
      `INSERT INTO portal_prayer_requests (id, user_id, category_id, title, details, status, voice_note_path, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, 1)`,
      id,
      userId,
      input.categoryId,
      input.title,
      input.details ?? null,
      input.voiceNotePath ?? null,
      now,
      now,
    );
    return requestStore.getById(id)!;
  },
  update(id: string, input: { categoryId: string; title: string; details?: string }): PrayerRequest {
    getDb().runSync(
      `UPDATE portal_prayer_requests SET category_id = ?, title = ?, details = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
      input.categoryId,
      input.title,
      input.details ?? null,
      nowIso(),
      id,
    );
    return requestStore.getById(id)!;
  },
  setStatus(id: string, status: RequestStatus): PrayerRequest {
    getDb().runSync(
      `UPDATE portal_prayer_requests SET status = ?, answered_at = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
      status,
      status === "answered" ? nowIso() : null,
      nowIso(),
      id,
    );
    return requestStore.getById(id)!;
  },
  softDelete(id: string) {
    getDb().runSync("UPDATE portal_prayer_requests SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", nowIso(), id);
    getDb().runSync("UPDATE portal_scriptures SET _deleted = 1, _dirty = 1 WHERE request_id = ? AND _deleted = 0", id);
    getDb().runSync("UPDATE portal_prayer_logs SET _deleted = 1, _dirty = 1 WHERE request_id = ? AND _deleted = 0", id);
    getDb().runSync(
      "UPDATE portal_prayer_plans SET _deleted = 1, _dirty = 1, updated_at = ? WHERE request_id = ? AND _deleted = 0",
      nowIso(),
      id,
    );
    getDb().runSync(
      "UPDATE portal_reminders SET _deleted = 1, _dirty = 1, updated_at = ? WHERE request_id = ? AND _deleted = 0",
      nowIso(),
      id,
    );
  },
  dirtyRows() {
    return getDb().getAllSync<RequestRow>("SELECT * FROM portal_prayer_requests WHERE _dirty = 1");
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_prayer_requests SET _dirty = 0 WHERE id = ?", id);
  },
  hardDelete(id: string) {
    getDb().runSync("DELETE FROM portal_prayer_requests WHERE id = ?", id);
  },
  upsertFromRemote(row: PrayerRequest) {
    getDb().runSync(
      `INSERT INTO portal_prayer_requests (id, user_id, category_id, title, details, status, answered_at, voice_note_path, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, title=excluded.title, details=excluded.details,
         status=excluded.status, answered_at=excluded.answered_at, voice_note_path=excluded.voice_note_path,
         updated_at=excluded.updated_at, _dirty=0
       WHERE (SELECT _dirty FROM portal_prayer_requests WHERE id = excluded.id) = 0`,
      row.id,
      row.user_id,
      row.category_id,
      row.title,
      row.details,
      row.status,
      row.answered_at,
      row.voice_note_path,
      row.created_at,
      row.updated_at,
    );
  },
  allIdsForUser(userId: string): string[] {
    return getDb()
      .getAllSync<{ id: string }>("SELECT id FROM portal_prayer_requests WHERE user_id = ?", userId)
      .map((r) => r.id);
  },
  categoryIdOf(requestId: string): string | null {
    const row = getDb().getFirstSync<{ category_id: string }>(
      "SELECT category_id FROM portal_prayer_requests WHERE id = ?",
      requestId,
    );
    return row?.category_id ?? null;
  },
};

// ------------------------------------------------------------ scriptures --

export const scriptureStore = {
  listForRequest(requestId: string): Scripture[] {
    return getDb()
      .getAllSync<ScriptureRow>(
        "SELECT * FROM portal_scriptures WHERE request_id = ? AND _deleted = 0 ORDER BY position ASC, created_at ASC",
        requestId,
      )
      .map(scriptureFromRow);
  },
  count(requestId: string): number {
    const row = getDb().getFirstSync<{ n: number }>(
      "SELECT COUNT(*) as n FROM portal_scriptures WHERE request_id = ? AND _deleted = 0",
      requestId,
    );
    return row?.n ?? 0;
  },
  createMany(
    userId: string,
    requestId: string,
    entries: { content: string; reference?: string; source?: "manual" | "ai" }[],
  ): Scripture[] {
    const db = getDb();
    const existing = scriptureStore.count(requestId);
    const now = nowIso();
    const ids: string[] = [];
    db.withTransactionSync(() => {
      entries.forEach((entry, i) => {
        const id = crypto.randomUUID();
        ids.push(id);
        db.runSync(
          `INSERT INTO portal_scriptures (id, user_id, request_id, content, reference, source, position, created_at, _dirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          id,
          userId,
          requestId,
          entry.content,
          entry.reference ?? null,
          entry.source ?? "manual",
          existing + i,
          now,
        );
      });
    });
    return ids.map((id) => scriptureFromRow(db.getFirstSync<ScriptureRow>("SELECT * FROM portal_scriptures WHERE id = ?", id)!));
  },
  softDelete(id: string) {
    getDb().runSync("UPDATE portal_scriptures SET _deleted = 1, _dirty = 1 WHERE id = ?", id);
  },
  dirtyRows() {
    return getDb().getAllSync<ScriptureRow>("SELECT * FROM portal_scriptures WHERE _dirty = 1");
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_scriptures SET _dirty = 0 WHERE id = ?", id);
  },
  hardDelete(id: string) {
    getDb().runSync("DELETE FROM portal_scriptures WHERE id = ?", id);
  },
  upsertFromRemote(row: Scripture) {
    getDb().runSync(
      `INSERT INTO portal_scriptures (id, user_id, request_id, content, reference, source, position, created_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET content=excluded.content, reference=excluded.reference, source=excluded.source,
         position=excluded.position, _dirty=0
       WHERE (SELECT _dirty FROM portal_scriptures WHERE id = excluded.id) = 0`,
      row.id,
      row.user_id,
      row.request_id,
      row.content,
      row.reference,
      row.source,
      row.position,
      row.created_at,
    );
  },
  allIdsForUser(userId: string): string[] {
    return getDb()
      .getAllSync<{ id: string }>("SELECT id FROM portal_scriptures WHERE user_id = ?", userId)
      .map((r) => r.id);
  },
};

// ------------------------------------------------------------------ logs --

export const logStore = {
  listForRequest(requestId: string): PrayerLog[] {
    return getDb()
      .getAllSync<LogRow>(
        "SELECT * FROM portal_prayer_logs WHERE request_id = ? AND _deleted = 0 ORDER BY prayed_on DESC, created_at DESC",
        requestId,
      )
      .map(logFromRow);
  },
  listForUser(userId: string): PrayerLog[] {
    return getDb()
      .getAllSync<LogRow>("SELECT * FROM portal_prayer_logs WHERE user_id = ? AND _deleted = 0", userId)
      .map(logFromRow);
  },
  listSince(userId: string, cutoffDate: string): PrayerLog[] {
    return getDb()
      .getAllSync<LogRow>(
        "SELECT * FROM portal_prayer_logs WHERE user_id = ? AND prayed_on >= ? AND _deleted = 0",
        userId,
        cutoffDate,
      )
      .map(logFromRow);
  },
  create(
    userId: string,
    input: {
      requestId: string;
      prayedOn: string;
      prayedAt?: string;
      durationMinutes?: number;
      note?: string;
      voiceNotePath?: string;
    },
  ): PrayerLog {
    const id = crypto.randomUUID();
    const now = nowIso();
    getDb().runSync(
      `INSERT INTO portal_prayer_logs (id, user_id, request_id, prayed_on, prayed_at, duration_minutes, note, voice_note_path, created_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      id,
      userId,
      input.requestId,
      input.prayedOn,
      input.prayedAt ?? null,
      input.durationMinutes ?? null,
      input.note ?? null,
      input.voiceNotePath ?? null,
      now,
    );
    return logFromRow(getDb().getFirstSync<LogRow>("SELECT * FROM portal_prayer_logs WHERE id = ?", id)!);
  },
  softDelete(id: string) {
    getDb().runSync("UPDATE portal_prayer_logs SET _deleted = 1, _dirty = 1 WHERE id = ?", id);
  },
  dirtyRows() {
    return getDb().getAllSync<LogRow>("SELECT * FROM portal_prayer_logs WHERE _dirty = 1");
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_prayer_logs SET _dirty = 0 WHERE id = ?", id);
  },
  hardDelete(id: string) {
    getDb().runSync("DELETE FROM portal_prayer_logs WHERE id = ?", id);
  },
  upsertFromRemote(row: PrayerLog) {
    getDb().runSync(
      `INSERT INTO portal_prayer_logs (id, user_id, request_id, prayed_on, prayed_at, duration_minutes, note, voice_note_path, created_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET prayed_on=excluded.prayed_on, prayed_at=excluded.prayed_at,
         duration_minutes=excluded.duration_minutes, note=excluded.note, voice_note_path=excluded.voice_note_path, _dirty=0
       WHERE (SELECT _dirty FROM portal_prayer_logs WHERE id = excluded.id) = 0`,
      row.id,
      row.user_id,
      row.request_id,
      row.prayed_on,
      row.prayed_at,
      row.duration_minutes,
      row.note,
      row.voice_note_path,
      row.created_at,
    );
  },
  allIdsForUser(userId: string): string[] {
    return getDb()
      .getAllSync<{ id: string }>("SELECT id FROM portal_prayer_logs WHERE user_id = ?", userId)
      .map((r) => r.id);
  },
};

// ----------------------------------------------------------------- plans --

export const planStore = {
  listForUser(userId: string): PrayerPlan[] {
    return getDb()
      .getAllSync<PlanRow>(
        "SELECT * FROM portal_prayer_plans WHERE user_id = ? AND _deleted = 0 ORDER BY created_at ASC",
        userId,
      )
      .map(planFromRow);
  },
  getById(id: string): PrayerPlan | null {
    const row = getDb().getFirstSync<PlanRow>("SELECT * FROM portal_prayer_plans WHERE id = ? AND _deleted = 0", id);
    return row ? planFromRow(row) : null;
  },
  create(
    userId: string,
    input: {
      title: string;
      requestId?: string;
      categoryId?: string;
      frequency: PlanFrequency;
      daysOfWeek?: number[];
      timesPerPeriod: number;
      windowStart?: string;
      windowEnd?: string;
      endDate?: string;
    },
  ): PrayerPlan {
    const id = crypto.randomUUID();
    const now = nowIso();
    const days = input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7 ? input.daysOfWeek : null;
    getDb().runSync(
      `INSERT INTO portal_prayer_plans (id, user_id, request_id, category_id, title, frequency, days_of_week, times_per_period, window_start, window_end, start_date, end_date, is_active, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      id,
      userId,
      input.requestId ?? null,
      input.categoryId ?? null,
      input.title,
      input.frequency,
      days ? arr2json(days) : null,
      input.timesPerPeriod,
      input.windowStart ?? null,
      input.windowEnd ?? null,
      now.slice(0, 10),
      input.endDate ?? null,
      now,
      now,
    );
    return planStore.getById(id)!;
  },
  update(
    id: string,
    input: {
      title: string;
      requestId?: string;
      categoryId?: string;
      frequency: PlanFrequency;
      daysOfWeek?: number[];
      timesPerPeriod: number;
      windowStart?: string;
      windowEnd?: string;
      endDate?: string;
    },
  ): PrayerPlan {
    const days = input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7 ? input.daysOfWeek : null;
    getDb().runSync(
      `UPDATE portal_prayer_plans SET request_id = ?, category_id = ?, title = ?, frequency = ?, days_of_week = ?,
         times_per_period = ?, window_start = ?, window_end = ?, end_date = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
      input.requestId ?? null,
      input.categoryId ?? null,
      input.title,
      input.frequency,
      days ? arr2json(days) : null,
      input.timesPerPeriod,
      input.windowStart ?? null,
      input.windowEnd ?? null,
      input.endDate ?? null,
      nowIso(),
      id,
    );
    return planStore.getById(id)!;
  },
  toggle(id: string, isActive: boolean): PrayerPlan {
    getDb().runSync(
      "UPDATE portal_prayer_plans SET is_active = ?, updated_at = ?, _dirty = 1 WHERE id = ?",
      b2i(isActive),
      nowIso(),
      id,
    );
    return planStore.getById(id)!;
  },
  softDelete(id: string) {
    getDb().runSync("UPDATE portal_prayer_plans SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", nowIso(), id);
  },
  dirtyRows() {
    return getDb().getAllSync<PlanRow>("SELECT * FROM portal_prayer_plans WHERE _dirty = 1");
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_prayer_plans SET _dirty = 0 WHERE id = ?", id);
  },
  hardDelete(id: string) {
    getDb().runSync("DELETE FROM portal_prayer_plans WHERE id = ?", id);
  },
  upsertFromRemote(row: PrayerPlan) {
    getDb().runSync(
      `INSERT INTO portal_prayer_plans (id, user_id, request_id, category_id, title, frequency, days_of_week, times_per_period, window_start, window_end, start_date, end_date, is_active, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id, category_id=excluded.category_id, title=excluded.title,
         frequency=excluded.frequency, days_of_week=excluded.days_of_week, times_per_period=excluded.times_per_period,
         window_start=excluded.window_start, window_end=excluded.window_end, end_date=excluded.end_date,
         is_active=excluded.is_active, updated_at=excluded.updated_at, _dirty=0
       WHERE (SELECT _dirty FROM portal_prayer_plans WHERE id = excluded.id) = 0`,
      row.id,
      row.user_id,
      row.request_id,
      row.category_id,
      row.title,
      row.frequency,
      row.days_of_week ? arr2json(row.days_of_week) : null,
      row.times_per_period,
      row.window_start,
      row.window_end,
      row.start_date,
      row.end_date,
      b2i(row.is_active),
      row.created_at,
      row.updated_at,
    );
  },
  allIdsForUser(userId: string): string[] {
    return getDb()
      .getAllSync<{ id: string }>("SELECT id FROM portal_prayer_plans WHERE user_id = ?", userId)
      .map((r) => r.id);
  },
};

// ------------------------------------------------------------- reminders --

export const reminderStore = {
  listForUser(userId: string): Reminder[] {
    return getDb()
      .getAllSync<ReminderRow>(
        "SELECT * FROM portal_reminders WHERE user_id = ? AND _deleted = 0 ORDER BY remind_time ASC",
        userId,
      )
      .map(reminderFromRow);
  },
  getById(id: string): Reminder | null {
    const row = getDb().getFirstSync<ReminderRow>("SELECT * FROM portal_reminders WHERE id = ? AND _deleted = 0", id);
    return row ? reminderFromRow(row) : null;
  },
  create(
    userId: string,
    input: { label: string; remindTime: string; daysOfWeek: number[]; leadMinutes: number; requestId?: string },
  ): Reminder {
    const id = crypto.randomUUID();
    const now = nowIso();
    getDb().runSync(
      `INSERT INTO portal_reminders (id, user_id, request_id, label, remind_time, days_of_week, lead_minutes, is_active, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      id,
      userId,
      input.requestId ?? null,
      input.label,
      input.remindTime,
      arr2json([...input.daysOfWeek].sort()),
      input.leadMinutes,
      now,
      now,
    );
    return reminderStore.getById(id)!;
  },
  update(
    id: string,
    input: { label: string; remindTime: string; daysOfWeek: number[]; leadMinutes: number; requestId?: string },
  ): Reminder {
    getDb().runSync(
      `UPDATE portal_reminders SET request_id = ?, label = ?, remind_time = ?, days_of_week = ?, lead_minutes = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
      input.requestId ?? null,
      input.label,
      input.remindTime,
      arr2json([...input.daysOfWeek].sort()),
      input.leadMinutes,
      nowIso(),
      id,
    );
    return reminderStore.getById(id)!;
  },
  toggle(id: string, isActive: boolean): Reminder {
    getDb().runSync(
      "UPDATE portal_reminders SET is_active = ?, updated_at = ?, _dirty = 1 WHERE id = ?",
      b2i(isActive),
      nowIso(),
      id,
    );
    return reminderStore.getById(id)!;
  },
  softDelete(id: string) {
    getDb().runSync("UPDATE portal_reminders SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", nowIso(), id);
  },
  dirtyRows() {
    return getDb().getAllSync<ReminderRow>("SELECT * FROM portal_reminders WHERE _dirty = 1");
  },
  clearDirty(id: string) {
    getDb().runSync("UPDATE portal_reminders SET _dirty = 0 WHERE id = ?", id);
  },
  hardDelete(id: string) {
    getDb().runSync("DELETE FROM portal_reminders WHERE id = ?", id);
  },
  upsertFromRemote(row: Reminder) {
    getDb().runSync(
      `INSERT INTO portal_reminders (id, user_id, request_id, label, remind_time, days_of_week, lead_minutes, is_active, created_at, updated_at, _dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id, label=excluded.label, remind_time=excluded.remind_time,
         days_of_week=excluded.days_of_week, lead_minutes=excluded.lead_minutes, is_active=excluded.is_active,
         updated_at=excluded.updated_at, _dirty=0
       WHERE (SELECT _dirty FROM portal_reminders WHERE id = excluded.id) = 0`,
      row.id,
      row.user_id,
      row.request_id,
      row.label,
      row.remind_time,
      arr2json(row.days_of_week),
      row.lead_minutes,
      b2i(row.is_active),
      row.created_at,
      row.updated_at,
    );
  },
  allIdsForUser(userId: string): string[] {
    return getDb()
      .getAllSync<{ id: string }>("SELECT id FROM portal_reminders WHERE user_id = ?", userId)
      .map((r) => r.id);
  },
};

export function deleteIdsNotIn(table: string, userId: string, keepIds: string[]) {
  const db = getDb();
  const existing = db.getAllSync<{ id: string }>(`SELECT id FROM ${table} WHERE user_id = ? AND _dirty = 0`, userId);
  const keep = new Set(keepIds);
  for (const row of existing) {
    if (!keep.has(row.id)) db.runSync(`DELETE FROM ${table} WHERE id = ?`, row.id);
  }
}
