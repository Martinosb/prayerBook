import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "@/theme/tokens";

interface PillProps {
  label: string;
  color?: string;
  tone?: "solid" | "soft";
}

export function Pill({ label, color = colors.gold, tone = "soft" }: PillProps) {
  return (
    <View
      style={[
        styles.pill,
        tone === "soft"
          ? { backgroundColor: `${color}26`, borderColor: `${color}55` }
          : { backgroundColor: color, borderColor: color },
      ]}
    >
      <Text style={[styles.label, tone === "soft" && { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
  },
  label: {
    ...typography.tiny,
    color: colors.background,
  },
});
