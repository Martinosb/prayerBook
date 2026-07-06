import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Reminder } from "./portal/types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const IDENTIFIER_PREFIX = "portal-reminder:";

export type PermissionState = "granted" | "denied" | "undetermined";

export async function getPermissionState(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function requestPermission(): Promise<PermissionState> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("prayer-reminders", {
      name: "Prayer reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return status;
}

/**
 * Re-syncs every locally-scheduled reminder notification from scratch:
 * cancels anything we previously scheduled, then schedules one weekly
 * recurring notification per (reminder × selected day-of-week).
 *
 * Simplification vs. the web app: fires exactly at `remind_time` with a
 * single "It's time to pray" notification — no separate "approaching"
 * pre-alert (that would require a second scheduled entry per day with a
 * lead_minutes-shifted time, including midnight-rollover handling). See
 * CLAUDE.md for the full rationale.
 */
export async function syncReminderNotifications(reminders: Reminder[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(IDENTIFIER_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const active = reminders.filter((r) => r.is_active);
  for (const reminder of active) {
    const [hour, minute] = reminder.remind_time.split(":").map(Number);
    for (const day of reminder.days_of_week) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${IDENTIFIER_PREFIX}${reminder.id}:${day}`,
        content: {
          title: "It's time to pray 🙏",
          body: reminder.label,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          // expo-notifications weekday: 1=Sunday..7=Saturday; our days_of_week: 0=Sun..6=Sat
          weekday: day + 1,
          hour,
          minute,
        },
      });
    }
  }
}
