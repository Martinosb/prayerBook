import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * The root layout's Stack.Protected guard is the single source of truth for
 * whether this group is reachable at all (see src/app/_layout.tsx) — it only
 * mounts when there's no session, or there's a session but no profile yet.
 * The only decision left to make here is which of those two sub-cases we're
 * in, so there's no contradictory redirect for (app)'s layout to fight with.
 */
export default function AuthLayout() {
  const { session, profile } = useAuth();

  if (session && !profile) return <Redirect href="/(auth)/welcome" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
