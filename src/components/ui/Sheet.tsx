import type { PropsWithChildren } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/theme/tokens";
import { Glass } from "./Glass";

interface SheetProps extends PropsWithChildren {
  visible: boolean;
  onClose: () => void;
}

/** Bottom-sheet style modal used for create/edit/confirm dialogs across the app. */
export function Sheet({ visible, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(280).damping(18)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheetWrap, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <Glass borderRadius={radius.xl} style={styles.sheet}>
          {children}
        </Glass>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    padding: spacing.xl,
    maxHeight: "85%",
  },
});
