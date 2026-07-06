import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createRequest } from "@/lib/portal/mutations";
import { daysSince } from "@/lib/portal/progress";
import { getRequestsList, type RequestsListData } from "@/lib/portal/queries";
import type { RequestListItem, RequestStatus } from "@/lib/portal/types";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const STATUS_TABS: { key: RequestStatus | "all"; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "answered", label: "Answered" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

export default function RequestsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ category?: string; status?: string }>();
  const [data, setData] = useState<RequestsListData | null>(null);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">(
    (STATUS_TABS.find((t) => t.key === params.status)?.key as RequestStatus | "all") ?? "active",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>(params.category ?? "all");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setData(getRequestsList(user.id));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.requests.filter((r) => {
      const statusOk = statusFilter === "all" || r.status === statusFilter;
      const categoryOk = categoryFilter === "all" || r.category_id === categoryFilter;
      return statusOk && categoryOk;
    });
  }, [data, statusFilter, categoryFilter]);

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const hasCategories = data.categories.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Prayer Points</Text>
            <Text style={styles.subtitle}>Everything you're bringing before God</Text>
          </View>
          <Button variant="glass" onPress={() => setCreating(true)} disabled={!hasCategories}>
            + New
          </Button>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tabRow}>
            {STATUS_TABS.map((tab) => (
              <PressableScale
                key={tab.key}
                haptic="selection"
                onPress={() => setStatusFilter(tab.key)}
                style={[styles.tab, statusFilter === tab.key && styles.tabActive]}
              >
                <Text style={[styles.tabLabel, statusFilter === tab.key && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </PressableScale>
            ))}
          </View>
        </ScrollView>

        {hasCategories ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tabRow}>
              <PressableScale
                haptic="selection"
                onPress={() => setCategoryFilter("all")}
                style={[styles.categoryPill, categoryFilter === "all" && styles.categoryPillActive]}
              >
                <Text style={styles.categoryPillLabel}>All categories</Text>
              </PressableScale>
              {data.categories.map((c) => (
                <PressableScale
                  key={c.id}
                  haptic="selection"
                  onPress={() => setCategoryFilter(c.id)}
                  style={[
                    styles.categoryPill,
                    categoryFilter === c.id && { backgroundColor: `${c.color ?? colors.gold}33` },
                  ]}
                >
                  <Text style={styles.categoryPillLabel}>{c.name}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {!hasCategories ? (
          <EmptyState
            text="Create a category first"
            actionLabel="Go to categories"
            onPress={() => router.push("/(app)/categories")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            text={
              statusFilter === "active" ? "No prayer points here yet" : `No ${statusFilter} prayer points`
            }
            actionLabel="Add a prayer point"
            onPress={() => setCreating(true)}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {filtered.map((r, i) => (
              <Animated.View key={r.id} entering={FadeIn.duration(250).delay(i * 30)}>
                <RequestRow request={r} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <CreateRequestSheet
        visible={creating}
        categories={data.categories}
        defaultCategoryId={categoryFilter !== "all" ? categoryFilter : undefined}
        onClose={() => setCreating(false)}
        userId={user?.id ?? ""}
        onCreated={(id) => {
          setCreating(false);
          load();
          router.push({ pathname: "/(app)/requests/[id]", params: { id } });
        }}
      />
    </View>
  );
}

function RequestRow({ request }: { request: RequestListItem }) {
  const days = daysSince(request.lastPrayedOn);
  return (
    <PressableScale
      onPress={() => router.push({ pathname: "/(app)/requests/[id]", params: { id: request.id } })}
    >
      <GlassCard style={styles.row}>
        <View style={[styles.dot, { backgroundColor: request.categoryColor ?? colors.gold }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {request.title}
          </Text>
          <View style={styles.rowMetaRow}>
            <Text style={styles.rowCategory} numberOfLines={1}>
              {request.categoryName}
            </Text>
            {request.status !== "active" ? (
              <Pill
                label={request.status}
                color={request.status === "answered" ? colors.success : colors.textMuted}
              />
            ) : null}
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowLogCount}>{request.logCount}×</Text>
          <Text style={styles.rowLastPrayed}>{days === null ? "never" : `${days}d ago`}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textFaint} />
      </GlassCard>
    </PressableScale>
  );
}

function EmptyState({
  text,
  actionLabel,
  onPress,
}: {
  text: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <MaterialCommunityIcons name="hand-heart" size={28} color={colors.textFaint} />
      <Text style={styles.emptyText}>{text}</Text>
      <PressableScale onPress={onPress}>
        <Text style={styles.emptyAction}>{actionLabel} →</Text>
      </PressableScale>
    </View>
  );
}

function CreateRequestSheet({
  visible,
  categories,
  defaultCategoryId,
  onClose,
  onCreated,
  userId,
}: {
  visible: boolean;
  categories: RequestsListData["categories"];
  defaultCategoryId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
  userId: string;
}) {
  const [categoryId, setCategoryId] = useState<string | undefined>(defaultCategoryId);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategoryId(defaultCategoryId ?? categories[0]?.id);
      setTitle("");
      setDetails("");
    }
  }, [visible, defaultCategoryId, categories]);

  function handleSave() {
    if (!title.trim() || !categoryId) return;
    setSaving(true);
    const result = createRequest(userId, {
      categoryId,
      title: title.trim(),
      details: details.trim() || undefined,
    });
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast("Prayer point added", "success");
    onCreated(result.id!);
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>New prayer point</Text>
        <View style={{ gap: spacing.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tabRow}>
              {categories.map((c) => (
                <PressableScale
                  key={c.id}
                  haptic="selection"
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.categoryPill,
                    categoryId === c.id && { backgroundColor: `${c.color ?? colors.gold}33` },
                  ]}
                >
                  <Text style={styles.categoryPillLabel}>{c.name}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
          <Input placeholder="Title" value={title} onChangeText={setTitle} maxLength={120} />
          <Input
            placeholder="Details (optional)"
            value={details}
            onChangeText={setDetails}
            maxLength={2000}
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />
          <Button onPress={handleSave} disabled={!title.trim() || !categoryId || saving} loading={saving} fullWidth>
            Create prayer point
          </Button>
        </View>
      </ScrollView>
    </Sheet>
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
    gap: spacing.md,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  tabActive: {
    backgroundColor: colors.gold,
  },
  tabLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#1a1200",
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  categoryPillActive: {
    borderColor: colors.gold,
  },
  categoryPillLabel: {
    ...typography.tiny,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  rowCategory: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  rowLogCount: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: "700",
  },
  rowLastPrayed: {
    ...typography.tiny,
    color: colors.textFaint,
  },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xxl,
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
  sheetTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
