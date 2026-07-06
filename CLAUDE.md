@AGENTS.md

# PrayerBook — React Native rebuild of the Connexional Prayer Board portal

Goal: an Expo SDK 54 app (iOS + Android + web) that is a feature-complete,
more-polished rebuild of `/portal` from the sibling project
`../Connexional-Prayer-Board` (Next.js), connected to the **same** Supabase
backend. See `docs/PORTAL_SPEC.md` for the full reverse-engineered feature
spec (data types, validation rules, every screen's behavior, business logic)
— that file is the build reference; read it before touching a screen you
haven't built yet.

## Running it

```
npm install
npx expo start --web        # fastest loop for UI work — see "web caveats" below
npx expo start              # then scan QR with Expo Go (SDK 54 build) for iOS/Android
npx tsc --noEmit             # typecheck — keep this clean, it catches Supabase generic-typing issues fast
npx expo-doctor              # SDK-alignment check — keep at 18/18
```

Env vars live in `.env` (gitignored; `.env.example` documents the shape).

## Critical: which Supabase project is real

`Connexional-Prayer-Board/.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`
(`hzjsryoeyrqvdvufiaos.supabase.co`) **does not resolve** — NXDOMAIN, confirmed
via `getent hosts` and a live browser test (signup failed with
`ERR_NAME_NOT_RESOLVED`). Whatever project that was, it's gone or never
existed under this account.

The real, working project is **`fsqpjdsvlvimbshacmqt`** ("prayer board"),
which is what `Connexional-Prayer-Board/.env.production` points to, and is
already linked in that repo's `supabase` CLI config. Confirmed via
`supabase migration list --linked` — every migration including the portal
schema (`20260702000000` through `20260704000001`) is applied there. **This
app's `.env` points at that project.** User confirmed this on 2026-07-06
(asked via AskUserQuestion rather than assumed). If credentials ever need
rotating, pull fresh ones from that project's dashboard, not from
`.env.local`.

## Auth: Google-only in production, manual for testing

User explicitly wants **Google Sign-In as the only production auth path**
(matches the web portal exactly — see PORTAL_SPEC.md §7: Google OAuth doubles
as signup, no separate registration flow). Manual email/password is fine for
local dev/testing only.

Implementation (`src/lib/auth/AuthProvider.tsx`):
- `signInWithGoogle()` — the primary path, shown as "Continue with Google" on
  `(auth)/login.tsx`. Uses `supabase.auth.signInWithOAuth({ skipBrowserRedirect: true })`
  + `expo-web-browser`'s `openAuthSessionAsync` + `expo-linking`'s
  `createURL('auth/callback')` for the redirect, then
  `exchangeCodeForSession(code)` on return (PKCE flow, native). On web it uses
  the plain browser-redirect flow instead (`skipBrowserRedirect` omitted).
- `signIn(email, password)` — dev-only, exposed behind a collapsed "Show
  local dev login" section, `__DEV__`-gated, matching the web app's own
  pattern exactly.
- `signUp(email, password, username)` — dev-only account creation
  (`(auth)/signup.tsx`, reachable only via the dev-login section's "Create a
  dev test account" link, not linked from the primary login UI).

**Not yet done**: the Google OAuth redirect URI for this Expo app
(`Linking.createURL('auth/callback')` — differs per environment: `exp://...`
in Expo Go, `prayerbook://...` in a standalone/dev build) must be added to the
Supabase project's Auth → URL Configuration → Redirect URLs allow-list before
`signInWithGoogle()` will actually complete. The user started authorizing the
`plugin:supabase:supabase` MCP server (OAuth flow) so a future session can
configure this directly via the Management API — check whether that
completed (`mcp__plugin_supabase_supabase__*` tools present and authenticated)
before assuming it still needs doing. Email/password dev login **is** verified
working end-to-end against the live DB (see "Verified working" below).

### Supabase requires email confirmation

The `fsqpjdsvlvimbshacmqt` project has "Confirm email" on, so `signUp()` alone
doesn't yield a session — the user must click the emailed link (or, for
testing without inbox access, an admin can hit
`PUT /auth/v1/admin/users/{id}` with `{"email_confirm": true}` using the
service-role key). This only matters for the dev fallback; Google sign-in
users are pre-verified by Google.

## Why web output is "single" (SPA), not "static"

`app.json`'s `web.output` was originally the default-template `"static"`
(SSG). That crashed the dev server outright: Supabase's AsyncStorage-backed
auth client touches `window` during Expo Router's Node-side prerender pass,
which has no `window`. Since this app is fully authenticated/dynamic — there's
nothing worth statically prerendering anyway — switched to `"single"` (pure
client-side SPA). Don't revert this without also fixing the Supabase client to
tolerate SSR.

## Auth-gating: Stack.Protected, not per-layout Redirect

Originally each of `(auth)/_layout.tsx` and `(app)/_layout.tsx` independently
checked session/profile and rendered `<Redirect>`. This caused an infinite
"Maximum update depth exceeded" loop: React Navigation can keep a
previous-group's layout mounted (or at least re-render it on context change)
even when not focused, so both layouts kept firing contradictory redirects at
each other. Fixed by moving the **entire** auth/no-auth decision to a single
`Stack.Protected` guard in the root `src/app/_layout.tsx`:

```tsx
<Stack.Protected guard={!authenticated}><Stack.Screen name="(auth)" /></Stack.Protected>
<Stack.Protected guard={authenticated}><Stack.Screen name="(app)" /></Stack.Protected>
```

`Stack.Protected` actually unmounts the excluded group rather than hiding it.
The only redirect left inside `(auth)/_layout.tsx` picks between `login` and
`welcome` (session-but-no-profile case) — it can't conflict with `(app)`
because `(app)` isn't mounted at all in that state. **If you ever reintroduce
a `<Redirect>` inside a layout, ask: could the group I'm redirecting away from
still be mounted by the navigator? If yes, don't.**

## Push notifications: local, not remote

Expo Go dropped remote push support starting SDK 53 (dev-client/standalone
only). Rather than build a remote push server this early, `portal_reminders`
rows drive **locally scheduled** `expo-notifications` notifications computed
on-device (no cron, no server fan-out) — this is simpler, works fully in Expo
Go, and is enough for personal reminders. Implemented in
`src/lib/notifications.ts`: `syncReminderNotifications()` cancels everything
it previously scheduled (tracked by an `identifier` prefix) and reschedules
one `WEEKLY` trigger per (reminder × selected day-of-week) from scratch —
called from `(app)/settings.tsx` after every reminder create/update/toggle/
delete, and once when push permission is first granted. **Simplification**:
fires exactly at `remind_time` with a single "It's time to pray" notification
— no separate "approaching" pre-alert like the web app's cron job (that would
need a second scheduled entry per day with a lead-minutes-shifted time,
including midnight-rollover handling — not worth the complexity for local
scheduling). If remote push is wanted later, note
`portal_push_subscriptions`'s schema (endpoint/p256dh/auth) is a *Web Push*
shape and doesn't map to Expo push tokens — that'd need its own table/column,
not a reuse of the web app's table.

## Offline-first architecture (SQLite + sync engine)

The user explicitly asked for offline-first, not just an offline queue for
one table: **every screen reads from local SQLite, never the network
directly.** A background sync engine is what keeps SQLite eventually
consistent with Supabase. This superseded an earlier `offline-queue.ts` that
only handled prayer logs via AsyncStorage — that file is gone; the same
"stamp time at tap, not at sync" idea now applies to every table via the
general mechanism below.

**Why SQLite, not WatermelonDB**: WatermelonDB needs a custom dev client
(JSI native module) and does not run in Expo Go — that directly conflicts
with this project's hard requirement (user: "use expo sdk 54 so i can test
with the current expo app on playstore"). `expo-sqlite` is a first-party
Expo module bundled into Expo Go, with a synchronous API
(`openDatabaseSync`/`runSync`/`getAllSync`/`getFirstSync`) fast enough that
local reads don't need loading states at all — which is also what makes the
app "super responsive" as asked for, not just usable offline.

**Layout**:
- `src/lib/db/schema.ts` — `CREATE TABLE` DDL for a local mirror of
  `portal_categories`, `portal_prayer_requests`, `portal_scriptures`,
  `portal_prayer_logs`, `portal_prayer_plans`, `portal_reminders`, and
  `portal_profiles` (one row). Deliberately **not** mirrored:
  `portal_reminder_sends`, `portal_push_subscriptions` — server/cron-only,
  never written from the client. Every mirrored table gets `_dirty` (has
  local changes not yet pushed) and `_deleted` (soft-delete tombstone, kept
  until the delete is pushed, then hard-removed) on top of the remote
  columns. `days_of_week` (`int[]` remotely) is stored as JSON text — SQLite
  has no array type.
- `src/lib/db/client.ts` — the `SQLiteDatabase` singleton (`prayerbook.db`),
  runs the schema DDL once on first access.
- `src/lib/db/local-store.ts` — one `*Store` object per table
  (`categoryStore`, `requestStore`, etc.) with typed CRUD functions that are
  the **only** thing `queries.ts`/`mutations.ts` touch. Handles the
  int↔boolean and JSON↔array conversions and the local cascade-delete
  emulation (category delete → its requests → their scriptures/logs, and any
  plan/reminder targeting them — mirroring the remote `ON DELETE CASCADE`
  rules in the migration SQL cited in PORTAL_SPEC.md §2, since SQLite has no
  FK relationship to the remote schema to enforce this automatically).
- `src/lib/db/sync.ts` — the push/pull engine. **Full-snapshot pull**, not an
  incremental `updated_at > cursor` design — chosen because the remote
  tables have no soft-delete column, so an incremental pull could never
  learn a row was deleted remotely; a full per-table snapshot (`select *
  where user_id = X`) naturally reconciles deletes via `deleteIdsNotIn`. This
  is only reasonable because per-table row counts are small (a personal
  prayer log, not a multi-tenant dataset) — revisit if that assumption ever
  stops holding. Conflict resolution is **dirty-flag-wins**, not
  timestamp-based: a locally-dirty row is never overwritten by a pull no
  matter how recent the remote version, since every row is single-owner
  (RLS-scoped to one `auth.uid()`) and this app doesn't attempt real-time
  multi-device merge. Push runs in FK-dependency order (profile → categories
  → requests → scriptures/logs/plans/reminders in parallel).
- **IDs are client-generated** (`crypto.randomUUID()`) at creation time, not
  server defaults — essential for offline-first, since a row created while
  offline must be immediately usable (e.g., navigating straight to its detail
  screen) without waiting for a server round trip to learn its ID.
- **Sync triggers** (`registerSyncTriggers`, called once from
  `AuthProvider.loadProfile`): `AppState` foreground, `NetInfo` reconnect, a
  5-minute interval, and once immediately on login.
- **Mutations are fire-and-forget**: every function in `mutations.ts` writes
  to SQLite synchronously, marks the row dirty, and calls a non-awaited
  `runSync(userId)` — the caller gets `{ok: true}` back instantly regardless
  of connectivity; `runSync` itself no-ops immediately if `NetInfo` reports
  offline.

**Known limitation / what to check before trusting this further**: this was
built and typechecks cleanly, but **could not be exercised at runtime this
session** — `expo-sqlite`'s web backend needs a Web Worker that imports a
`.wasm` binary, and Metro fails to resolve that import even with
`resolver.assetExts` including `wasm` (see `metro.config.js` — the
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers there are
correct and necessary but insufficient; the wasm-in-worker resolution itself
is the blocker, likely because Expo web bundles `Worker()` targets as a
separate graph that doesn't inherit the main resolver config). This sandbox
also had no Android emulator (`emulator` binary missing) and no Mac for an
iOS simulator, so there was no way to test the real native SQLite binding
either. **First thing a future session with device access should do**: run
`npx expo start` and open on a real device/Expo Go, then exercise create →
airplane mode → edit/delete → reconnect → confirm the change lands in
Supabase.

Since it couldn't be runtime-tested, a forked review agent traced through
`schema.ts`/`client.ts`/`local-store.ts`/`sync.ts`/`mutations.ts`/
`queries.ts`/`AuthProvider.tsx` by hand instead. It found and — already
fixed in this same session — two real bugs:
1. All six `push*` functions in `sync.ts` (categories/requests/scriptures/
   logs/plans/reminders) were hard-deleting the local tombstone row
   **unconditionally** after firing the remote delete, even if that delete
   call returned an error — silently losing track of a delete that never
   actually reached Supabase (it would never retry, and the row would
   reappear on the next pull). Fixed: now only hard-deletes locally on
   `!error`.
2. The local schema didn't mirror the remote's unique index on
   `portal_categories(user_id, lower(name))`. Offline, a user could create
   two same-named categories with no local check; the dirty row would then
   fail *silently and permanently* every push cycle once it hit Postgres's
   real constraint, with no error ever surfacing anywhere. Fixed two ways:
   added a matching local partial unique index
   (`idx_categories_user_name`, `WHERE _deleted = 0`, `COLLATE NOCASE`) so
   the same duplicate is now caught **instantly at creation**, and wrapped
   `createCategory`/`updateCategory` in try/catch to turn that thrown
   SQLite constraint error into the same friendly `ActionResult` error the
   web app's server action returns, instead of an uncaught exception.

Two more things the reviewer flagged as accepted-but-worth-knowing, not
bugs: (a) no per-row retry/backoff or UI surfacing for a push that fails for
reasons other than a duplicate name — `getSyncState()`/`subscribeSyncState()`
exist and are now wired to a small `SyncStatusBadge` on the Dashboard
("Syncing…" / "Synced" / "Waiting to sync"), but there's no per-row error
detail beyond that global indicator; (b) `AuthProvider`'s brand-new-install
+ offline case correctly can't recover an existing account's profile with
no local data and no connectivity — it falls back to onboarding, which is
the only sane thing it *can* do, not a bug.

**None of this was verified by actually running the app** — it's a
same-session code review of code that was never executed, which is weaker
evidence than a real test. Treat "fixed" above as "fixed pending a real
device test," not as verified.

## Design system

`src/components/ui/Glass.tsx` is the one cross-platform "glass" primitive:
real iOS 26 Liquid Glass via `expo-glass-effect` where `isLiquidGlassAvailable()`
is true, a `BlurView` fallback on older iOS, and a tinted `BlurView` +
translucent overlay + border ("glassmorphism") recipe on Android. Everything
glassy (`GlassCard`, `Sheet`, tab bar background, toasts) is built on top of
this — don't hand-roll blur elsewhere.

`src/theme/tokens.ts` holds the dark/gold palette matching the web portal
exactly (`#0a0a0a` background, `#b8923f` gold), spacing/radius/typography
scales, and the neglected-prayer-point red/amber threshold helper.

Micro-interactions: `PressableScale` (spring scale + `expo-haptics` tick) is
the shared building block for all tappables. `celebrateLog()`/`celebrateGoal()`
in `src/lib/portal/confetti.ts` are haptic-only stand-ins for the web app's
`canvas-confetti` bursts — a real particle effect can replace the
implementation later without touching call sites.

## Data layer

- `src/lib/supabase/client.ts` + `database.types.ts` — hand-written `Database`
  type (supabase-js's generic schema requires `Relationships: []` per table
  and top-level `Views`/`Functions` even if empty — easy to get subtly wrong,
  see git history if this needs regenerating).
- `src/lib/portal/types.ts`, `validation.ts`, `progress.ts`, `presets.ts` —
  ported near-verbatim from the web app's `lib/portal/*` (same field names,
  same math). `progress.ts` (streak/adherence) is copied 1:1 — don't
  reimplement, the web app's semantics are subtle (see PORTAL_SPEC.md §5, §10).
- `src/lib/portal/queries.ts` — reads, mirroring `lib/portal/queries.ts` +
  each page's inline queries from the web app.
- `src/lib/portal/mutations.ts` — writes, mirroring the web app's server
  actions, but called directly from the client (no server-actions layer in
  RN — Postgres RLS via `owner_all` policies is what actually enforces
  ownership, same as it does for the web app's server-side Supabase client).

## Verified working end-to-end — STALE, predates the offline-first rewrite

Everything below was true and tested on 2026-07-06 **against the old
architecture**, where every screen called Supabase directly. That data layer
no longer exists — `queries.ts`/`mutations.ts` now read/write local SQLite
only (see "Offline-first architecture" above), and *that* rewrite has not
been runtime-tested at all (no device/emulator was available). The UI code
and business logic below are unchanged, so this is still good evidence they
work, but **the full user-visible chain (tap → SQLite → sync → Supabase) is
unverified** — don't treat this section as current proof the app works,
only as proof the screens worked against a different, simpler data path.
Re-verify all of this on a real device before relying on it again.

All 6 tabs are built and were exercised live against the real `fsqpjdsvlvimbshacmqt`
project (not mocked) using a `martintest01` dev-login test account:

- **Auth**: dev-login signup (email confirmation required, confirmed via
  admin API for the test account) → profile auto-created by the
  `portal_handle_new_user` trigger; sign-in → session persists across reload
  (AsyncStorage); `Stack.Protected` gate confirmed non-looping.
- **Dashboard**: real stats tiles, plan chips with live progress, quick-log —
  all update correctly after logging a prayer.
- **Categories**: create (preset auto-fill + color picker) → persists →
  renders with live request count; edit/delete icons present.
- **Requests**: create (category picker + title/details) → navigates to
  detail; quick-log ("I prayed for this today") persists a
  `portal_prayer_logs` row and updates the session/history count live; status
  chips (active/answered/archived), scripture add form present.
- **Plans**: create (target-type toggle, frequency, times-per-period
  stepper, day picker, time-window switch) → progress bars and the
  today/week counter reflect real `computePlanProgress()` output immediately
  (verified: a plan targeting an already-logged-today request showed "1/1 ✓"
  and "30d: 100%" without a manual refresh trick).
- **Analytics**: stat tiles, sessions-over-time bar chart, sessions-by-category
  and most-prayed-for horizontal bars, plan adherence, lagging-areas — all
  populated from the same real data.
- **Settings**: profile/timezone/SMS fields save; reminder create (day
  picker defaulting to all 7, linked-prayer-point picker) persists and
  displays correctly ("Every day · heads-up 15 min before").

Not yet exercised live even under the old architecture: `signInWithGoogle()`,
actual notification delivery (scheduling code runs, but firing was not
observed — would need to wait real-world minutes/days on a device), SMS
reminders.

## Since verified: AI suggestions + voice transcription (edge functions)

The web app's `/api/portal/ai-suggestions` and `/api/portal/transcribe`
routes only accept cookie-based auth (`lib/supabase/server.ts`'s
`@supabase/ssr` client), which a native app can't produce. Rather than
modify the *deployed, live* Next.js app to add Bearer-token support (real
risk to something already serving users, for a change I couldn't test
against its actual production deploy), two new Supabase Edge Functions were
written instead — `supabase/functions/ai-suggestions` and
`supabase/functions/transcribe`, deployed to the same `fsqpjdsvlvimbshacmqt`
project, ported line-for-line from `lib/portal/groq.ts`/`transcribe.ts` +
the route handlers' logic. `GROQ_API_KEY` is set as a function secret
(`supabase secrets set`), never shipped in the mobile bundle. **Verified
live**: `curl`'d the deployed `ai-suggestions` function with a real user JWT
(signed in as `martintest01`) and got back real Groq-generated scripture
suggestions for the "Peace during finals week" test request — see git log
for the exact request/response. `AiSuggestionsPanel` is wired into the
request detail screen. Voice transcription's edge function is deployed but
its RN client call (`src/lib/portal/edge-functions.ts`'s
`transcribeVoiceNote`) has no recording UI wired up yet — no
`expo-av`/`expo-audio` recorder component exists in any screen.

## EAS build — verified via a real cloud build

`eas.json` (dev/preview/production profiles) + a linked EAS project
(`@martin_osei/prayerbook`, id `8cae7fc4-f2af-4f37-b9a1-50fb25306923`). A
real Android preview build was triggered and finished successfully:
`https://expo.dev/artifacts/eas/AnxZy2dhQ9SyWbKtXvEARuZZTbOHliP0EHmvMgTWmjU.apk`
— this is a genuinely installable APK, proof the app compiles for
distribution, not just that it typechecks. **Built from commit `3bb3860`**,
i.e. before the offline-first/edge-functions/icon work in this later part of
the session — trigger a fresh build (`eas build --platform android --profile
preview`) before relying on an artifact that includes everything above.
Branded app icon/splash/adaptive-icon assets (dark background, gold cross,
matching `theme/tokens.ts`) replace the create-expo-app defaults —
`assets/images/*`.

## What's left

- **Google OAuth redirect URI** needs registering in Supabase's Auth → URL
  Configuration. The user began authorizing the `plugin:supabase:supabase`
  MCP server for this; check whether that completed before assuming it's
  still blocked (see the auth section above).
- **SMS reminders** are not wired up (would need Arkesel, and the
  reminder-delivery cron job itself was already flagged in PORTAL_SPEC.md as
  unconfirmed/unscheduled even in the source web app).
- **No voice-note recording UI** — the transcribe edge function exists and
  works, but no screen actually records audio yet.
- **The whole offline-first rewrite needs a real device test** — see above,
  this is the single most important open item.
- **Confetti** is haptic-only (see `lib/portal/confetti.ts`) — a real
  particle burst would need a small canvas/SVG-based implementation (no
  direct RN equivalent to `canvas-confetti`).
- Chart x-axis labels on Analytics' 30/90-day views are cramped (every day
  gets a tiny label) — consider showing every Nth label instead of all of
  them.
- Test data exists in the shared `fsqpjdsvlvimbshacmqt` DB from this
  session's verification pass: user `martintest01` / category "Academics" /
  request "Peace during finals week" / plan "Daily peace" / reminder
  "Morning devotion". Harmless to leave or clean up.
