import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import { Glass } from "./Glass";
import { PressableScale } from "./PressableScale";

interface ButtonProps extends PropsWithChildren {
  onPress?: () => void;
  variant?: "primary" | "glass" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export function Button({
  children,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  fullWidth,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.background : colors.text} />
      ) : typeof children === "string" ? (
        <Text style={[styles.label, variant === "primary" && styles.labelOnGold]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </>
  );

  if (variant === "glass" || variant === "ghost") {
    return (
      <PressableScale
        onPress={isDisabled ? undefined : onPress}
        disabled={isDisabled}
        style={[fullWidth && styles.fullWidth, isDisabled && styles.disabled, style]}
      >
        {variant === "glass" ? (
          <Glass borderRadius={radius.pill} style={styles.pillPadding}>
            {content}
          </Glass>
        ) : (
          <Text style={[styles.label, styles.ghostLabel]}>{children}</Text>
        )}
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={[
        styles.solid,
        fullWidth && styles.fullWidth,
        variant === "danger" && styles.danger,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  solid: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  danger: {
    backgroundColor: colors.danger,
  },
  pillPadding: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.heading,
    color: colors.text,
  },
  labelOnGold: {
    color: "#1a1200",
  },
  ghostLabel: {
    ...typography.body,
    color: colors.goldSoft,
    textAlign: "center",
  },
});
