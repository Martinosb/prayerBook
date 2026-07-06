import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { useAuth } from "@/lib/auth/AuthProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function SettingsScreen() {
  const { profile, user, signOut } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <GlassCard style={{ gap: spacing.sm }}>
        <Row label="Username" value={`@${profile?.username ?? ""}`} />
        <Row label="Email" value={user?.email ?? ""} />
        <Row label="Timezone" value={profile?.timezone ?? "Africa/Accra"} />
      </GlassCard>

      <Text style={styles.note}>
        Reminders, SMS backup and push-notification preferences are coming soon here.
      </Text>

      <Button variant="danger" onPress={signOut} fullWidth>
        Sign out
      </Button>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: 120,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  note: {
    ...typography.caption,
    color: colors.textFaint,
  },
});
