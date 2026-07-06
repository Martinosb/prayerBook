import { Link } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
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
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAuth } from "@/lib/auth/AuthProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error);
    }
  }

  return (
    <AuthBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Text style={styles.wordmark}>Connexional Prayer Board</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Your personal prayer companion</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.form}>
            <Button onPress={handleGoogleSignIn} loading={loading} fullWidth>
              <View style={styles.googleRow}>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleLabel}>Continue with Google</Text>
              </View>
            </Button>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.footnote}>
              First time here? Signing in creates your account automatically.
            </Text>
          </Animated.View>

          {__DEV__ ? (
            <Animated.View entering={FadeIn.duration(400).delay(200)} style={{ gap: spacing.sm }}>
              <PressableScale onPress={() => setShowDevLogin((v) => !v)} haptic="selection">
                <Text style={styles.devToggle}>
                  {showDevLogin ? "Hide" : "Show"} local dev login (email + password)
                </Text>
              </PressableScale>
              {showDevLogin ? <DevLogin /> : null}
            </Animated.View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

function DevLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <GlassCard style={{ gap: spacing.md }}>
      <Input
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button variant="glass" onPress={handleSubmit} disabled={!email || !password} loading={loading} fullWidth>
        Sign in (dev)
      </Button>
      <Link href="/(auth)/signup" asChild>
        <Text style={styles.devLink}>Create a dev test account →</Text>
      </Link>
    </GlassCard>
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
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  form: {
    gap: spacing.md,
  },
  googleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  googleG: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a1200",
  },
  googleLabel: {
    ...typography.heading,
    color: "#1a1200",
  },
  footnote: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: "center",
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  devToggle: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: "center",
    textDecorationLine: "underline",
  },
  devLink: {
    ...typography.tiny,
    color: colors.goldSoft,
    textAlign: "center",
  },
});
