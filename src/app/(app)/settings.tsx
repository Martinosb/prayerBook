import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getPermissionState,
  requestPermission,
  syncReminderNotifications,
  type PermissionState,
} from "@/lib/notifications";
import {
  createReminder,
  deleteReminder,
  toggleReminder,
  updateReminder,
  updateProfile,
  type ReminderInput,
} from "@/lib/portal/mutations";
import { getSettingsData, type SettingsData } from "@/lib/portal/queries";
import type { Reminder } from "@/lib/portal/types";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const TIMEZONES = [
  "Africa/Accra",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
];

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function SettingsScreen() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [data, setData] = useState<SettingsData | null>(null);
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [editingReminder, setEditingReminder] = useState<Reminder | "new" | null>(null);

  const load = useCallback(async () => {
    if (!user) return null;
    const result = await getSettingsData(user.id);
    setData(result);
    return result;
  }, [user]);

  // Single place that both reloads from the DB and re-syncs local
  // notifications from the fresh result — every reminder mutation below
  // routes through this so the two never drift apart.
  const reloadAndSync = useCallback(async () => {
    const result = await load();
    if (result && permission === "granted") {
      await syncReminderNotifications(result.reminders);
    }
  }, [load, permission]);

  useEffect(() => {
    load();
    getPermissionState().then(setPermission);
  }, [load]);

  async function handleTogglePush() {
    if (permission === "granted") {
      showToast("To disable, turn off notifications for PrayerBook in system settings", "default");
      return;
    }
    const status = await requestPermission();
    setPermission(status);
    if (status === "granted" && data) {
      await syncReminderNotifications(data.reminders);
      showToast("Notifications enabled", "success");
    }
  }

  async function handleToggleReminder(reminder: Reminder) {
    if (!user) return;
    const result = toggleReminder(user.id, reminder.id, !reminder.is_active);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    await reloadAndSync();
  }

  async function handleDeleteReminder(id: string) {
    if (!user) return;
    const result = deleteReminder(user.id, id);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    await reloadAndSync();
  }

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <ProfileCard
          username={profile?.username ?? ""}
          email={user?.email ?? ""}
          timezone={profile?.timezone ?? "Africa/Accra"}
          phone={profile?.phone ?? ""}
          smsOptIn={profile?.sms_opt_in ?? false}
          userId={user?.id ?? ""}
          onSaved={refreshProfile}
        />

        <Animated.View entering={FadeInDown.duration(300)}>
          <GlassCard style={{ gap: spacing.md }}>
            <Text style={styles.cardTitle}>Notifications</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Prayer reminders</Text>
                <Text style={styles.switchHint}>
                  {permission === "granted"
                    ? "Reminders will notify you on this device"
                    : permission === "denied"
                      ? "Enable in your device's notification settings"
                      : "Get notified at your scheduled prayer times"}
                </Text>
              </View>
              <Switch
                value={permission === "granted"}
                onValueChange={handleTogglePush}
                disabled={permission === "denied"}
                trackColor={{ true: colors.gold }}
              />
            </View>
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(60)}>
          <GlassCard style={{ gap: spacing.md }}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Prayer times</Text>
              <PressableScale onPress={() => setEditingReminder("new")} haptic="selection">
                <Text style={styles.addLink}>+ Add</Text>
              </PressableScale>
            </View>

            {data.reminders.length === 0 ? (
              <View style={styles.emptyReminders}>
                <MaterialCommunityIcons name="bell-off-outline" size={24} color={colors.textFaint} />
                <Text style={styles.emptyText}>No reminders set yet.</Text>
              </View>
            ) : (
              data.reminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  onToggle={() => handleToggleReminder(r)}
                  onEdit={() => setEditingReminder(r)}
                  onDelete={() => handleDeleteReminder(r.id)}
                />
              ))
            )}
          </GlassCard>
        </Animated.View>

        <Button variant="danger" onPress={signOut} fullWidth>
          Sign out
        </Button>
      </ScrollView>

      <ReminderEditor
        visible={editingReminder !== null}
        reminder={editingReminder === "new" ? null : editingReminder}
        requests={data.activeRequests}
        userId={user?.id ?? ""}
        onClose={() => setEditingReminder(null)}
        onSaved={async () => {
          setEditingReminder(null);
          await reloadAndSync();
        }}
      />
    </View>
  );
}

function ProfileCard({
  username,
  email,
  timezone: initialTimezone,
  phone: initialPhone,
  smsOptIn: initialSmsOptIn,
  userId,
  onSaved,
}: {
  username: string;
  email: string;
  timezone: string;
  phone: string;
  smsOptIn: boolean;
  userId: string;
  onSaved: () => void;
}) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [phone, setPhone] = useState(initialPhone);
  const [smsOptIn, setSmsOptIn] = useState(initialSmsOptIn);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateProfile(userId, { timezone, phone: phone || undefined, smsOptIn });
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast("Settings saved", "success");
    onSaved();
  }

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <GlassCard style={{ gap: spacing.md }}>
        <Row label="Username" value={`@${username}`} />
        <Row label="Email" value={email} />

        <View>
          <Text style={styles.fieldLabel}>Timezone</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {TIMEZONES.map((tz) => (
                <PressableScale
                  key={tz}
                  haptic="selection"
                  onPress={() => setTimezone(tz)}
                  style={[styles.tzPill, timezone === tz && styles.tzPillActive]}
                >
                  <Text style={[styles.tzPillLabel, timezone === tz && styles.tzPillLabelActive]}>{tz}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.fieldLabel}>SMS backup (optional)</Text>
          <Input placeholder="e.g. 0241234567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Also send SMS reminders</Text>
            <Switch value={smsOptIn} onValueChange={setSmsOptIn} trackColor={{ true: colors.gold }} />
          </View>
        </View>

        <Button onPress={handleSave} loading={saving} fullWidth>
          Save settings
        </Button>
      </GlassCard>
    </Animated.View>
  );
}

function ReminderRow({
  reminder,
  onToggle,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const days =
    reminder.days_of_week.length === 7
      ? "Every day"
      : reminder.days_of_week
          .slice()
          .sort()
          .map((d) => DAY_LABELS[d])
          .join(" ");

  return (
    <View style={styles.reminderRow}>
      <Text style={styles.reminderTime}>{reminder.remind_time.slice(0, 5)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.reminderLabel} numberOfLines={1}>
          {reminder.label}
        </Text>
        <Text style={styles.reminderMeta}>
          {days} · heads-up {reminder.lead_minutes} min before
        </Text>
      </View>
      <Switch value={reminder.is_active} onValueChange={onToggle} trackColor={{ true: colors.gold }} />
      <PressableScale onPress={onEdit} haptic="selection">
        <MaterialCommunityIcons name="pencil" size={16} color={colors.textMuted} />
      </PressableScale>
      <PressableScale onPress={onDelete} haptic="selection">
        <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
      </PressableScale>
    </View>
  );
}

function ReminderEditor({
  visible,
  reminder,
  requests,
  userId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  reminder: Reminder | null;
  requests: SettingsData["activeRequests"];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [remindTime, setRemindTime] = useState("05:30");
  const [leadMinutes, setLeadMinutes] = useState("15");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (reminder) {
      setLabel(reminder.label);
      setRemindTime(reminder.remind_time.slice(0, 5));
      setLeadMinutes(String(reminder.lead_minutes));
      setDaysOfWeek(reminder.days_of_week);
      setRequestId(reminder.request_id ?? undefined);
    } else {
      setLabel("");
      setRemindTime("05:30");
      setLeadMinutes("15");
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
      setRequestId(undefined);
    }
  }, [visible, reminder]);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleSave() {
    if (!label.trim() || daysOfWeek.length === 0) return;
    setSaving(true);
    const input: ReminderInput = {
      label: label.trim(),
      remindTime,
      leadMinutes: Number(leadMinutes) || 0,
      daysOfWeek,
      requestId,
    };
    const result = reminder ? updateReminder(userId, reminder.id, input) : createReminder(userId, input);
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast(reminder ? "Reminder updated" : "Reminder added", "success");
    onSaved();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>{reminder ? "Edit reminder" : "New reminder"}</Text>
        <View style={{ gap: spacing.md }}>
          <Input placeholder="Label" value={label} onChangeText={setLabel} maxLength={80} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Input placeholder="05:30" value={remindTime} onChangeText={setRemindTime} style={{ flex: 1 }} />
            <Input
              placeholder="Heads-up (min)"
              value={leadMinutes}
              onChangeText={setLeadMinutes}
              keyboardType="number-pad"
              style={{ flex: 1 }}
            />
          </View>
          <View>
            <Text style={styles.fieldLabel}>Days</Text>
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
          {requests.length > 0 ? (
            <View>
              <Text style={styles.fieldLabel}>Linked prayer point (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <PressableScale
                    haptic="selection"
                    onPress={() => setRequestId(undefined)}
                    style={[styles.optionPill, !requestId && styles.optionPillActive]}
                  >
                    <Text style={styles.optionPillLabel}>General</Text>
                  </PressableScale>
                  {requests.map((r) => (
                    <PressableScale
                      key={r.id}
                      haptic="selection"
                      onPress={() => setRequestId(r.id)}
                      style={[styles.optionPill, requestId === r.id && styles.optionPillActive]}
                    >
                      <Text style={styles.optionPillLabel} numberOfLines={1}>
                        {r.title}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
          <Button onPress={handleSave} disabled={!label.trim() || daysOfWeek.length === 0 || saving} loading={saving} fullWidth>
            {reminder ? "Save changes" : "Add reminder"}
          </Button>
        </View>
      </ScrollView>
    </Sheet>
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
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  title: { ...typography.title, color: colors.text },
  cardTitle: { ...typography.heading, color: colors.text },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addLink: { ...typography.body, color: colors.goldSoft, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { ...typography.body, color: colors.textMuted },
  rowValue: { ...typography.body, color: colors.text, fontWeight: "600" },
  fieldLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  tzPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  tzPillActive: { backgroundColor: colors.gold },
  tzPillLabel: { ...typography.tiny, color: colors.textMuted },
  tzPillLabelActive: { color: "#1a1200", fontWeight: "700" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  switchLabel: { ...typography.body, color: colors.text },
  switchHint: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  emptyReminders: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  emptyText: { ...typography.caption, color: colors.textMuted },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  reminderTime: { ...typography.heading, color: colors.gold, fontWeight: "700" },
  reminderLabel: { ...typography.body, color: colors.text, fontWeight: "600" },
  reminderMeta: { ...typography.tiny, color: colors.textMuted },
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
  optionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionPillActive: { borderColor: colors.gold, backgroundColor: `${colors.gold}22` },
  optionPillLabel: { ...typography.tiny, color: colors.text },
  sheetTitle: { ...typography.title, color: colors.text, marginBottom: spacing.md },
});
