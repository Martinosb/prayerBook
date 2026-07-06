import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";

/** Full-bleed dark background with a soft gold glow, matching the web auth layout. */
export function AuthBackground({ children }: PropsWithChildren) {
  return (
    <View style={styles.container}>
      <View style={styles.glow} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glow: {
    position: "absolute",
    top: -140,
    left: "50%",
    marginLeft: -220,
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: colors.gold,
    opacity: 0.16,
  },
});
