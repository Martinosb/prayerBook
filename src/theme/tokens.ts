import { Platform } from "react-native";

/** Matches the web portal's dark, gold-accented look (see PORTAL_SPEC.md §7). */
export const colors = {
  background: "#0a0a0a",
  backgroundElevated: "#141414",
  surface: "rgba(255,255,255,0.06)",
  surfaceStrong: "rgba(255,255,255,0.1)",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.2)",
  gold: "#b8923f",
  goldSoft: "#e4c87a",
  text: "#f5f5f4",
  textMuted: "#a3a3a3",
  textFaint: "#6b6b6b",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  tiny: { fontSize: 11, fontWeight: "500" as const },
};

export const isIOS = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";

/** Neglected-prayer-point pill thresholds (see PORTAL_SPEC.md §5, §7). */
export function neglectColor(daysSince: number | null): string {
  if (daysSince === null || daysSince > 7) return colors.danger;
  return colors.warning;
}
