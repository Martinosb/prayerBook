import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { eachDayOfInterval, format, subDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { BarChart, HorizontalBarList } from "@/components/ui/BarChart";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill } from "@/components/ui/Pill";
import { PressableScale } from "@/components/ui/PressableScale";
import { describePlan } from "@/lib/portal/describe-plan";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { daysSince } from "@/lib/portal/progress";
import { getAnalyticsData, type AnalyticsData } from "@/lib/portal/queries";
import { colors, neglectColor, radius, spacing, typography } from "@/theme/tokens";

const RANGES = [7, 30, 90] as const;

export default function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);

  useEffect(() => {
    getAnalyticsData().then(setData);
  }, []);

  const inRange = useMemo(() => {
    if (!data) return [];
    const cutoff = format(subDays(new Date(), range - 1), "yyyy-MM-dd");
    return data.logs.filter((l) => l.prayedOn >= cutoff);
  }, [data, range]);

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (data.logs.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <MaterialCommunityIcons name="chart-line" size={32} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>No data yet</Text>
        <PressableScale onPress={() => router.push("/(app)/requests")}>
          <Text style={styles.emptyAction}>Log your first prayer →</Text>
        </PressableScale>
      </View>
    );
  }

  const sessions = inRange.length;
  const minutes = inRange.reduce((sum, l) => sum + (l.minutes ?? 0), 0);
  const daysActive = new Set(inRange.map((l) => l.prayedOn)).size;
  const bestStreak = data.plans.reduce((max, p) => Math.max(max, p.progress.streak), 0);

  const dailySeries = eachDayOfInterval({ start: subDays(new Date(), range - 1), end: new Date() }).map(
    (date) => {
      const key = format(date, "yyyy-MM-dd");
      const count = inRange.filter((l) => l.prayedOn === key).length;
      return { label: format(date, range <= 30 ? "EEE d" : "d MMM"), value: count };
    },
  );

  const byCategory = Object.entries(
    inRange.reduce<Record<string, { value: number; color: string }>>((acc, l) => {
      const key = l.categoryName;
      if (!acc[key]) acc[key] = { value: 0, color: l.categoryColor ?? colors.gold };
      acc[key].value += 1;
      return acc;
    }, {}),
  )
    .map(([label, v]) => ({ label, value: v.value, color: v.color }))
    .sort((a, b) => b.value - a.value);

  const byRequest = Object.entries(
    inRange.reduce<Record<string, number>>((acc, l) => {
      acc[l.requestTitle] = (acc[l.requestTitle] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const lagging = data.activeRequests
    .map((r) => ({ ...r, days: daysSince(r.lastPrayedOn) }))
    .filter((r) => r.days === null || r.days >= 3)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .slice(0, 6);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <PressableScale
              key={r}
              haptic="selection"
              onPress={() => setRange(r)}
              style={[styles.rangeTab, range === r && styles.rangeTabActive]}
            >
              <Text style={[styles.rangeLabel, range === r && styles.rangeLabelActive]}>{r}d</Text>
            </PressableScale>
          ))}
        </View>
      </View>

      <Animated.View entering={FadeInDown.duration(300)} style={styles.statsRow}>
        <StatTile label="Sessions" value={String(sessions)} />
        <StatTile label="Minutes" value={String(minutes)} hint={minutes === 0 ? "log durations to track" : undefined} />
        <StatTile label="Days active" value={String(daysActive)} />
        <StatTile label="Best streak" value={String(bestStreak)} icon={bestStreak > 1 ? "fire" : undefined} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <GlassCard>
          <Text style={styles.cardTitle}>Prayer sessions over time</Text>
          <BarChart data={dailySeries} />
        </GlassCard>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(120)}>
        <GlassCard>
          <Text style={styles.cardTitle}>Sessions by category</Text>
          <HorizontalBarList data={byCategory} />
        </GlassCard>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(180)}>
        <GlassCard>
          <Text style={styles.cardTitle}>Most prayed for</Text>
          <HorizontalBarList data={byRequest} />
        </GlassCard>
      </Animated.View>

      {data.plans.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(300).delay(240)}>
          <GlassCard style={{ gap: spacing.md }}>
            <Text style={styles.cardTitle}>Plan adherence (30 days)</Text>
            {data.plans.map((p) => (
              <View key={p.id} style={{ gap: 4 }}>
                <View style={styles.adherenceLabelRow}>
                  <Text style={styles.adherenceTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.adherenceValue}>
                    {p.progress.adherence30 === null ? "—" : `${Math.round(p.progress.adherence30 * 100)}%`}
                  </Text>
                </View>
                <Text style={styles.adherenceSubtitle} numberOfLines={1}>
                  {describePlan(p)}
                </Text>
                <ProgressBar progress={p.progress.adherence30 ?? 0} />
              </View>
            ))}
          </GlassCard>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(300).delay(300)}>
        <GlassCard style={{ gap: spacing.sm }}>
          <Text style={styles.cardTitle}>Lagging areas</Text>
          {lagging.length === 0 ? (
            <Text style={styles.emptyInlineText}>
              Nothing is lagging — every active prayer point has been prayed for in the last 3 days. 🎉
            </Text>
          ) : (
            lagging.map((r) => (
              <PressableScale
                key={r.id}
                onPress={() => router.push({ pathname: "/(app)/requests/[id]", params: { id: r.id } })}
                style={styles.laggingRow}
              >
                <View style={[styles.dot, { backgroundColor: r.categoryColor ?? colors.gold }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.laggingTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.laggingCategory}>{r.categoryName}</Text>
                </View>
                <Pill label={r.days === null ? "never prayed" : `${r.days}d ago`} color={neglectColor(r.days)} />
              </PressableScale>
            ))
          )}
        </GlassCard>
      </Animated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  return (
    <GlassCard style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statLabelRow}>
        {icon ? <MaterialCommunityIcons name={icon} size={12} color={colors.gold} /> : null}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  header: { gap: spacing.sm },
  title: { ...typography.title, color: colors.text },
  rangeRow: { flexDirection: "row", gap: spacing.sm },
  rangeTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  rangeTabActive: { backgroundColor: colors.gold },
  rangeLabel: { ...typography.caption, color: colors.textMuted, fontWeight: "600" },
  rangeLabelActive: { color: "#1a1200" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statTile: { flex: 1, padding: spacing.md, gap: 4 },
  statValue: { ...typography.heading, color: colors.text },
  statLabelRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  statLabel: { ...typography.tiny, color: colors.textMuted },
  statHint: { ...typography.tiny, color: colors.textFaint, fontSize: 9 },
  cardTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.md },
  adherenceLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  adherenceTitle: { ...typography.body, color: colors.text, fontWeight: "600", flex: 1 },
  adherenceValue: { ...typography.caption, color: colors.gold, fontWeight: "700" },
  adherenceSubtitle: { ...typography.tiny, color: colors.textMuted },
  laggingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  laggingTitle: { ...typography.body, color: colors.text },
  laggingCategory: { ...typography.tiny, color: colors.textMuted },
  emptyInlineText: { ...typography.caption, color: colors.textMuted },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyAction: { ...typography.caption, color: colors.goldSoft, fontWeight: "600" },
});
