import * as Haptics from "expo-haptics";

/**
 * RN has no canvas-confetti equivalent wired up yet — for now, celebrations
 * are a haptic-only stand-in (see docs/PORTAL_SPEC.md §5 for the web app's
 * particle-based version). Swap in a small particle burst component later
 * without changing call sites.
 */
export function celebrateLog() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function celebrateGoal() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 150);
}
