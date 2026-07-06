import { Link } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { AuthBackground } from "@/components/ui/AuthBackground";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import { checkUsernameAvailable } from "@/lib/portal/mutations";
import { usernameSchema } from "@/lib/portal/validation";
import { colors, spacing, typography } from "@/theme/tokens";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const canSubmit =
    email && password.length >= 6 && (status === "available" || status === "idle");

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const result = await signUp(email.trim(), password, username.trim().toLowerCase());
    setLoading(false);
    if (result.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error);
    }
  }

  return (
    <AuthBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Text style={styles.wordmark}>Connexional Prayer Board</Text>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Start tracking what you're praying for</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.form}>
            <View>
              <Input
                placeholder="Username"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />
              <UsernameHint status={status} />
            </View>
            <Input
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              placeholder="Password (min. 6 characters)"
              secureTextEntry
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button onPress={handleSubmit} disabled={!canSubmit} loading={loading} fullWidth>
              Create account
            </Button>
          </Animated.View>

          <Animated.View entering={FadeIn.duration(500).delay(200)} style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Link href="/(auth)/login" replace asChild>
              <Text style={styles.footerLink}> Sign in</Text>
            </Link>
          </Animated.View>
        </ScrollView>
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
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.xxl,
  },
  header: {
    alignItems: "center",
    gap: spacing.xs,
  },
  wordmark: {
    ...typography.caption,
    color: colors.gold,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: "center",
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    ...typography.body,
    color: colors.textMuted,
  },
  footerLink: {
    ...typography.body,
    color: colors.goldSoft,
    fontWeight: "600",
  },
});
