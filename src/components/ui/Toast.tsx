import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "@/theme/tokens";
import { Glass } from "./Glass";

interface ToastState {
  id: number;
  message: string;
  tone: "default" | "success" | "error";
}

let pushToast: ((message: string, tone?: ToastState["tone"]) => void) | null = null;
let nextId = 0;

export function showToast(message: string, tone: ToastState["tone"] = "default") {
  pushToast?.(message, tone);
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    pushToast = (message, tone = "default") => {
      const id = ++nextId;
      setToast({ id, message, tone });
      setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 2600);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (!toast) return null;

  const toneColor =
    toast.tone === "success" ? colors.success : toast.tone === "error" ? colors.danger : colors.text;

  return (
    <Animated.View
      key={toast.id}
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.container, { top: insets.top + spacing.sm }]}
      pointerEvents="none"
    >
      <Glass borderRadius={radius.pill} style={styles.pill}>
        <Text style={[styles.text, { color: toneColor }]}>{toast.message}</Text>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    alignItems: "center",
    zIndex: 100,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    maxWidth: "100%",
  },
  text: {
    ...typography.caption,
    fontWeight: "600",
    textAlign: "center",
  },
});
