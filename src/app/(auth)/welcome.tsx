import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AuthBackground } from "@/components/ui/AuthBackground";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import { checkUsernameAvailable, createProfile } from "@/lib/portal/mutations";
import { usernameSchema } from "@/lib/portal/validation";
import { colors, spacing, typography } from "@/theme/tokens";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function WelcomeScreen() {
  const { user, refreshProfile } = useAuth();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!username) {
      setStatus("idle");
      return;
    }
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    const handle = setTimeout(async () => {
      const available = await checkUsernameAvailable(username);
      setStatus(available ? "available" : "taken");
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

  async function handleSubmit() {
    if (!user) return;
    setError(null);
    setLoading(true);
    const result = await createProfile(user.id, user.email ?? "", username.trim().toLowerCase());
    setLoading(false);
    if ("error" in result) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error);
      return;
    }
    await refreshProfile();
  }

  return (
    <AuthBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Text style={styles.title}>Welcome!</Text>
            <Text style={styles.subtitle}>Pick a username to finish setting up your account.</Text>
          </Animated.View>

          <View style={styles.form}>
            <Input
              placeholder="Username"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              value={username}
              onChangeText={setUsername}
            />
            <UsernameHint status={status} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              onPress={handleSubmit}
              disabled={status !== "available" || loading}
              loading={loading}
              fullWidth
            >
              Continue
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

function UsernameHint({ status }: { status: UsernameStatus }) {
  if (status === "idle") return null;
  const copy: Record<Exclude<UsernameStatus, "idle">, string> = {
    checking: "Checking availability…",
    available: "Username is available",
    taken: "That username is already taken",
    invalid: "3–20 characters: lowercase letters, numbers, underscores",
  };
  const color =
    status === "available" ? colors.success : status === "checking" ? colors.textMuted : colors.danger;

  return (
    <View style={styles.hintRow}>
      {status === "checking" ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      <Text style={[styles.hint, { color }]}>{copy[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.xxl,
  },
  header: {
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    ...typography.display,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  form: {
    gap: spacing.md,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  hint: {
    ...typography.tiny,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
