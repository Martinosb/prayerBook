import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { colors, radius, spacing, typography } from "@/theme/tokens";

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
}

/** Lightweight vertical bar chart — zero-filled daily series, no external chart lib. */
export function BarChart({ data, height = 120 }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={[styles.row, { height }]}>
      {data.map((d, i) => (
        <Bar key={i} value={d.value} max={max} label={d.label} />
      ))}
    </View>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withTiming(value / max, { duration: 500 });
  }, [value, max]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(height.value * 100, value > 0 ? 4 : 0)}%` }));

  return (
    <View style={styles.barColumn}>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.bar, style]} />
      </View>
      <Text style={styles.barLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

interface HorizontalBarListProps {
  data: { label: string; value: number; color?: string }[];
}

export function HorizontalBarList({ data }: HorizontalBarListProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((d, i) => (
        <HorizontalBar key={i} {...d} max={max} />
      ))}
    </View>
  );
}

function HorizontalBar({
  label,
  value,
  color = colors.gold,
  max,
}: {
  label: string;
  value: number;
  color?: string;
  max: number;
}) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(value / max, { duration: 500 });
  }, [value, max]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={{ gap: 2 }}>
      <View style={styles.hBarLabelRow}>
        <Text style={styles.hBarLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.hBarValue}>{value}</Text>
      </View>
      <View style={styles.hBarTrack}>
        <Animated.View style={[styles.hBarFill, style, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    height: "100%",
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    minHeight: 2,
  },
  barLabel: {
    ...typography.tiny,
    color: colors.textFaint,
    fontSize: 9,
  },
  hBarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hBarLabel: {
    ...typography.tiny,
    color: colors.text,
    flex: 1,
  },
  hBarValue: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: "700",
  },
  hBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  hBarFill: {
    height: "100%",
    borderRadius: 4,
  },
});
