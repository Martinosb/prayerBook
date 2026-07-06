import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "../supabase/client";
import { registerSyncTriggers, runSync } from "../db/sync";
import { getProfile } from "../portal/queries";
import { createProfile } from "../portal/mutations";
import type { Profile } from "../portal/types";

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Production sign-in path — matches the web portal (Google-only, doubles as signup). */
  signInWithGoogle: () => Promise<{ error?: string }>;
  /** Dev/testing convenience only — not exposed as a primary UI path. */
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    username: string,
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Local-first with a network fallback: returning users on a device that
  // already has data get an instant profile from SQLite with no network
  // wait. A brand-new install (or a different device) has nothing locally
  // yet, so — only in that case — we block on one sync cycle to pull the
  // existing profile down before concluding the user needs onboarding.
  // Also (re-)registers the background sync triggers (foreground/
  // reconnect/periodic) every time a session is confirmed.
  async function loadProfile(userId: string) {
    let p = getProfile(userId);
    if (!p) {
      await runSync(userId);
      p = getProfile(userId);
    }
    setProfile(p);
    registerSyncTriggers(userId);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user) {
          await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      async signInWithGoogle() {
        const redirectTo = Linking.createURL("auth/callback");

        if (Platform.OS === "web") {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo },
          });
          return error ? { error: error.message } : {};
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) return { error: error.message };
        if (!data.url) return { error: "Could not start Google sign-in" };

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== "success" || !result.url) {
          return result.type === "cancel" || result.type === "dismiss"
            ? {}
            : { error: "Google sign-in didn't complete" };
        }

        const { queryParams } = Linking.parse(result.url);
        const code = queryParams?.code;
        if (typeof code !== "string") {
          return { error: "Sign-in didn't return the expected response" };
        }

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        return exchangeError ? { error: exchangeError.message } : {};
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      async signUp(email, password, username) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) return { error: error.message };

        // The DB trigger (portal_handle_new_user) auto-creates the profile
        // row when raw_user_meta_data has a `username` key — but if email
        // confirmation is required there's no session yet to retry against,
        // and if the trigger's insert ever loses a race (case-insensitive
        // uniqueness), fall back to an explicit insert. Sync first so the
        // "does it exist" check is against the remote truth, not the (as
        // yet unsynced) local DB — otherwise this always looks like a
        // fresh profile and re-inserts into a row the trigger already made.
        if (data.user && data.session) {
          await runSync(data.user.id);
          const existing = getProfile(data.user.id);
          if (!existing) {
            const result = await createProfile(data.user.id, email, username);
            if ("error" in result) return { error: result.error };
          }
          await loadProfile(data.user.id);
        }
        return {};
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async refreshProfile() {
        if (session?.user) await loadProfile(session.user.id);
      },
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
