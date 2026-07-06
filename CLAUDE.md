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

**Not yet done / needs dashboard access I don't have**: the Google OAuth
redirect URI for this Expo app (`Linking.createURL('auth/callback')` — differs
per environment: `exp://...` in Expo Go, `prayerbook://...` in a standalone/dev
build) must be added to the Supabase project's Auth → URL Configuration →
Redirect URLs allow-list before `signInWithGoogle()` will actually complete.
Untested end-to-end for that reason. Email/password dev login **is** verified
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

## Offline queue

`src/lib/portal/offline-queue.ts` ports the web app's `log-queue.ts` semantics
exactly (see PORTAL_SPEC.md §9): stamp time at tap not at sync, AsyncStorage
instead of IndexedDB, `@react-native-community/netinfo` instead of
`navigator.onLine`, FIFO single-flight flush, drop-on-validation-error,
stop-on-network-error. Always call `queueLogPrayer()`, never
`logPrayerAction()` directly, from UI code.

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

## Verified working end-to-end (2026-07-06, via chrome-devtools against the live DB)

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

Not yet exercised live (would need a real device or a configured Google OAuth
redirect): `signInWithGoogle()`, actual notification delivery (scheduling
code runs, but firing was not observed — would need to wait real-world
minutes/days on a device), AI scripture suggestions, voice-note recording,
SMS reminders.

## What's left

- **Google OAuth redirect URI** needs registering in the Supabase dashboard
  (see above) before `signInWithGoogle()` can complete — needs owner access
  to the Supabase project, which this session didn't have.
- **AI suggestions / voice transcription / SMS reminders** — all three live
  behind Next.js API routes in the web app (see PORTAL_SPEC.md §5-6), not raw
  Supabase, so they need `EXPO_PUBLIC_PORTAL_API_URL` pointed at a reachable
  deployment of that server (currently only `localhost:3000` in dev, not
  reachable from a phone). Request detail screen has no AI-suggestions panel
  or voice recorder yet — scriptures can only be added manually for now.
- **EAS build config** (`eas.json`) doesn't exist yet — needed before a real
  device/store build. No app icons/splash beyond the create-expo-app
  defaults — swap `assets/images/*` for real PrayerBook branding before
  shipping.
- **Confetti** is haptic-only (see `lib/portal/confetti.ts`) — a real
  particle burst would need a small canvas/SVG-based implementation (no
  direct RN equivalent to `canvas-confetti`).
- Chart x-axis labels on Analytics' 30/90-day views are cramped (every day
  gets a tiny label) — consider showing every Nth label instead of all of
  them.
- Test data exists in the shared `fsqpjdsvlvimbshacmqt` DB from this session's
  verification pass: user `martintest01` / category "Academics" / request
  "Peace during finals week" / plan "Daily peace" / reminder "Morning
  devotion". Harmless to leave or clean up.
