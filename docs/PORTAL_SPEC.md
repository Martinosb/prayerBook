# Prayer Portal — Feature Spec (source of truth for the React Native rebuild)

Reverse-engineered from `Connexional-Prayer-Board` (Next.js 15 / Supabase), the
`/portal` section only. Every field name, table name, and enum below is copied
verbatim from source so it can be used as a literal build reference for the
Expo/React Native app. File paths cited are in the **source** repo unless
otherwise noted.

Ambiguities the source code leaves unresolved are called out explicitly as
**AMBIGUOUS** — do not invent behavior for these; confirm with the user first.

---

## 1. Data Types

Source: `lib/portal/types.ts` (copied verbatim).

```ts
export interface Profile {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  sms_opt_in: boolean;
  timezone: string;
  last_ai_request_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export type RequestStatus = "active" | "answered" | "archived";

export interface PrayerRequest {
  id: string;
  user_id: string;
  category_id: string;
  title: string;
  details: string | null;
  status: RequestStatus;
  answered_at: string | null;
  voice_note_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scripture {
  id: string;
  user_id: string;
  request_id: string;
  content: string;
  reference: string | null;
  source: "manual" | "ai";
  position: number;
  created_at: string;
}

export interface PrayerLog {
  id: string;
  user_id: string;
  request_id: string;
  prayed_on: string; // date
  prayed_at: string | null; // time
  duration_minutes: number | null;
  note: string | null;
  voice_note_path: string | null;
  created_at: string;
}

export type PlanFrequency = "daily" | "weekly";

export interface PrayerPlan {
  id: string;
  user_id: string;
  request_id: string | null;
  category_id: string | null;
  title: string;
  frequency: PlanFrequency;
  days_of_week: number[] | null; // 0=Sun..6=Sat
  times_per_period: number;
  window_start: string | null; // time
  window_end: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  request_id: string | null;
  label: string;
  remind_time: string; // time, user-local
  days_of_week: number[];
  lead_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiSuggestion {
  type: "scripture" | "quote";
  reference: string;
  text: string;
}
```

Derived/composed types used by pages (not in `types.ts` but constructed inline
by page components — reproduce these shapes in the RN client):

- `PlanWithProgress` (`lib/portal/queries.ts`) = `PrayerPlan & { targetName: string; progress: PlanProgress }`
- `PlanProgress` (`lib/portal/progress.ts`): `{ adherence7: number|null; adherence30: number|null; streak: number; currentPeriodDone: number; currentPeriodTarget: number }`
- `CategoryWithCount` = `Category & { requestCount: number }`
- `RequestListItem` = `PrayerRequest & { categoryName: string; categoryColor: string|null; logCount: number; lastPrayedOn: string|null }`
- Dashboard `DashboardRequest` = `{ id, title, categoryName, categoryColor, lastPrayedOn }`
- Analytics `LogEntry` = `{ prayedOn, minutes, requestId, requestTitle, categoryName, categoryColor }`
- Analytics `ActiveRequest` = `{ id, title, categoryName, categoryColor, lastPrayedOn }`

---

## 2. Database Schema (Supabase/Postgres)

Source: `supabase/migrations/20260702000000_create_portal_schema.sql`,
`20260704000000_create_portal_push_subscriptions.sql`,
`20260704000001_add_voice_notes.sql`. All tables prefixed `portal_`, all RLS
owner-scoped via `auth.uid() = user_id` ("owner_all" policy = full CRUD for
the owner; profiles/reminder_sends have narrower policies).

| Table | Key columns / defaults / checks |
|---|---|
| `portal_profiles` | PK `id` = `auth.users.id`; `username` unique (case-insensitive index on `lower(username)`); `sms_opt_in default false`; `timezone default 'Africa/Accra'`; `last_ai_request_at timestamptz` nullable. Row auto-created by trigger `portal_handle_new_user` **only if** `auth.users.raw_user_meta_data` has a `username` key (i.e. only for portal-created accounts, not admin/public-site accounts). Policies: select/update own (this migration) **plus** `insert_own_profile` (`with check (auth.uid() = id)`, added in `20260703000000_portal_profile_insert_policy.sql` specifically so Google OAuth users — who have no `username` in their signup metadata and thus get no trigger-created row — can insert their own profile from `/portal/welcome`). |
| `portal_categories` | unique `(user_id, lower(name))` — case-insensitive per-user uniqueness. `color` free text (app constrains to `#rrggbb` via zod, not a DB check). |
| `portal_prayer_requests` | `category_id` FK **not null**, `on delete cascade` from category. `status` check `in ('active','answered','archived')`, default `'active'`. `voice_note_path` added later. Indexes on `(user_id, status)` and `category_id`. |
| `portal_scriptures` | `request_id` FK not null cascade. `source` check `in ('manual','ai')` default `'manual'`. `position smallint default 0`. |
| `portal_prayer_logs` | `request_id` FK not null cascade. `prayed_on date default current_date`. `prayed_at time` nullable. `duration_minutes smallint check (> 0)` nullable. `voice_note_path` added later. |
| `portal_prayer_plans` | `request_id` and `category_id` both nullable FKs, but **`check (num_nonnulls(request_id, category_id) = 1)`** — exactly one must be set, enforced at the DB level. `frequency` check `in ('daily','weekly')`. `times_per_period smallint default 1 check (between 1 and 24)`. `start_date default current_date`. `is_active default true`. |
| `portal_reminders` | `request_id` nullable FK (optional link to a specific prayer point). `days_of_week smallint[] default '{0,1,2,3,4,5,6}'`. `lead_minutes smallint default 15 check (between 0 and 120)`. `is_active default true`. |
| `portal_reminder_sends` | Idempotency ledger. `send_type check in ('approaching','due')`. `status check in ('sent','failed')` default `'sent'`. **`unique (reminder_id, send_type, occurrence_at)`** — this is what makes reminder delivery idempotent across overlapping cron ticks. Only cron (service role) writes; users get `select`-only policy. |
| `portal_push_subscriptions` | `endpoint text unique` (upsert key). `p256dh`, `auth` (VAPID keys), `user_agent` nullable, `last_used_at` nullable. |

Storage bucket `portal-voice-notes` (private). Objects stored as
`{user_id}/{uuid}.{ext}`; RLS policy checks the first path segment equals
`auth.uid()`.

---

## 3. Validation Rules

### Shared (`lib/portal/validation.ts`)

- `usernameSchema`: trim, lowercase, regex `^[a-z0-9_]{3,20}$` → "3–20 characters: lowercase letters, numbers, underscores".
- `normalizeGhanaPhone(input)`: strips spaces/dashes/`+`; accepts `0XXXXXXXXX` (10 digits, leading 0) → rewritten to `233XXXXXXXXX`; accepts `233XXXXXXXXX` (12 digits) as-is; anything else → `null` (invalid).

### Per-action zod schemas (inline in each action file — not centralized)

| Field | Rule |
|---|---|
| Category `name` | trim, min 1, max 60 |
| Category `description` | trim, max 300, optional |
| Category `color` | regex `^#[0-9a-fA-F]{6}$`, optional |
| Request `categoryId` | `z.uuid()` |
| Request `title` | trim, min 1, max 120 |
| Request `details` | trim, max 2000, optional |
| Request `voiceNotePath` | max 300, optional |
| Log `requestId` | `z.uuid()` |
| Log `prayedOn` | `z.iso.date()`, optional (DB defaults to `current_date`) |
| Log `prayedAt` | `z.iso.time({precision:-1})`, optional |
| Log `durationMinutes` | int, min 1, max 600, optional |
| Log `note` | trim, max 500, optional |
| Log `voiceNotePath` | max 300, optional |
| Plan `title` | trim, min 1, max 120 |
| Plan `requestId` / `categoryId` | both `z.uuid()` optional, **refined: exactly one must be present** ("Pick a prayer point or a category (not both)") |
| Plan `frequency` | enum `daily`/`weekly` |
| Plan `daysOfWeek` | array of int 0–6, max length 7, optional |
| Plan `timesPerPeriod` | int, min 1, max 24 |
| Plan `windowStart`/`windowEnd` | `z.iso.time`, optional, **refined: both-or-neither**, and **refined: start < end** |
| Plan `endDate` | `z.iso.date()`, optional |
| Reminder `label` | trim, min 1, max 80 |
| Reminder `remindTime` | `z.iso.time` |
| Reminder `daysOfWeek` | array of int 0–6, **min 1** ("Pick at least one day"), max 7 |
| Reminder `leadMinutes` | int, min 0, max 120 |
| Reminder `requestId` | `z.uuid()`, optional |
| Profile `timezone` | min 1, max 60 |
| Profile `phone` | trim, max 20, optional; then run through `normalizeGhanaPhone` |
| Profile `smsOptIn` | boolean; **if true and no valid phone → error** "Add a phone number to enable SMS reminders" |
| Scripture `content` | trim, min 1, max 1000 |
| Scripture `reference` | trim, max 100, optional |
| Scripture `source` | enum `manual`/`ai`, default `manual` |
| `addScriptures.entries` | array, min 1, max 20 per call |
| Push subscription `endpoint` | `z.url()`, max 1000 |
| Push subscription `p256dh`/`auth` | min 1, max 500 |
| Push `userAgent` | max 500, optional |
| Username check (`/api/portal/check-username`) | same `usernameSchema` |
| AI suggestion request `count` | int, min 1, max 20 |
| AI suggestion `kind` | enum `scripture`/`quote`/`mixed` |

---

## 4. Read Queries

Source: `lib/portal/queries.ts` + inline queries in each page (`app/portal/(app)/**/page.tsx`).

### `getPlansWithProgress()` (`lib/portal/queries.ts`)
- Fetches (parallel): `portal_prayer_plans` (`select *, portal_prayer_requests(title), portal_categories(name)`, ordered by `created_at asc`), `portal_prayer_logs` (`select *` where `prayed_on >= today-84d`), `portal_prayer_requests` (`select id, category_id`, all — used to map a log's request back to its category).
- For each plan: filters the log set to those belonging to its target — if `plan.request_id` is set, logs where `log.request_id === plan.request_id`; else logs whose request's `category_id` matches `plan.category_id` (via the id→category_id map).
- `targetName` = linked request's title, else linked category's name, else literal `"(deleted)"` (target was removed but the plan row survives — FK is nullable so no cascade).
- Computes `progress` via `computePlanProgress(plan, planLogs)` (see §5).

### Dashboard (`app/portal/(app)/page.tsx`)
- `getProfile()`, `getPlansWithProgress()`, and in parallel:
  - `portal_prayer_requests` where `status = 'active'`, joined to `portal_categories(name, color)`, ordered `created_at desc`.
  - `portal_prayer_logs` — all rows, `select request_id, prayed_on` (no date filter; used only to compute last-prayed-per-request and today/week/all-time counts client-side).
- Builds `lastPrayed` map (max `prayed_on` per `request_id`).
- `stats`: `totalSessions` = all logs; `sessionsToday` = logs where `prayed_on === today`; `sessionsThisWeek` = logs where `prayed_on >= today-6d`; `bestStreak` = max of all plans' `progress.streak`.

### Categories (`app/portal/(app)/categories/page.tsx`)
- `portal_categories` `select *, portal_prayer_requests(count)`, ordered `created_at asc`. Maps `portal_prayer_requests[0].count` → `requestCount`.

### Requests list (`app/portal/(app)/requests/page.tsx`)
- Reads `searchParams.category` and `searchParams.status` (used as initial filter state client-side — filtering itself happens client-side in `RequestsView`, not via SQL `where`).
- `portal_categories` all, ordered `created_at asc`.
- `portal_prayer_requests` **all statuses** (no filter — the page always fetches everything and filters in the browser), joined to `portal_categories(name, color)`, ordered `created_at desc`.
- `portal_prayer_logs` all, `select request_id, prayed_on` → builds per-request `{count, last}` map.

### Request detail (`app/portal/(app)/requests/[id]/page.tsx`)
- `portal_prayer_requests` by id joined to `portal_categories(*)`; `notFound()` if missing (RLS means a foreign user's request also 404s here).
- `portal_scriptures` where `request_id = id`, ordered `position asc, created_at asc`.
- `portal_prayer_logs` where `request_id = id`, ordered `prayed_on desc, created_at desc`.
- `portal_categories` all (for the edit dialog's category picker).
- Collects every non-null `voice_note_path` (request + all its logs) and calls `supabase.storage.from('portal-voice-notes').createSignedUrls(paths, 3600)` (1-hour signed URLs) — builds a `path → signedUrl` map passed down as props.

### Plans (`app/portal/(app)/plans/page.tsx`)
- `getPlansWithProgress()`, `portal_categories` all (ordered `created_at asc`), `portal_prayer_requests` where `status='active'` `select id, title, status` ordered `created_at desc`.

### Analytics (`app/portal/(app)/analytics/page.tsx`)
- `portal_prayer_logs` where `prayed_on >= today-90d`, `select prayed_on, duration_minutes, request_id, portal_prayer_requests(title, portal_categories(name, color))`.
- `portal_prayer_requests` where `status='active'`, `select id, title, status, portal_categories(name, color)`.
- `getPlansWithProgress()`.
- Separately fetches **all** `portal_prayer_logs` (`select request_id, prayed_on`, no date filter) to compute last-prayed-ever per request (so "never prayed" is accurate beyond the 90-day window).
- All range-based filtering (7/30/90 day tabs) happens **client-side** in `AnalyticsView` from the 90-day dataset — there's no re-fetch on range change; a client-selected range wider than 90 days isn't possible since the RANGES are capped at 90.

### Settings (`app/portal/(app)/settings/page.tsx`)
- `getProfile()`, `portal_reminders` all ordered `remind_time asc`, `portal_prayer_requests` where `status='active'` `select id, title` ordered `created_at desc`.

### Auth/DAL (`lib/portal/dal.ts`)
- `requireUser()`: `cache()`-wrapped; calls `supabase.auth.getUser()`; **redirects to `/portal/login` if no user** — every page/action must call this itself (comment explicitly warns not to rely on layout-only checks).
- `getProfile()`: `cache()`-wrapped; `portal_profiles` `select *` where `id = user.id`, `.single()`. Returns `null`-able row (via `.single()` shape) — the `(app)` layout treats a falsy profile as "needs onboarding" and redirects to `/portal/welcome`.

---

## 5. Business Logic Modules

### `lib/portal/progress.ts` — plan adherence/streak math

- A **period** is one calendar day (daily plans) or one ISO week starting Monday (weekly plans, `startOfWeek(date, {weekStartsOn:1})`).
- `dayEligible(plan, date)`: true if `days_of_week` is null/empty (any day counts) or `date.getDay()` is in the array.
- `logQualifies(plan, log)`: log's day must be eligible; if the plan has **both** `window_start` and `window_end` **and** the log has a `prayed_at`, the log's time (HH:mm) must fall within `[window_start, window_end]` inclusive. **Logs without a time always qualify for windowed plans** (never penalized for quick-logging without a timestamp).
- `periodExpected(plan, key, today)`: a period counts toward adherence only if it's on/after `start_date`, on/before `end_date` (if set), not in the future, and (for daily) an eligible day, or (for weekly) contains at least one eligible day in range.
- Walks backwards from today in `step` increments (1 day or 7 days) for `lookbackDays` (default 84, i.e. 12 weeks), building a list of `{key, met, expected}` where `met` = qualifying-log count for that period ≥ `times_per_period`.
- `adherence7`/`adherence30`: fraction of *expected* periods within the last 7/30 days that were met; `null` if there were zero expected periods in that window (not 0%).
- **Streak**: walks periods most-recent-first; the **current (incomplete) period never breaks the streak** — if it's met, it adds to the streak; if not yet met, it's simply skipped (continue) and older periods are still evaluated; the first *complete*, expected, unmet period stops the count.
- `currentPeriodDone` = min(qualifying logs this period, `times_per_period`) (capped — extra logs don't inflate progress past the target).
- `currentPeriodTarget` = `times_per_period` if the current period is expected, else `0` (e.g. plan hasn't started yet, has ended, or today isn't an eligible day).
- `daysSince(dateStr, today)`: calendar-day difference; `null` if `dateStr` is `null`. Used for "neglected" prayer point sorting on Dashboard/Analytics (days-since-last-prayed ≥ 3 = "needs attention"; > 7 = shown in red, else amber).

### `lib/portal/presets.ts`
- `PRESET_CATEGORIES`: 8 fixed presets — `{name, description, color}` — Academics (#3b82f6), Family (#ef4444), Health (#22c55e), Ministry & Church (#b8923f), Finances (#10b981), Nation (#f59e0b), Friends (#8b5cf6), Spiritual Growth (#ec4899). Clicking a preset in the "new category" dialog just pre-fills the form fields (no special creation path); presets already used by the signed-in user (name match, case-insensitive) are hidden from the picker.
- `CATEGORY_COLORS`: 9 swatches offered in the color picker — `#b8923f, #3b82f6, #ef4444, #22c55e, #f59e0b, #8b5cf6, #ec4899, #10b981, #06b6d4`.

### `lib/portal/transcribe.ts` — voice-to-text
- Groq Whisper-compatible endpoint `https://api.groq.com/openai/v1/audio/transcriptions`, model `whisper-large-v3-turbo`. Requires `GROQ_API_KEY`; returns a friendly "not configured" error if unset (no crash).
- On HTTP 429 → "The transcription service is busy — try again in a minute"; other non-OK → generic try-again error; empty/whitespace-only transcript → "Didn't catch any speech in that recording"; network exception → "Could not reach the transcription service".
- Called from `POST /api/portal/transcribe` (route, not a server action — needs `multipart/form-data`).

### `POST /api/portal/transcribe` (`app/api/portal/transcribe/route.ts`)
- Auth required (401 if no session). Reads `audio` field from FormData; rejects empty blob (400) or size > 15 MB (413, "keep it under 2 minutes"). Maps MIME → extension (`audio/webm→webm, audio/ogg→ogg, audio/mp4→m4a, audio/mpeg→mp3, audio/wav→wav`, default `webm`).
- Uploads to bucket `portal-voice-notes` at path `{user.id}/{uuid}.{ext}` **before** transcribing — recording is preserved even if transcription later fails; upload failure → 502.
- Transcription failure returns **HTTP 200** with `{path, error}` — caller keeps the saved recording and lets the user type text manually. Success returns `{path, transcript}`.

### `lib/portal/groq.ts` — AI scripture/quote suggestions
- Endpoint `https://api.groq.com/openai/v1/chat/completions`, model `llama-3.3-70b-versatile`, `response_format: json_object`, `temperature 0.7`, `max_tokens 4000`.
- System prompt instructs: only well-known/certain Bible verses with accurate "Book Chapter:Verse" refs; quotes use the person's name as reference; never invent references; vary sources; respond only with the exact JSON shape `{"suggestions":[{"type":"scripture"|"quote","reference":"...","text":"..."}]}`.
- User prompt includes prayer title, optional details, `count`, a `kindLine` derived from `kind` ("Bible scriptures" / "Christian quotes" / "a mix of Bible scriptures and Christian quotes"), and a "Do NOT repeat these references" list built from the request's existing non-null scripture references.
- **One retry** on transport/parse failure (loop of 2 attempts) before giving up. 429 → immediate "AI is busy" error (no retry). Result parsed/validated with a zod schema requiring ≥1 suggestion; truncated to `params.count`.

### `POST /api/portal/ai-suggestions` (`app/api/portal/ai-suggestions/route.ts`)
- Auth required (401). Body validated: `requestId` uuid, `count` 1–20, `kind` enum.
- **Cooldown**: reads `portal_profiles.last_ai_request_at`; if less than `AI_COOLDOWN_SECONDS = 15` since last call, returns 429 with a "Please wait Ns" message (computed via `Math.ceil`). This is a **per-user global cooldown across all requests**, not per-prayer-point.
- Fetches the target `portal_prayer_requests` row scoped by RLS (title/details) — 404 if not found/not owned.
- Fetches existing scripture references for that request (`not null`) to pass as `avoidReferences`.
- **Updates `last_ai_request_at = now()` before calling Groq** (so a slow/failed Groq call still consumes the cooldown window).
- Calls `generateSuggestions`; 502 on error, else `{suggestions}`.

### `lib/portal/arkesel.ts` — SMS
- Arkesel v2 API, `POST https://sms.arkesel.com/api/v2/sms/send`, header `api-key`, body `{sender, message, recipients: [recipient]}`.
- Requires `ARKESEL_API_KEY` + `ARKESEL_SENDER_ID` env vars; **no-ops silently** (`{ok:false, error:"not_configured"}`, just a console.warn) if unset — no crash, no user-facing error.
- Success requires `json.status === "success"`; returns `messageId` from `json.data[0].id`.

### `lib/portal/web-push.ts` — Web Push
- Uses `web-push` npm lib with VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` public, `VAPID_PRIVATE_KEY` private, `VAPID_SUBJECT` defaulting to `mailto:prayerboard@ghamsu.org`). No-ops (`{ok:false, gone:false}`) if keys are unset.
- `sendPush(subscription, payload)`: payload is `{title, body, tag?, url?}`, JSON-stringified as the push body. On error, checks `error.statusCode` — 404/410 means the subscription is dead (`gone:true`) so the caller should delete it from `portal_push_subscriptions`.

### `lib/portal/confetti.ts` — celebration effects (client-only, `canvas-confetti`)
- Respects `prefers-reduced-motion: reduce` (no-ops entirely if set).
- `celebrateLog()`: single burst, 70 particles, spread 65, origin bottom-center-ish (`y:0.75`), gold palette `#b8923f #e4c87a #ffffff #f4e4bc`. Fired on: any successful prayer log (dashboard quick-log, request detail quick/detailed log), and when a request's status is set to `answered`.
- `celebrateGoal()`: two-sided burst (60 particles each side, spread 100, angled 60°/120° from bottom corners) — fired specifically when a **dashboard plan chip's quick-log completes that plan's current-period target** (`done + 1 >= target`).

### Reminder delivery — `app/api/cron/reminders/route.ts` (external cron endpoint, not a server action)
- `POST`, protected by `Authorization: Bearer ${CRON_SECRET}` header match; 401 otherwise. Intended to be invoked every ~5 minutes (Supabase pg_cron or external scheduler — no code confirms which is wired up in this repo; **AMBIGUOUS**: no pg_cron migration was found, so the RN/cloud rebuild must independently schedule this or an equivalent job).
- Fetches all active reminders, all profiles (`id, phone, sms_opt_in, timezone`), all push subscriptions, using the **admin/service-role client** (bypasses RLS).
- Per reminder: skip if no owning profile found; compute `smsEligible = sms_opt_in && phone present`; **skip entirely (no ledger row burned) if the user has zero push subscriptions AND is not SMS-eligible** — i.e. an unreachable user costs nothing.
- Uses `timezone` from the profile, defaulting to `Africa/Accra` if unset, via `TZDate` (`@date-fns/tz`) to compute "now" in the user's local time and to build today's occurrence instant from `remind_time`.
- Skips the reminder entirely if today's day-of-week isn't in `days_of_week`.
- Two send windows per occurrence, both computed from `now` vs the occurrence instant:
  - **"approaching"**: fires only if `lead_minutes > 0`, in `[occurrence - lead_minutes, occurrence)`.
  - **"due"**: fires in `[occurrence, occurrence + 10min grace)`.
- **Idempotency**: for each window type, `upsert`s into `portal_reminder_sends` with `onConflict: (reminder_id, send_type, occurrence_at)` and `ignoreDuplicates: true`; if zero rows come back, this exact send was already claimed by another tick — skip.
- Fan-out: pushes to **every** subscription the user has (not just one device); SMS sent once if eligible. `anySuccess` tracks if any channel worked; if push fails with `gone` (404/410), the dead subscription row is deleted immediately. If literally nothing succeeded, the ledger row is updated to `status:'failed'` (but the row still exists — this reminder/window/occurrence combo will not be retried, by design, since the ledger already claimed it).
- Push payload: `title` = `"Prayer in {lead}min ⏰"` or `"It's time to pray 🙏"`; `body` = reminder label; `tag` = `reminder-{id}-{type}` (dedupes stacked notifications on the device); `url` = `/portal/requests/{request_id}` if the reminder is linked to one, else `/portal`.
- SMS message text: approaching = `"Prayer time in {lead} min: {label}. Get ready 🙏"`; due = `"It's time to pray: {label}. prayerboard.ghamsu.org/portal"` (hardcoded domain — **note for RN**: this URL is web-specific; a native equivalent should use a deep link or the app's own domain).

---

## 6. Server Actions (writes)

All actions are `"use server"` functions; every one calls `requireUser()` first
(auth + gets a request-scoped Supabase client) and returns `ActionResult =
{error: string} | {ok: true}` (some add extra fields, noted below). All
revalidate specific Next.js paths after success (irrelevant to RN — replace
with local cache invalidation / refetch of the equivalent screens) and call
`refresh()` (an internal helper, effectively forces a client-side re-render;
also irrelevant to RN).

### `lib/portal/actions/auth.ts`
- `signOutAction()`: `supabase.auth.signOut()`, then `redirect('/portal/login')`. No input/output — void.

### `lib/portal/actions/profile.ts`
- `createProfileAction({username})`: validates via `usernameSchema`. Checks case-insensitive uniqueness via **admin client** (`supabaseAdmin`, bypasses RLS — needed since the user has no profile row yet to be checked against under RLS). Inserts `{id: user.id, username, email: user.email ?? ''}`. Unique-violation (Postgres `23505`) or pre-check both map to "That username is already taken". On success: `redirect('/portal')` (does not return `{ok:true}` — the redirect itself is the success path).
- `updateProfileAction({timezone, phone?, smsOptIn})`: validates. If `phone` provided, runs `normalizeGhanaPhone`; invalid → "Enter a valid Ghana number (e.g. 0241234567 or 233241234567)". If `smsOptIn` true but no valid phone → error, blocks save entirely (not just SMS). Updates `timezone`, `phone` (null if not provided), `sms_opt_in`.

### `lib/portal/actions/categories.ts`
- `createCategoryAction({name, description?, color?})`: zod-validated. Insert; Postgres `23505` (unique `(user_id, lower(name))`) → "You already have a category with that name".
- `updateCategoryAction({id, name, description?, color?})`: same validation/uniqueness handling; no ownership re-check beyond RLS (`.eq('id', input.id)` — RLS policy `owner_all` ensures cross-user updates silently affect 0 rows, not an error).
- `deleteCategoryAction(id)`: hard delete; cascades to `portal_prayer_requests` (and transitively scriptures/logs) and any `portal_prayer_plans` targeting the category, per FK `on delete cascade`. UI confirms this in the delete dialog copy.

### `lib/portal/actions/requests.ts`
- `createRequestAction({categoryId, title, details?, voiceNotePath?})`: returns `{ok:true, id}` on success (id used to navigate to the new detail page).
- `updateRequestAction({id, categoryId, title, details?})`: no status/voiceNotePath change here.
- `setRequestStatusAction({id, status})`: sets `status`, and `answered_at = now()` **only if** `status === 'answered'`, else explicitly nulls `answered_at` (so un-answering — e.g. active↔archived — always clears the answered timestamp, even coming from 'answered').
- `deleteRequestAction(id)`: reads `voice_note_path` first, hard-deletes the row (cascades to scriptures + logs + any plan/reminder referencing it — plans have nullable FK but `on delete cascade`, meaning a plan targeting a deleted request is **deleted**, not orphaned to `null`), then removes the voice note object from storage if present.

### `lib/portal/actions/logs.ts`
- `logPrayerAction({requestId, prayedOn?, prayedAt?, durationMinutes?, note?, voiceNotePath?})`: if `prayedOn` omitted, the DB default (`current_date`, server timezone — **not the user's profile timezone**; **AMBIGUOUS**: no explicit timezone conversion happens here, unlike the cron job) applies. Note: the client-side `logPrayer()` wrapper (offline queue) always stamps `prayedOn`/`prayedAt` at call time in local device time before calling this action, so in practice the DB default path is rarely hit from the UI.
- `deleteLogAction({id, requestId})`: reads `voice_note_path` first, deletes row, then removes the storage object if present.

### `lib/portal/actions/plans.ts`
- `createPlanAction(input: PlanInput)` / `updatePlanAction(input & {id})`: `toRow()` normalizes `daysOfWeek` — **if the array covers all 7 days (or is empty), it's stored as `null`** ("any day"), only stored as an explicit array if it's a proper non-empty subset (1–6 days). This matters for progress math (`dayEligible` treats `null`/empty identically as "any day").
- `togglePlanAction({id, isActive})`: sets `is_active` only.
- `deletePlanAction(id)`: hard delete; **prayer logs are NOT deleted** (they belong to the request/category, not the plan) — UI confirms this explicitly ("Your prayer logs are kept").

### `lib/portal/actions/reminders.ts`
- `createReminderAction` / `updateReminderAction(input & {id})`: `toRow()` sorts `daysOfWeek` ascending before storing.
- `toggleReminderAction({id, isActive})`, `deleteReminderAction(id)`: straightforward.

### `lib/portal/actions/scriptures.ts`
- `addScripturesAction({requestId, entries[]})`: enforces a **soft cap of 15 scriptures per request** (`MAX_SCRIPTURES_PER_REQUEST`), checked via a `count` query before insert; if `existing + entries.length > 15`, rejects the whole batch with a message naming the current count. `position` is assigned sequentially starting at the current count (append-only ordering — no reordering/drag support in the source app).
- `deleteScriptureAction({id, requestId})`: straightforward; does not compact/renumber remaining `position` values.

### `lib/portal/actions/push.ts`
- `savePushSubscriptionAction({endpoint, p256dh, auth, userAgent?})`: **upsert** on `onConflict: 'endpoint'` — re-subscribing the same browser/device endpoint just refreshes `last_used_at` and keys rather than erroring or duplicating.
- `deletePushSubscriptionAction({endpoint})`: deletes by endpoint (not by id — a device unregisters itself by its own endpoint string).

### Non-server-action writes (API routes)
- `POST /api/portal/transcribe` — see §5 (uploads + transcribes voice notes; not a `"use server"` action because it needs raw FormData/Blob upload, which the app's `VoiceRecorder` component calls via `fetch`).
- `POST /api/portal/ai-suggestions` — see §5 (generates suggestions; **does not persist them** — persistence only happens when the user explicitly picks suggestions and the client calls `addScripturesAction`).
- `GET /api/portal/check-username?u=` — validates via `usernameSchema`, checks admin-client uniqueness (case-insensitive), returns `{available: boolean}` or `{available:false, invalid:true}`. Used for live-typing feedback debounced 400ms in `WelcomeForm`.
- `POST /api/cron/reminders` — see §5.

---

## 7. Pages / Screens

### Auth layout (`app/portal/(auth)/layout.tsx`)
Full-bleed dark (`#0a0a0a`) background with a soft gold radial glow, centered
card, "Connexional Prayer Board" wordmark linking to `/`, footer tagline "Your
personal prayer companion". Wraps `login` and `welcome`.

### `/portal/login` (`app/portal/(auth)/login/page.tsx` → `LoginForm`)
- Reads `searchParams.next` (post-login redirect target, defaults `/portal`, must start with `/` else falls back) and `searchParams.error` (`invalid_link` → toast "Sign-in didn't complete. Please try again.").
- **Primary CTA**: "Continue with Google" — full-width white pill button, Google G logo (inline SVG, brand colors), calls `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo: origin + '/auth/callback?next=' + dest}})`. On error, toast the Supabase error message. On success, browser navigates away (no local state change needed).
- Caption: "First time here? Signing in creates your account automatically." (Google sign-in is **also** the sign-up path — no separate registration flow.)
- **Dev-only fallback** (`devFallback = NODE_ENV === 'development'`): collapsible "Show local dev login (email + password)" toggle revealing an email+password form using `supabase.auth.signInWithPassword`; on success, `router.push(dest); router.refresh()`. **Not present in production** — RN app likely doesn't need this, but note it exists for local testing in the web app.
- `/auth/callback` (`app/auth/callback/route.ts`): PKCE code-exchange endpoint; on success redirects to `next` (validated to start with `/`, else `/portal`); on failure or missing code redirects to `/portal/login?error=invalid_link`.

### `/portal/welcome` (`app/portal/(auth)/welcome/page.tsx` → `WelcomeForm`)
- Server: if a profile already exists, `redirect('/portal')`. Otherwise derives a username **suggestion** from the Google email's local-part (lowercased, non-`[a-z0-9_]` stripped, collapsed underscores, trimmed leading/trailing `_`, truncated to 20 chars) — only used as a prefill if the result is ≥3 chars (else empty). Also extracts a first name from `user_metadata.full_name` for the greeting ("Welcome, {name}!" vs "Welcome!").
- **Form**: single "Username" input, autofocus, debounced (400ms) live availability check against `/api/portal/check-username`, with inline status icon: checking (spinner) / available (green check) / taken or invalid (red X, plus a hint line explaining the 3–20/lowercase/digits/underscore rule when invalid). Submit button disabled while pending or while status is `taken`/`invalid`.
- Submit calls `createProfileAction({username})`; error → toast; success → server-side redirect to `/portal` (handled by the action, not client routing).

### `(app)` layout (`app/portal/(app)/layout.tsx` + `PortalShell`)
- Server component: `getProfile()` — if `null` (no profile row = first Google login), `redirect('/portal/welcome')`.
- `PortalShell` (client) renders the two responsive nav surfaces sharing the same **6 nav items** (`name / href / icon`):
  1. Home → `/portal` (LayoutDashboard icon)
  2. Categories → `/portal/categories` (FolderHeart)
  3. Requests → `/portal/requests` (HandHeart) — labeled "Requests" in nav but "Prayer Points" on the page itself
  4. Plans → `/portal/plans` (CalendarCheck)
  5. Analytics → `/portal/analytics` (ChartNoAxesColumn)
  6. Settings → `/portal/settings` (Settings)
- Desktop (`md:` breakpoint+): fixed left sidebar (240px), wordmark header, nav list with an animated active-pill background (framer-motion `layoutId`), footer block showing a 2-letter avatar (first 2 chars of username, uppercase, gold circle), `@username`, theme toggle, and a "Sign out" button (with spinner while pending).
- Mobile (< `md`): sticky top bar (wordmark + theme toggle + sign-out icon button) **and** a fixed bottom tab bar (6 equal-width icon+label tabs, active tab in gold with animated pill).
- Active-route matching: exact match for `/portal`, else `pathname === href || pathname.startsWith(href + '/')`.
- **Sign-out flow**: before calling `signOutAction()`, posts `{type:'CLEAR_PAGES'}` to the active service worker controller — signals the SW to purge any cached portal pages (which may contain personal data) from its cache. **AMBIGUOUS for RN**: this is a PWA/service-worker-specific mechanism; the RN equivalent is simply clearing any local cache/AsyncStorage of portal data on sign-out.
- `<OfflineSync />` is mounted globally inside the shell (see §9).
- Content area max-width ~5xl (80rem), padded; bottom padding on mobile to clear the tab bar.

### `/portal` — Dashboard (`app/portal/(app)/page.tsx` → `DashboardView`)
- Data: profile, `getPlansWithProgress()` filtered to `is_active`, active requests (with category name/color + last-prayed-on), and `stats` (see §4).
- **`<PortalNudge />`** banner at top (see §9) — dismissible install/push prompt, persisted via `localStorage` key `pb-portal-nudge`.
- **Greeting**: time-of-day based (`< 5` → "Praying late"/Moon icon; `<12` → "Good morning"/Sunrise; `<17` → "Good afternoon"/Sun; else "Good evening"/Sunset), plus `@username` heading.
- **Stats row** (4 tiles): Today (sessionsToday), This week (sessionsThisWeek), All time (totalSessions), Best streak (bestStreak, singular/plural "period(s)" label, flame icon shown only if > 1).
- **"Today's plans" section**: plans where `progress.currentPeriodTarget > 0` (i.e. expected today/this week). Empty state: dashed card, "No plan targets today." + link to create a plan. Each `PlanChip` shows title, `targetName`, `done/target` counter, animated progress bar; if `request_id` is set and not complete, a "Pray ✓" button calls `logPrayer({requestId})` — on success: if this completes the target (`done+1 >= target`) → `celebrateGoal()` + toast `"{title}" complete — well done! 🎉`; else `celebrateLog()` + toast (offline-aware: "Saved offline — will sync when you're back 🙏" vs "Prayer logged 🙏"). If the plan targets a **category** (no single `request_id`), the button becomes an "Open" link to `/portal/requests?category={category_id}` instead (category-level plans have no single quick-log target).
- **"Needs your attention" section** (only rendered if non-empty): active requests where `daysSince(lastPrayedOn) === null || >= 3`, sorted by days descending (nulls treated as `9999`, i.e. sorted first), sliced to top 3. Each row: category-color dot, title, category name, and a pill — "never prayed" (null) or "{n}d ago", colored red if `days === null || days > 7`, amber otherwise.
- **"Quick log" section**: all active requests, sliced to first 6, each row logs via `logPrayer({requestId})` with the same success/offline toast pattern (always `celebrateLog()`, never `celebrateGoal()` here — that only fires from plan-chip completions). Empty state (`requests.length === 0`): dashed card, "Set up your first prayer point to start logging." + "Get started" button linking to `/portal/categories`.
- Loading skeleton (`loading.tsx`): greeting block, 4 stat placeholders, 2 plan-chip placeholders, 4 quick-log-row placeholders.

### `/portal/categories` (`CategoriesView`)
- Header + "New" button (gold pill, top-right).
- Empty state: dashed card, FolderHeart icon, "No categories yet", CTA "Create your first category" (opens dialog).
- Grid (1/2/3 cols responsive) of cards, each linking to `/portal/requests?category={id}`: colored icon chip, name, optional description (2-line clamp), request count ("{n} prayer point(s)"). Hover-revealed edit (pencil) / delete (trash) icon buttons in the top-right corner (not covered by the main link).
- **Create/Edit dialog**: only on create, a row of preset chips (excluding presets whose name already exists case-insensitively for this user) — clicking one prefills name/description/color. Fields: Name (required, max 60), Description (optional, max 300, textarea rows=2), Accent color (9-swatch picker, ring highlight on selection, defaults to first swatch `#b8923f` on create or the category's existing color on edit). Submit disabled while pending or name empty; button text "Create category" / "Save changes".
- **Delete confirmation** (AlertDialog): warns that deleting also removes its N prayer points "including their scriptures and prayer history" if `requestCount > 0`; irreversible framing. Destructive red confirm button.
- Loading skeleton: header + "New" button placeholders, 6 card placeholders.

### `/portal/requests` — "Prayer Points" (`RequestsView`)
- Header ("Prayer Points" / "Everything you're bringing before God") + "New" button (disabled if zero categories exist).
- **Filters** (client-side only, not server round-trips): status tab bar — Active / Answered / Archived / All (defaults to `active`, or `searchParams.status` if it matches a tab value), animated active pill; category `<Select>` (only rendered if categories exist) — "All categories" or a specific category id (defaults to `searchParams.category` or `"all"`).
- **Empty states**: (a) zero categories at all → "Create a category first" + link to `/portal/categories`; (b) filtered list empty → "No prayer points here yet" (when status filter is `active`) or "No {status} prayer points", with a CTA to open the create dialog (unless the zero-categories case).
- **List rows** (animated add/remove via framer-motion `AnimatePresence`, sorted by `created_at desc` from the query — no client re-sort): category-color dot, title, category name + a status pill (only shown if not `active`: green "answered" / muted "archived"), right-aligned log count (`{n}×`) + relative last-prayed time ("never prayed" if none) hidden on narrow screens, chevron. Whole row links to `/portal/requests/{id}`.
- **New prayer point dialog**: Category `<Select>` (required, defaults to the active category filter or first category), Title (required, max 120), Details (optional, max 2000, textarea rows=3) with an inline **VoiceRecorder** ("Record" label) next to the Details label — transcribed text is appended to any existing details text (newline-joined, not replacing). Submit disabled until title + category present. On success: toast "Prayer point added", dialog closes, form resets, and **navigates to the new request's detail page** (`router.push`).
- Loading skeleton: header, filter-bar placeholders, 6 row placeholders.

### `/portal/requests/[id]` — Prayer point detail (`RequestDetailView`)
- Back link "← Prayer points". Header: category pill (colored), status badge (green "Answered {date}" with checkmark if answered — date formatted `d MMM yyyy`; muted "Archived" if archived; nothing extra if active), title (large heading), optional details paragraph (`whitespace-pre-wrap`), optional inline `<audio>` player if the request itself has a voice note (signed URL, 1hr expiry from the server).
- Header-right controls: status `<Select>` (Active / "Answered 🎉" / Archived) — changing to `answered` triggers `celebrateLog()` + toast "Answered prayer — glory to God! 🎉"; edit (pencil) icon button opens the edit dialog; delete (trash, red) icon button opens a destructive confirm dialog ("permanently removes the prayer point, its scriptures and its entire prayer history").
- **Log section** (`LogSection`): a full-width primary button "I prayed for this today" (quick-log, no extra fields) alongside a "With details" popover-trigger button. The popover form: Date (`type=date`, required, max = today — cannot log a future date), Time (optional), Minutes (optional, 1–600), Note (optional, max 500, textarea rows=2) with an inline **VoiceRecorder** ("Speak it") appending transcript to the note the same newline-joined way. Both quick-log and detailed-log call `logPrayer()` (offline-aware wrapper) and show the celebrate+toast pattern; detailed log additionally closes the popover and resets its fields on success.
- Below the button row: a summary line ("{n} session(s) logged · {m} today" or "No prayers logged yet — today is a great day to start.") and, if any logs exist, a "History ▾" disclosure toggle.
- **History list** (collapsible, animated height): each row shows date (`d MMM yyyy`), then a joined "time · duration min · note" line (`—` if none of the three present), an inline `<audio>` player if that specific log has a voice note, and a delete (×) icon button (`deleteLogAction`).
- **Scriptures section** (`ScripturesSection`): header + "Add"/"×" toggle button revealing an inline form (Reference required max 100, Content/quote text required max 1000, "Save scripture" submit). List of scripture rows: reference (bold gold) with a small sparkle icon if `source === 'ai'`, content text (`whitespace-pre-wrap`), hover-revealed delete (×) button. Empty state (no scriptures, form not open): "No scriptures yet. Add the verses you're standing on — or let AI suggest some →".
- **AI Suggestions panel** (`AiSuggestionsPanel`) — side-by-side with Scriptures on desktop (`lg:grid-cols-2`), stacked on mobile:
  - Controls: Kind `<Select>` (Scriptures / Quotes / Mixed, default `scripture`), Count `<Select>` (5/10/20, default `5`), Generate/Regenerate button (label changes once suggestions exist; spinner + "Thinking…" while loading).
  - Calls `POST /api/portal/ai-suggestions`; on non-OK response, toasts the server's error message (this is where the 15s-cooldown 429 message surfaces to the user) or a generic connectivity error on fetch failure.
  - Results: **all suggestions pre-selected by default** (user deselects unwanted ones by tapping — toggles a filled/outline circular checkmark). Each suggestion card shows reference (bold gold) + a small uppercase type badge ("scripture"/"quote"), then the suggestion text.
  - "Add {n} selected" button calls `addScripturesAction` with `source:'ai'` for each selected entry; on success, toast pluralized count, and **removes only the added suggestions from the visible list** (unadded ones remain selectable for further picking) — does not require regenerating to add in two batches.
  - Empty/loading/all-added states each have their own copy (initial empty message varies based on whether the request already has scriptures; loading shows skeleton pulse blocks sized to the requested count capped at 5; "All suggestions added — regenerate for more." once the list is fully consumed).
- **Edit dialog**: Category `<Select>`, Title (required, max 120), Details (max 2000, textarea rows=3) — no voice recorder here (recording is only offered at creation and at logging time, not at edit time). Calls `updateRequestAction`.
- Loading skeleton (`loading.tsx`): back-link + header + status-controls placeholders, log-section placeholder, two side-by-side card placeholders for scriptures/AI.

### `/portal/plans` — Prayer Plans (`PlansView`)
- Header + "New plan" button, **disabled if the user has zero categories and zero active requests** (`hasTargets`).
- Empty state: dashed card, CalendarCheck icon, "No plans yet", CTA to create (if targets exist) or a note to create a category+prayer point first (if not).
- **Plan cards** (list, staggered fade-in): title, `"{targetName} · {describePlan(plan)}"` subtitle where `describePlan` renders e.g. `"2× a day on Mon, Wed, Fri, 06:00–07:00"` or `"once a week"` (times: "once" if 1, else "{n}×"; days: omitted if none/any-day, else comma-joined 3-letter names; window: omitted unless both start/end set, else "HH:MM–HH:MM"). Right side: a flame badge with streak count (only if `streak > 1`), an active/inactive `<Switch>` (`togglePlanAction`), edit (pencil) and delete (trash) icon buttons. Inactive plans render at 60% opacity and **hide the progress block entirely**.
- Active plans additionally show: a progress line ("Today"/"This week": `done/target` + a ✓ suffix if met, or "No target today" if `currentPeriodTarget === 0`) and a 30-day adherence percentage (`—` if `adherence30` is `null`), plus an animated fill bar for the 30-day percentage.
- **Delete confirmation**: explicitly reassures "Your prayer logs are kept — only the plan and its progress tracking are removed."
- **Create/Edit dialog** (scrollable, max-height 90vh):
  - Plan name (required, max 120).
  - "Pray for a…" `<Select>` — Prayer point vs Whole category — switching resets the chosen target id. "Which one?" `<Select>` lists either `requests` (id/title) or `categories` (id/name) depending on the first choice.
  - Frequency `<Select>` (Daily/Weekly) + "Times per day/week" number input (1–24, label text changes with frequency).
  - Days picker: 7 toggle buttons (S M T W T F S), multi-select, empty = "any day" (helper text says so explicitly).
  - Time window: a `<Switch>` "Time window" toggling visibility of two `type=time` inputs (start/end), defaulting to 06:00–07:00 when first enabled.
  - Submit disabled until title present and a target is chosen. On edit-open, all fields are pre-populated from the existing plan (target type inferred from whether `category_id` is set).
- Loading skeleton: header + button placeholders, 4 plan-card placeholders (each with a progress-bar placeholder).

### `/portal/analytics` (`AnalyticsView`)
- Header + a 3-way range tab (7/30/90 days, default 30) with an animated active pill — purely a client-side re-slice of the pre-fetched 90-day log set (no network refetch).
- If zero logs at all (server-fetched, unfiltered by range): full empty state (ChartNoAxesColumn icon, "No data yet", link "Log your first prayer" → `/portal/requests`).
- Otherwise, all sections below operate on `inRange = logs.filter(prayedOn >= today-(rangeDays-1))`:
  - **4 stat tiles**: Sessions (count in range), Minutes prayed (sum of `duration_minutes`, with a hint "log durations to track" if 0), Days active (distinct `prayed_on` dates in range), Best streak (max plan streak across **all active plans**, not range-filtered — flame icon if > 1).
  - **"Prayer sessions over time"** bar chart (Recharts): zero-filled daily series across the whole range (`eachDayOfInterval`), x-axis label format `"EEE d"` for ranges ≤30 days else `"d MMM"`, gold bars, custom tooltip showing "{label} / {n} sessions".
  - **"Sessions by category"** horizontal bar chart: grouped by `categoryName` (from the log's joined request→category, or literal `"Uncategorized"` if the request has none — though schema requires `category_id` not null, so this only occurs if the request itself was deleted, in which case `requestTitle` is `"(deleted)"` too), sorted descending by session count, each bar colored by the category's color (fallback gold).
  - **"Most prayed for"** horizontal bar chart: grouped by `requestTitle`, sorted descending, capped to **top 5**, gold bars.
  - **"Plan adherence (30 days)"** section (only rendered if there are active plans) — a labeled progress bar per active plan showing its fixed 30-day adherence % (**not affected by the 7/30/90 range tabs** — always the 30-day figure from `computePlanProgress`) with the plan's title + `describePlan()` subtitle.
  - **"Lagging areas"** section: active requests sorted by days-since-last-prayed descending (nulls first), filtered to `days === null || days >= 3`, capped to **6**. Each row links to the request detail, shows category dot/name, a colored pill (same red/amber threshold as Dashboard, > 7 days = red), and a hover-revealed "Pray now →" hint. Empty state: "Nothing is lagging — every active prayer point has been prayed for in the last 3 days. 🎉".
- Loading skeleton: header/tab placeholders, 4 stat tiles, one chart block, two side-by-side chart blocks, a lagging-areas block.

### `/portal/settings` (`SettingsView` + `NotificationsCard`)
- **Profile card**: Username (disabled input, read-only display), Email (disabled input), Timezone `<Select>` from a **fixed hardcoded list**: `Africa/Accra, Africa/Lagos, Africa/Nairobi, Europe/London, Europe/Paris, America/New_York, America/Chicago, America/Los_Angeles, Asia/Dubai` (default `Africa/Accra`), with helper text "Reminder times are interpreted in this timezone." Nested "SMS backup (optional)" sub-panel: Phone number input (placeholder "e.g. 0241234567"), "Also send SMS reminders" `<Switch>` with helper text. "Save settings" submit button calls `updateProfileAction`.
- **`NotificationsCard`** ("Notifications & app"):
  - Push toggle: reflects `getPushState()` (`unsupported`/`denied`/`prompt`/`subscribed`), disabled if unsupported/denied. Turning on calls `subscribeToPush()` (requests Notification permission, subscribes via the service worker's `PushManager`, persists via `savePushSubscriptionAction`); turning off calls `unsubscribeFromPush()`. Contextual helper messages: denied → instructions to re-enable in browser site settings; unsupported (and not iOS) → "This browser doesn't support push notifications."; iOS-and-not-installed → "install the app first" instructions (Share → Add to Home Screen).
  - Install row: shows "Installed" (with check icon) if already standalone; an "Install" button if `beforeinstallprompt` fired (Android/desktop Chrome-family); else a static hint ("Use Share → Add to Home Screen" on iOS, or "Available from your browser menu" elsewhere).
- **Reminders card** ("Prayer times"): "Add" button opens the reminder dialog. If SMS is currently off but reminders exist, shows an amber notice that times are saved but no texts will send until SMS is enabled. Empty state: BellOff icon + explanatory copy. Each reminder row: large time display (`HH:MM`), label + "{days} · heads-up {n} min before" subtitle (`days` = "Every day" if all 7 set, else comma-joined short names), active `<Switch>` (`toggleReminderAction`), edit (pencil), delete (trash, with its own inline spinner state).
- **Reminder create/edit dialog**: Label (required, max 80), Time (`type=time`, required, default `05:30`), "Heads-up (min before)" number (0–120, default `15`), Days picker (7 toggle buttons, defaults to **all 7 selected**, submit disabled if none selected), optional "Linked prayer point" `<Select>` (only shown if the user has active requests) — `"none"` sentinel maps to "General prayer time" / no `request_id`.
- Loading skeleton: profile-card, notifications-card, reminders-card placeholders (2 reminder rows).

---

## 8. PWA / Push Plumbing (web-specific — informs the RN equivalent)

- `components/pwa/ServiceWorkerProvider.tsx`: registers `/sw.js` in production only (SW conflicts with dev HMR); on an update-found + already-controlled state, toasts "A new version is available" with a "Refresh" action that posts `{type:'SKIP_WAITING'}` to the waiting worker; a `controllerchange` listener does a one-time `window.location.reload()`. **RN equivalent**: none needed — Expo/EAS OTA updates replace this; app-store/EAS update flow instead.
- `components/pwa/PortalNudge.tsx`: dashboard-only dismissible banner (persisted via `localStorage['pb-portal-nudge']`) that nudges either "install the app" (if not standalone and install is available, or is iOS) or "enable notifications" (if push state is `prompt`). **RN equivalent**: not applicable to installability; the push-permission nudge maps to a native permission-request prompt (expo-notifications).
- `lib/portal/offline/push-client.ts`: browser Web Push subscribe/unsubscribe via the Push API + VAPID key (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), persisted server-side via `savePushSubscriptionAction`/`deletePushSubscriptionAction`. `pushSupported()`/`getPushState()`/`isIOS()`/`isStandalone()` are all browser-API checks. **RN equivalent**: `expo-notifications` device push tokens registered against a new/adapted `portal_push_subscriptions`-like table (endpoint/keys model doesn't map 1:1 to Expo push tokens — schema will need an RN-specific token column, e.g. `expo_push_token`, rather than `endpoint/p256dh/auth`).
- `components/pwa/OfflineSync.tsx` + `lib/portal/offline/log-queue.ts`: see §9 below (this part **does** map directly to RN).

---

## 9. Offline Queueing (maps directly to RN — read carefully)

Source: `lib/portal/offline/log-queue.ts`, mounted globally via
`<OfflineSync />` in `PortalShell`.

- **Single entry point**: every UI call site logs a prayer via `logPrayer(input: LogInput)`, never by calling `logPrayerAction` directly. `LogInput = {requestId, prayedOn?, prayedAt?, durationMinutes?, note?, voiceNotePath?}`.
- `logPrayer()` **always stamps** `prayedOn`/`prayedAt` at call time (`format(new Date(), 'yyyy-MM-dd'/'HH:mm')`) if not already provided — "so an offline log syncs with the moment it actually happened, not the moment connectivity returned."
- If `navigator.onLine` is false → immediately enqueue (skip the network attempt entirely) and return `{ok:true, queued:true}`.
- If online, calls `logPrayerAction(stamped)` directly; **a thrown exception** (not a returned `{error}` — that's a validation rejection, handled normally) is treated as a network failure mid-flight → falls back to enqueue.
- **Queue storage**: IndexedDB via `idb-keyval`, single key `pb-pending-logs`, value = array of `{id: uuid, input, queuedAt: timestamp}`. Write failures (e.g. private browsing) are swallowed — queue then lives in memory only for that session.
- **Pending count**: a tiny module-level pub/sub (`subscribePendingCount`/`getPendingCount`/`notify`) designed for React's `useSyncExternalStore` — this is what drives the "N logs will sync" badge.
- **Flush** (`flushPendingLogs`): single-flight (concurrent calls return the same in-flight promise). Processes the queue **FIFO** (sorted by `queuedAt`), one at a time: on server validation error (`{error}` returned) → **drop** that entry and count it as `dropped` (e.g. the target request was deleted meanwhile); on success → count as `synced`, remove from queue, persist the shrunk queue immediately (so a crash mid-flush doesn't re-send already-synced entries); on thrown exception (still offline) → **stop the loop**, leaving the remainder queued for the next trigger.
- **Triggers**: `<OfflineSync />` calls `flushPendingLogs()` on mount and on every `window online` event; on completion, toasts a success/warning summary and calls `router.refresh()` if anything synced (so newly-synced logs appear without a manual reload).
- **RN equivalent**: replace IndexedDB with AsyncStorage (or a small SQLite/MMKV store); replace `navigator.onLine`/`window online` with `@react-native-community/netinfo`; the FIFO-single-flight-drop-on-validation-error semantics should be preserved exactly, including the "stamp time at tap, not at sync" rule.

---

## 10. Notable Business Rules (non-obvious — read before implementing)

1. **A plan must reference exactly one of `request_id` / `category_id`** — enforced both by a Postgres `check (num_nonnulls(...) = 1)` constraint and by a zod `.refine()` in `createPlanAction`/`updatePlanAction`. There is no "no target" plan state.
2. **`days_of_week` normalization**: the app treats "all 7 days selected" identically to "no days selected" (both mean "any day"), and the plan-write layer collapses a full/empty selection to `null` before storing. Progress math (`dayEligible`) also treats `null`/empty as "any day". Reminders do **not** do this collapsing — `days_of_week` there requires ≥1 day and is stored as whatever subset was picked (a reminder with all 7 days is still stored as `[0,1,2,3,4,5,6]`, not `null`).
3. **Streak semantics**: the *current, still-incomplete* period never breaks a streak — it only extends it once met. This means a user who hasn't yet prayed today still sees yesterday's streak intact until the day fully elapses unmet.
4. **Adherence is null, not zero, when nothing was expected** in the window (e.g. a plan that started 2 days ago has `adherence30 = null` until at least one period was expected within the trailing 30 days) — the UI renders `—` for null vs `0%` for a true zero.
5. **Timezone handling is inconsistent between features**: the reminder cron job explicitly converts to the user's `portal_profiles.timezone` (default `Africa/Accra`) via `TZDate` to compute local occurrence times. The prayer-log write path (`logPrayerAction`/`logPrayer()`), however, stamps dates using the **device's local clock** (client-side `format(new Date(), ...)`) with no explicit timezone reconciliation against the profile setting — for a user whose device timezone differs from their configured portal timezone, "today" could disagree between the two. **AMBIGUOUS**: no code reconciles this; treat device-local time as authoritative for logging in the RN app too, matching current web behavior.
6. **AI suggestion rate limiting is a single global per-user cooldown** (`AI_COOLDOWN_SECONDS = 15`), keyed off `portal_profiles.last_ai_request_at`, updated **before** the Groq call is even made/completes (so a slow or failing generation still burns the cooldown window). It is not per-prayer-point.
7. **Reminder delivery is idempotent via a unique DB constraint**, not application-level locking: `unique(reminder_id, send_type, occurrence_at)` on `portal_reminder_sends`, claimed with `upsert(..., ignoreDuplicates: true)` — a zero-row response means "someone else already sent this", safe under concurrent/overlapping cron ticks.
8. **Deleting a category cascades to its prayer requests**, which cascades further to their scriptures and prayer logs, and to any plan whose `category_id` pointed at it. Deleting a request likewise cascades to its scriptures/logs and to any plan/reminder whose `request_id` pointed at it (a plan referencing a deleted request is **deleted outright**, since its FK constraint is `on delete cascade`, not `set null` — even though the column is nullable). **Deleting a plan never deletes prayer logs.**
9. **Scriptures per request are soft-capped at 15** (`MAX_SCRIPTURES_PER_REQUEST` in `actions/scriptures.ts`), checked at insert time against a live count — this is an application-level check, not a DB constraint, so it can theoretically be bypassed by concurrent inserts (no unique-count guarantee).
10. **`portal_profiles` rows are not created for every authenticated user** — the DB trigger `portal_handle_new_user` only fires a profile insert if `raw_user_meta_data` contains a `username` key at signup time. Google OAuth sign-ins arrive with no such key, so **every first-time Google sign-in lands with no profile row**, which is exactly what routes them to `/portal/welcome` to create one via `createProfileAction` (which inserts directly, bypassing the trigger's condition).
11. **Voice notes are preserved even when transcription fails.** The upload to Supabase Storage happens first and is treated as authoritative; a subsequent Groq failure returns HTTP 200 with an `error` field alongside the storage `path`, so the caller keeps the audio and lets the user type the text manually instead of losing the recording.
12. **The reminder cron job's own scheduling is not present in this codebase** — the route comment says it's "invoked every ~5 minutes... by Supabase pg_cron (or any external cron)", but no pg_cron migration/config was found in the repo. **AMBIGUOUS**: confirm with the user how (or whether) this is actually scheduled in production before assuming a specific interval for the RN/backend rebuild.
13. **Push subscriptions are per-device/per-endpoint, not per-user-singular** — a user can have many rows in `portal_push_subscriptions` (one per browser/device), and the cron job fans a reminder out to *all* of them plus SMS if opted in. The RN app's push-token storage should support the same one-to-many device model.
14. **"Uncategorized"/"(deleted)" fallbacks** appear in Analytics/Plans when a request's linked category or a plan's linked request/category no longer exists — but given the cascade rules in point 8, a request with a deleted category cannot actually exist (FK `not null`, cascades on delete), so in practice `"Uncategorized"` for a request is dead code / defensive-only; `"(deleted)"` for a plan's `targetName` is the real reachable case (nullable FK + no cascade needed there since the check constraint only requires exactly one target, and if that target row is hard-deleted the plan itself cascades away too — so this is **also likely unreachable in current schema**; investigate rather than assume before relying on it). **AMBIGUOUS**: worth a quick empirical check against a live DB before porting this fallback logic 1:1.
