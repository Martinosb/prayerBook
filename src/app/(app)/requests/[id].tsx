import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, Layout } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { celebrateLog } from "@/lib/portal/confetti";
import {
  addScriptures,
  deleteLog,
  deleteRequest,
  deleteScripture,
  logPrayer,
  setRequestStatus,
  updateRequest,
} from "@/lib/portal/mutations";
import { AiSuggestionsPanel } from "@/components/portal/AiSuggestionsPanel";
import { getRequestDetail, type RequestDetailData } from "@/lib/portal/queries";
import type { RequestStatus } from "@/lib/portal/types";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const STATUS_OPTIONS: { key: RequestStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "answered", label: "Answered 🎉" },
  { key: "archived", label: "Archived" },
];

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<RequestDetailData | null>(null);
  const [logging, setLogging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAddScripture, setShowAddScripture] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setData(getRequestDetail(user.id, id));
  }, [user, id]);

  useEffect(() => {
    load();
  }, [load]);

  function handleQuickLog() {
    if (!user) return;
    setLogging(true);
    const result = logPrayer(user.id, { requestId: id });
    setLogging(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    celebrateLog();
    showToast("Prayer logged 🙏", "success");
    load();
  }

  function handleStatusChange(status: RequestStatus) {
    if (!user) return;
    const result = setRequestStatus(user.id, id, status);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    if (status === "answered") {
      celebrateLog();
      showToast("Answered prayer — glory to God! 🎉", "success");
    }
    load();
  }

  function handleDelete() {
    if (!user) return;
    const result = deleteRequest(user.id, id);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast("Prayer point deleted", "success");
    router.back();
  }

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const { request, scriptures, logs, categories } = data;
  const todayCount = logs.filter((l) => l.prayed_on === format(new Date(), "yyyy-MM-dd")).length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <PressableScale onPress={() => router.back()} haptic="selection">
          <Text style={styles.backLink}>← Prayer points</Text>
        </PressableScale>

        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <View style={styles.pillRow}>
              <View style={[styles.categoryPill, { backgroundColor: `${request.categoryColor ?? colors.gold}26` }]}>
                <Text style={[styles.categoryPillText, { color: request.categoryColor ?? colors.gold }]}>
                  {request.categoryName}
                </Text>
              </View>
              {request.status === "answered" ? (
                <View style={[styles.categoryPill, { backgroundColor: `${colors.success}26` }]}>
                  <Text style={[styles.categoryPillText, { color: colors.success }]}>
                    ✓ Answered{request.answered_at ? ` ${format(new Date(request.answered_at), "d MMM yyyy")}` : ""}
                  </Text>
                </View>
              ) : request.status === "archived" ? (
                <View style={[styles.categoryPill, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.categoryPillText, { color: colors.textMuted }]}>Archived</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.title}>{request.title}</Text>
            {request.details ? <Text style={styles.details}>{request.details}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            <PressableScale onPress={() => setShowEdit(true)} haptic="selection">
              <MaterialCommunityIcons name="pencil" size={18} color={colors.textMuted} />
            </PressableScale>
            <PressableScale onPress={() => setShowDelete(true)} haptic="selection">
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
            </PressableScale>
          </View>
        </View>

        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <PressableScale
              key={opt.key}
              haptic="selection"
              onPress={() => handleStatusChange(opt.key)}
              style={[styles.statusChip, request.status === opt.key && styles.statusChipActive]}
            >
              <Text style={[styles.statusChipLabel, request.status === opt.key && styles.statusChipLabelActive]}>
                {opt.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        <GlassCard style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button onPress={handleQuickLog} loading={logging} style={{ flex: 1 }}>
              I prayed for this today
            </Button>
            <Button variant="glass" onPress={() => setShowLogSheet(true)}>
              With details
            </Button>
          </View>
          <Text style={styles.logSummary}>
            {logs.length === 0
              ? "No prayers logged yet — today is a great day to start."
              : `${logs.length} session${logs.length === 1 ? "" : "s"} logged · ${todayCount} today`}
          </Text>
          {logs.length > 0 ? (
            <PressableScale onPress={() => setShowHistory((v) => !v)} haptic="selection">
              <Text style={styles.historyToggle}>{showHistory ? "Hide" : "Show"} history ▾</Text>
            </PressableScale>
          ) : null}
          {showHistory ? (
            <View style={{ gap: spacing.sm }}>
              {logs.map((log) => (
                <Animated.View
                  key={log.id}
                  entering={FadeIn.duration(200)}
                  layout={Layout}
                  style={styles.historyRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>{format(new Date(log.prayed_on), "d MMM yyyy")}</Text>
                    <Text style={styles.historyMeta}>
                      {[log.prayed_at, log.duration_minutes ? `${log.duration_minutes} min` : null, log.note]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Text>
                  </View>
                  <PressableScale
                    haptic="selection"
                    onPress={() => {
                      if (!user) return;
                      deleteLog(user.id, log.id);
                      load();
                    }}
                  >
                    <MaterialCommunityIcons name="close" size={16} color={colors.textFaint} />
                  </PressableScale>
                </Animated.View>
              ))}
            </View>
          ) : null}
        </GlassCard>

        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Scriptures</Text>
            <PressableScale onPress={() => setShowAddScripture((v) => !v)} haptic="selection">
              <Text style={styles.sectionAction}>{showAddScripture ? "×" : "+ Add"}</Text>
            </PressableScale>
          </View>
          {showAddScripture ? (
            <AddScriptureForm
              requestId={id}
              userId={user?.id ?? ""}
              onSaved={() => {
                setShowAddScripture(false);
                load();
              }}
            />
          ) : null}
          {scriptures.length === 0 && !showAddScripture ? (
            <Text style={styles.emptyText}>
              No scriptures yet. Add the verses you're standing on.
            </Text>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {scriptures.map((s) => (
                <GlassCard key={s.id} style={styles.scriptureCard}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.scriptureRefRow}>
                      <Text style={styles.scriptureRef}>{s.reference}</Text>
                      {s.source === "ai" ? (
                        <MaterialCommunityIcons name="creation" size={12} color={colors.gold} />
                      ) : null}
                    </View>
                    <Text style={styles.scriptureContent}>{s.content}</Text>
                  </View>
                  <PressableScale
                    haptic="selection"
                    onPress={() => {
                      if (!user) return;
                      deleteScripture(user.id, s.id);
                      load();
                    }}
                  >
                    <MaterialCommunityIcons name="close" size={16} color={colors.textFaint} />
                  </PressableScale>
                </GlassCard>
              ))}
            </View>
          )}
        </View>

        <AiSuggestionsPanel requestId={id} userId={user?.id ?? ""} onAdded={load} />
      </ScrollView>

      <LogDetailSheet
        visible={showLogSheet}
        onClose={() => setShowLogSheet(false)}
        userId={user?.id ?? ""}
        requestId={id}
        onSaved={() => {
          setShowLogSheet(false);
          load();
        }}
      />

      <EditRequestSheet
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        request={request}
        categories={categories}
        userId={user?.id ?? ""}
        onSaved={() => {
          setShowEdit(false);
          load();
        }}
      />

      <Sheet visible={showDelete} onClose={() => setShowDelete(false)}>
        <Text style={styles.sheetTitle}>Delete "{request.title}"?</Text>
        <Text style={styles.sheetBody}>
          This permanently removes the prayer point, its scriptures and its entire prayer history.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button variant="glass" onPress={() => setShowDelete(false)} style={{ flex: 1 }}>
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

function AddScriptureForm({
  requestId,
  userId,
  onSaved,
}: {
  requestId: string;
  userId: string;
  onSaved: () => void;
}) {
  const [reference, setReference] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    const result = addScriptures(userId, requestId, [
      { reference: reference.trim() || undefined, content: content.trim(), source: "manual" },
    ]);
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    onSaved();
  }

  return (
    <GlassCard style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <Input placeholder="Reference (e.g. Psalm 23:1)" value={reference} onChangeText={setReference} maxLength={100} />
      <Input
        placeholder="Scripture or quote text"
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={2}
        maxLength={1000}
        style={{ minHeight: 56, textAlignVertical: "top" }}
      />
      <Button onPress={handleSave} disabled={!content.trim() || saving} loading={saving} fullWidth>
        Save scripture
      </Button>
    </GlassCard>
  );
}

function LogDetailSheet({
  visible,
  onClose,
  userId,
  requestId,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  requestId: string;
  onSaved: () => void;
}) {
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setMinutes("");
      setNote("");
    }
  }, [visible]);

  function handleSave() {
    setSaving(true);
    const result = logPrayer(userId, {
      requestId,
      durationMinutes: minutes ? Number(minutes) : undefined,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    celebrateLog();
    showToast("Prayer logged 🙏", "success");
    onSaved();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>Log with details</Text>
      <View style={{ gap: spacing.md }}>
        <Input
          placeholder="Minutes (optional)"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
        />
        <Input
          placeholder="Note (optional)"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          maxLength={500}
          style={{ minHeight: 56, textAlignVertical: "top" }}
        />
        <Button onPress={handleSave} loading={saving} fullWidth>
          Save log
        </Button>
      </View>
    </Sheet>
  );
}

function EditRequestSheet({
  visible,
  onClose,
  request,
  categories,
  userId,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  request: RequestDetailData["request"];
  categories: RequestDetailData["categories"];
  userId: string;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(request.category_id);
  const [title, setTitle] = useState(request.title);
  const [details, setDetails] = useState(request.details ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategoryId(request.category_id);
      setTitle(request.title);
      setDetails(request.details ?? "");
    }
  }, [visible, request]);

  function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const result = updateRequest(userId, request.id, {
      categoryId,
      title: title.trim(),
      details: details.trim() || undefined,
    });
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast("Prayer point updated", "success");
    onSaved();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>Edit prayer point</Text>
        <View style={{ gap: spacing.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {categories.map((c) => (
                <PressableScale
                  key={c.id}
                  haptic="selection"
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.categoryFilterPill,
                    categoryId === c.id && { backgroundColor: `${c.color ?? colors.gold}33` },
                  ]}
                >
                  <Text style={styles.categoryPillText}>{c.name}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
          <Input placeholder="Title" value={title} onChangeText={setTitle} maxLength={120} />
          <Input
            placeholder="Details (optional)"
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={3}
            maxLength={2000}
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />
          <Button onPress={handleSave} disabled={!title.trim() || saving} loading={saving} fullWidth>
            Save changes
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
    gap: spacing.lg,
    paddingBottom: 120,
  },
  backLink: {
    ...typography.caption,
    color: colors.textMuted,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  categoryPill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  categoryPillText: {
    ...typography.tiny,
    fontWeight: "600",
  },
  categoryFilterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  details: {
    ...typography.body,
    color: colors.textMuted,
  },
  statusRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statusChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  statusChipActive: {
    backgroundColor: colors.gold,
  },
  statusChipLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600",
  },
  statusChipLabelActive: {
    color: "#1a1200",
  },
  logSummary: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  historyToggle: {
    ...typography.tiny,
    color: colors.goldSoft,
    fontWeight: "600",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyDate: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  historyMeta: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  sectionAction: {
    ...typography.body,
    color: colors.goldSoft,
    fontWeight: "700",
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  scriptureCard: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  scriptureRefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  scriptureRef: {
    ...typography.body,
    color: colors.gold,
    fontWeight: "700",
  },
  scriptureContent: {
    ...typography.caption,
    color: colors.text,
    marginTop: 2,
  },
  sheetTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sheetBody: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});
