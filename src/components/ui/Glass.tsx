import { BlurView } from "expo-blur";
import {
  GlassView,
  isLiquidGlassAvailable,
  type GlassStyle,
} from "expo-glass-effect";
import type { PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, isIOS, radius } from "../../theme/tokens";

interface GlassProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  /** iOS Liquid Glass style — ignored on Android. @default 'regular' */
  glassStyle?: GlassStyle;
  /** Corner radius applied to the glass surface itself. */
  borderRadius?: number;
  tintColor?: string;
  interactive?: boolean;
}

const liquidGlassSupported = isIOS && isLiquidGlassAvailable();

/**
 * Cross-platform "glass" surface: real iOS 26 Liquid Glass where available,
 * a BlurView fallback on older iOS, and a tinted BlurView + border
 * (glassmorphism) recipe on Android.
 */
export function Glass({
  children,
  style,
  glassStyle = "regular",
  borderRadius = radius.lg,
  tintColor,
  interactive = false,
}: GlassProps) {
  if (liquidGlassSupported) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        tintColor={tintColor}
        isInteractive={interactive}
        colorScheme="dark"
        style={[{ borderRadius, overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  }

  if (isIOS) {
    return (
      <View style={[{ borderRadius, overflow: "hidden" }, style]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[styles.iosFallbackOverlay, { borderRadius }]} />
        {children}
      </View>
    );
  }

  // Android glassmorphism: frosted blur + translucent tint + soft border.
  return (
    <View style={[{ borderRadius, overflow: "hidden" }, style]}>
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[styles.androidOverlay, { borderRadius, borderColor: colors.border }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iosFallbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  androidOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
