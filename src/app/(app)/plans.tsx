import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Sheet } from "@/components/ui/Sheet";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { describePlan } from "@/lib/portal/describe-plan";
import { createPlan, deletePlan, togglePlan, updatePlan, type PlanInput } from "@/lib/portal/mutations";
import { getPlansScreenData, type PlansScreenData } from "@/lib/portal/queries";
import type { PlanWithProgress } from "@/lib/portal/types";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function PlansScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<PlansScreenData | null>(null);
  const [editing, setEditing] = useState<PlanWithProgress | "new" | null>(null);
  const [deleting, setDeleting] = useState<PlanWithProgress | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setData(getPlansScreenData(user.id));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const hasTargets = data.categories.length > 0 || data.activeRequests.length > 0;

  function handleToggle(plan: PlanWithProgress) {
    if (!user) return;
    const result = togglePlan(user.id, plan.id, !plan.is_active);
    if ("error" in result) showToast(result.error, "error");
    load();
  }

  function handleDelete() {
    if (!deleting || !user) return;
    const result = deletePlan(user.id, deleting.id);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast("Plan deleted", "success");
    setDeleting(null);
    load();
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Prayer Plans</Text>
          <Button variant="glass" onPress={() => setEditing("new")} disabled={!hasTargets}>
            + New plan
          </Button>
        </View>

        {data.plans.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="calendar-check" size={32} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>No plans yet</Text>
            <Text style={styles.emptyText}>
              {hasTargets
                ? "Set a recurring rhythm for a prayer point or category."
                : "Create a category and a prayer point first."}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {data.plans.map((plan, i) => (
              <Animated.View key={plan.id} entering={FadeInDown.duration(300).delay(i * 50)}>
                <PlanCard
                  plan={plan}
                  onToggle={() => handleToggle(plan)}
                  onEdit={() => setEditing(plan)}
                  onDelete={() => setDeleting(plan)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <PlanEditor
        visible={editing !== null}
        plan={editing === "new" ? null : editing}
        categories={data.categories}
        requests={data.activeRequests}
        userId={user?.id ?? ""}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <Sheet visible={deleting !== null} onClose={() => setDeleting(null)}>
        <Text style={styles.sheetTitle}>Delete "{deleting?.title}"?</Text>
        <Text style={styles.sheetBody}>
          Your prayer logs are kept — only the plan and its progress tracking are removed.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button variant="glass" onPress={() => setDeleting(null)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onPress={handleDelete} style={{ flex: 1 }}>
            Delete
          </Button>
        </View>
      </Sheet>
    </View>
  );
}

function PlanCard({
  plan,
  onToggle,
  onEdit,
  onDelete,
}: {
  plan: PlanWithProgress;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { progress } = plan;
  const periodLabel = plan.frequency === "daily" ? "Today" : "This week";

  return (
    <GlassCard style={[{ gap: spacing.sm }, !plan.is_active && styles.inactiveCard]}>
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {plan.title}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {plan.targetName} · {describePlan(plan)}
          </Text>
        </View>
        {progress.streak > 1 ? (
          <View style={styles.streakBadge}>
            <MaterialCommunityIcons name="fire" size={12} color={colors.warning} />
            <Text style={styles.streakText}>{progress.streak}</Text>
          </View>
        ) : null}
        <Switch value={plan.is_active} onValueChange={onToggle} trackColor={{ true: colors.gold }} />
      </View>

      {plan.is_active ? (
        <>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {periodLabel}: {progress.currentPeriodTarget === 0
                ? "No target today"
                : `${progress.currentPeriodDone}/${progress.currentPeriodTarget}${progress.currentPeriodDone >= progress.currentPeriodTarget ? " ✓" : ""}`}
            </Text>
            <Text style={styles.progressLabel}>
              30d: {progress.adherence30 === null ? "—" : `${Math.round(progress.adherence30 * 100)}%`}
            </Text>
          </View>
          <ProgressBar progress={progress.adherence30 ?? 0} />
        </>
      ) : null}

      <View style={styles.cardActions}>
        <PressableScale onPress={onEdit} haptic="selection">
          <MaterialCommunityIcons name="pencil" size={16} color={colors.textMuted} />
        </PressableScale>
        <PressableScale onPress={onDelete} haptic="selection">
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
        </PressableScale>
      </View>
    </GlassCard>
  );
}

function PlanEditor({
  visible,
  plan,
  categories,
  requests,
  userId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  plan: PlanWithProgress | null;
  categories: PlansScreenData["categories"];
  requests: PlansScreenData["activeRequests"];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targetType, setTargetType] = useState<"request" | "category">("request");
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [timesPerPeriod, setTimesPerPeriod] = useState(1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [useWindow, setUseWindow] = useState(false);
  const [windowStart, setWindowStart] = useState("06:00");
  const [windowEnd, setWindowEnd] = useState("07:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (plan) {
      setTargetType(plan.category_id ? "category" : "request");
      setTargetId(plan.category_id ?? plan.request_id ?? undefined);
      setTitle(plan.title);
      setFrequency(plan.frequency);
      setTimesPerPeriod(plan.times_per_period);
      setDaysOfWeek(plan.days_of_week ?? []);
      setUseWindow(!!(plan.window_start && plan.window_end));
      setWindowStart(plan.window_start?.slice(0, 5) ?? "06:00");
      setWindowEnd(plan.window_end?.slice(0, 5) ?? "07:00");
    } else {
      setTargetType("request");
      setTargetId(requests[0]?.id ?? categories[0]?.id);
      setTitle("");
      setFrequency("daily");
      setTimesPerPeriod(1);
      setDaysOfWeek([]);
      setUseWindow(false);
      setWindowStart("06:00");
      setWindowEnd("07:00");
    }
  }, [visible, plan]);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function handleSave() {
    if (!title.trim() || !targetId) return;
    setSaving(true);
    const input: PlanInput = {
      title: title.trim(),
      requestId: targetType === "request" ? targetId : undefined,
      categoryId: targetType === "category" ? targetId : undefined,
      frequency,
      daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
      timesPerPeriod,
      windowStart: useWindow ? windowStart : undefined,
      windowEnd: useWindow ? windowEnd : undefined,
    };
    const result = plan ? updatePlan(userId, plan.id, input) : createPlan(userId, input);
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast(plan ? "Plan updated" : "Plan created", "success");
    onSaved();
  }

  const targetOptions = targetType === "request" ? requests : categories;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>{plan ? "Edit plan" : "New plan"}</Text>
        <View style={{ gap: spacing.md }}>
          <Input placeholder="Plan name" value={title} onChangeText={setTitle} maxLength={120} />

          <View style={styles.segmentRow}>
            {(["request", "category"] as const).map((t) => (
              <PressableScale
                key={t}
                haptic="selection"
                onPress={() => {
                  setTargetType(t);
                  setTargetId((t === "request" ? requests : categories)[0]?.id);
                }}
                style={[styles.segment, targetType === t && styles.segmentActive]}
              >
                <Text style={[styles.segmentLabel, targetType === t && styles.segmentLabelActive]}>
                  {t === "request" ? "Prayer point" : "Whole category"}
                </Text>
              </PressableScale>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {targetOptions.map((opt) => (
                <PressableScale
                  key={opt.id}
                  haptic="selection"
                  onPress={() => setTargetId(opt.id)}
                  style={[styles.optionPill, targetId === opt.id && styles.optionPillActive]}
                >
                  <Text style={styles.optionPillLabel}>{"title" in opt ? opt.title : opt.name}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>

          <View style={styles.segmentRow}>
            {(["daily", "weekly"] as const).map((f) => (
              <PressableScale
                key={f}
                haptic="selection"
                onPress={() => setFrequency(f)}
                style={[styles.segment, frequency === f && styles.segmentActive]}
              >
                <Text style={[styles.segmentLabel, frequency === f && styles.segmentLabelActive]}>
                  {f === "daily" ? "Daily" : "Weekly"}
                </Text>
              </PressableScale>
            ))}
          </View>

          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>
              Times per {frequency === "daily" ? "day" : "week"}
            </Text>
            <View style={styles.stepper}>
              <PressableScale
                haptic="selection"
                onPress={() => setTimesPerPeriod((v) => Math.max(1, v - 1))}
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </PressableScale>
              <Text style={styles.stepperValue}>{timesPerPeriod}</Text>
              <PressableScale
                haptic="selection"
                onPress={() => setTimesPerPeriod((v) => Math.min(24, v + 1))}
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </PressableScale>
            </View>
          </View>

          <View>
            <Text style={styles.fieldLabel}>Days (empty = any day)</Text>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((label, i) => (
                <PressableScale
                  key={i}
                  haptic="selection"
                  onPress={() => toggleDay(i)}
                  style={[styles.dayButton, daysOfWeek.includes(i) && styles.dayButtonActive]}
                >
                  <Text style={[styles.dayButtonText, daysOfWeek.includes(i) && styles.dayButtonTextActive]}>
                    {label}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Time window</Text>
            <Switch value={useWindow} onValueChange={setUseWindow} trackColor={{ true: colors.gold }} />
          </View>
          {useWindow ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Input placeholder="06:00" value={windowStart} onChangeText={setWindowStart} style={{ flex: 1 }} />
              <Input placeholder="07:00" value={windowEnd} onChangeText={setWindowEnd} style={{ flex: 1 }} />
            </View>
          ) : null}

          <Button onPress={handleSave} disabled={!title.trim() || !targetId || saving} loading={saving} fullWidth>
            {plan ? "Save changes" : "Create plan"}
          </Button>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...typography.title, color: colors.text },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  inactiveCard: { opacity: 0.6 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: "700", color: colors.text },
  cardSubtitle: { ...typography.tiny, color: colors.textMuted },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: `${colors.warning}22`,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  streakText: { ...typography.tiny, color: colors.warning, fontWeight: "700" },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { ...typography.tiny, color: colors.textMuted },
  cardActions: { flexDirection: "row", gap: spacing.md, justifyContent: "flex-end" },
  sheetTitle: { ...typography.title, color: colors.text, marginBottom: spacing.md },
  sheetBody: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  segmentRow: { flexDirection: "row", gap: spacing.sm },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.gold },
  segmentLabel: { ...typography.caption, color: colors.textMuted, fontWeight: "600" },
  segmentLabelActive: { color: "#1a1200" },
  optionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionPillActive: { borderColor: colors.gold, backgroundColor: `${colors.gold}22` },
  optionPillLabel: { ...typography.tiny, color: colors.text },
  stepperRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepperLabel: { ...typography.body, color: colors.text },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: { ...typography.heading, color: colors.text },
  stepperValue: { ...typography.heading, color: colors.text, minWidth: 24, textAlign: "center" },
  fieldLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  dayRow: { flexDirection: "row", gap: spacing.xs },
  dayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dayButtonActive: { backgroundColor: colors.gold },
  dayButtonText: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  dayButtonTextActive: { color: "#1a1200" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
