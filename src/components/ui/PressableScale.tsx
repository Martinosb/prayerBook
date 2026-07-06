import * as Haptics from "expo-haptics";
import type { PropsWithChildren } from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PropsWithChildren<PressableProps> {
  scaleTo?: number;
  haptic?: "light" | "medium" | "heavy" | "selection" | "none";
}

/** Shared micro-interaction: spring scale-down + haptic tick on press. */
export function PressableScale({
  children,
  scaleTo = 0.96,
  haptic = "light",
  onPressIn,
  onPressOut,
  onPress,
  style,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[animatedStyle, style]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 300 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic !== "none") {
          const style =
            haptic === "selection"
              ? undefined
              : {
                  light: Haptics.ImpactFeedbackStyle.Light,
                  medium: Haptics.ImpactFeedbackStyle.Medium,
                  heavy: Haptics.ImpactFeedbackStyle.Heavy,
                }[haptic];
          if (haptic === "selection") {
            Haptics.selectionAsync();
          } else if (style) {
            Haptics.impactAsync(style);
          }
        }
        onPress?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
