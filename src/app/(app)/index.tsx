import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlassCard } from "@/components/ui/GlassCard";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Pill } from "@/components/ui/Pill";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { celebrateGoal, celebrateLog } from "@/lib/portal/confetti";
import { logPrayer } from "@/lib/portal/mutations";
import { daysSince } from "@/lib/portal/progress";
import { getDashboardData, type DashboardData } from "@/lib/portal/queries";
import { colors, neglectColor, radius, spacing, typography } from "@/theme/tokens";

function greeting(): { text: string; icon: keyof typeof MaterialCommunityIcons.glyphMap } {
  const hour = new Date().getHours();
  if (hour < 5) return { text: "Praying late", icon: "moon-waning-crescent" };
  if (hour < 12) return { text: "Good morning", icon: "weather-sunset-up" };
  if (hour < 17) return { text: "Good afternoon", icon: "white-balance-sunny" };
  return { text: "Good evening", icon: "weather-sunset-down" };
}

export default function DashboardScreen() {
  const { user, profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const result = await getDashboardData(user.id);
    setData(result);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleQuickLog(requestId: string, isGoalCompletingPlan = false) {
    if (!user) return;
    setLoggingId(requestId);
    const result = logPrayer(user.id, { requestId });
    setLoggingId(null);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    if (isGoalCompletingPlan) {
      celebrateGoal();
    } else {
      celebrateLog();
    }
    showToast("Prayer logged 🙏", "success");
    load();
  }

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const { plans, requests, stats, profile: profileData } = data;
  const g = greeting();

  const todaysPlans = plans.filter((p) => p.progress.currentPeriodTarget > 0);
  const needsAttention = requests
    .map((r) => ({ ...r, days: daysSince(r.lastPrayedOn) }))
    .filter((r) => r.days === null || r.days >= 3)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .slice(0, 3);
  const quickLogList = requests.slice(0, 6);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />}
    >
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <View style={styles.greetingRow}>
          <MaterialCommunityIcons name={g.icon} size={22} color={colors.gold} />
          <Text style={styles.greeting}>{g.text}</Text>
        </View>
        <View style={styles.usernameRow}>
          <Text style={styles.username}>@{profile?.username ?? profileData?.username}</Text>
          <SyncStatusBadge />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(60)} style={styles.statsRow}>
        <StatTile label="Today" value={stats.sessionsToday} />
        <StatTile label="This week" value={stats.sessionsThisWeek} />
        <StatTile label="All time" value={stats.totalSessions} />
        <StatTile
          label="Best streak"
          value={stats.bestStreak}
          suffix={stats.bestStreak === 1 ? "period" : "periods"}
          icon={stats.bestStreak > 1 ? "fire" : undefined}
        />
      </Animated.View>

      <Section title="Today's plans" delay={120}>
        {todaysPlans.length === 0 ? (
          <EmptyCard
            icon="calendar-check"
            text="No plan targets today."
            actionLabel="Create a plan"
            onPress={() => router.push("/(app)/plans")}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {todaysPlans.map((plan) => {
              const done = plan.progress.currentPeriodDone;
              const target = plan.progress.currentPeriodTarget;
              const complete = done >= target;
              return (
                <GlassCard key={plan.id} style={styles.planChip}>
                  <View style={styles.planChipHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planTitle} numberOfLines={1}>
                        {plan.title}
                      </Text>
                      <Text style={styles.planTarget} numberOfLines={1}>
                        {plan.targetName}
                      </Text>
                    </View>
                    <Text style={styles.planCounter}>
                      {done}/{target}
                    </Text>
                  </View>
                  <ProgressBar progress={target > 0 ? done / target : 0} />
                  {plan.request_id && !complete ? (
                    <PressableScale
                      onPress={() => handleQuickLog(plan.request_id!, done + 1 >= target)}
                      disabled={loggingId === plan.request_id}
                      style={styles.prayButton}
                    >
                      <Text style={styles.prayButtonText}>
                        {loggingId === plan.request_id ? "Logging…" : "Pray ✓"}
                      </Text>
                    </PressableScale>
                  ) : !plan.request_id ? (
                    <PressableScale
                      onPress={() =>
                        router.push({ pathname: "/(app)/requests", params: { category: plan.category_id ?? "" } })
                      }
                      style={styles.openButton}
                    >
                      <Text style={styles.openButtonText}>Open</Text>
                    </PressableScale>
                  ) : null}
                </GlassCard>
              );
            })}
          </View>
        )}
      </Section>

      {needsAttention.length > 0 ? (
        <Section title="Needs your attention" delay={180}>
          <GlassCard style={{ gap: spacing.md }}>
            {needsAttention.map((r) => (
              <PressableScale
                key={r.id}
                onPress={() => router.push({ pathname: "/(app)/requests/[id]", params: { id: r.id } })}
                style={styles.attentionRow}
              >
                <View style={[styles.dot, { backgroundColor: r.categoryColor ?? colors.gold }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.attentionTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.attentionCategory} numberOfLines={1}>
                    {r.categoryName}
                  </Text>
                </View>
                <Pill
                  label={r.days === null ? "never prayed" : `${r.days}d ago`}
                  color={neglectColor(r.days)}
                />
              </PressableScale>
            ))}
          </GlassCard>
        </Section>
      ) : null}

      <Section title="Quick log" delay={240}>
        {quickLogList.length === 0 ? (
          <EmptyCard
            icon="hand-heart"
            text="Set up your first prayer point to start logging."
            actionLabel="Get started"
            onPress={() => router.push("/(app)/categories")}
          />
        ) : (
          <GlassCard style={{ gap: spacing.md }}>
            {quickLogList.map((r) => (
              <View key={r.id} style={styles.quickLogRow}>
                <View style={[styles.dot, { backgroundColor: r.categoryColor ?? colors.gold }]} />
                <Text style={styles.quickLogTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <PressableScale
                  onPress={() => handleQuickLog(r.id)}
                  disabled={loggingId === r.id}
                  style={styles.quickLogButton}
                >
                  <MaterialCommunityIcons
                    name={loggingId === r.id ? "loading" : "check"}
                    size={16}
                    color={colors.gold}
                  />
                </PressableScale>
              </View>
            ))}
          </GlassCard>
        )}
      </Section>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  return (
    <GlassCard style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statLabelRow}>
        {icon ? <MaterialCommunityIcons name={icon} size={12} color={colors.gold} /> : null}
        <Text style={styles.statLabel}>
          {label}
          {suffix ? ` ${suffix}` : ""}
        </Text>
      </View>
    </GlassCard>
  );
}

function Section({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)} style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Animated.View>
  );
}

function EmptyCard({
  icon,
  text,
  actionLabel,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <MaterialCommunityIcons name={icon} size={28} color={colors.textFaint} />
      <Text style={styles.emptyText}>{text}</Text>
      <PressableScale onPress={onPress}>
        <Text style={styles.emptyAction}>{actionLabel} →</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  header: {
    gap: 2,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  greeting: {
    ...typography.title,
    color: colors.text,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  username: {
    ...typography.body,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  statValue: {
    ...typography.title,
    color: colors.text,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  planChip: {
    gap: spacing.sm,
  },
  planChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  planTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.text,
  },
  planTarget: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  planCounter: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: "700",
  },
  prayButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  prayButtonText: {
    ...typography.caption,
    fontWeight: "700",
    color: "#1a1200",
  },
  openButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  openButtonText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.goldSoft,
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  attentionTitle: {
    ...typography.body,
    color: colors.text,
  },
  attentionCategory: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  quickLogRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  quickLogTitle: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  quickLogButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
  emptyAction: {
    ...typography.caption,
    color: colors.goldSoft,
    fontWeight: "600",
  },
});
