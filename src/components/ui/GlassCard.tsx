import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { radius, spacing } from "../../theme/tokens";
import { Glass } from "./Glass";

interface GlassCardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function GlassCard({ children, style, padded = true }: GlassCardProps) {
  return (
    <Glass
      borderRadius={radius.lg}
      style={[padded ? { padding: spacing.lg } : null, style]}
    >
      {children}
    </Glass>
  );
}
