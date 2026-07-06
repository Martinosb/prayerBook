# PrayerBook

A React Native (Expo SDK 54) mobile app for the Connexional Prayer Board's
personal prayer-tracking portal — categories, prayer points, recurring
prayer plans, analytics, and reminders, connected to the same Supabase
backend as the web app at `../Connexional-Prayer-Board`.

See `CLAUDE.md` for architecture decisions, gotchas, and what's left to
build, and `docs/PORTAL_SPEC.md` for the full feature spec this app is
built against.

## Get started

```bash
npm install
cp .env.example .env   # fill in Supabase URL/anon key — see CLAUDE.md
npx expo start --web   # fastest loop for UI work
npx expo start         # then scan with Expo Go (SDK 54) for iOS/Android
```

## Design

iOS gets real Liquid Glass (`expo-glass-effect`) where available; Android
gets a glassmorphism blur recipe. Dark, gold-accented theme matching the web
portal. See `src/components/ui/Glass.tsx` and `src/theme/tokens.ts`.
