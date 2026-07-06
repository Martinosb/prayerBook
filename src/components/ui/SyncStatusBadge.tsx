import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { getSyncState, subscribeSyncState, type SyncState } from "@/lib/db/sync";
import { colors, spacing, typography } from "@/theme/tokens";

/**
 * Small, unobtrusive sync indicator — this app writes locally and syncs in
 * the background (see CLAUDE.md's offline-first section), so there's no
 * loading spinner blocking any screen. This is just visibility into that
 * background process, not a gate on anything.
 */
export function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => subscribeSyncState(setState), []);

  if (state.syncing) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.textFaint} />
        <Text style={styles.text}>Syncing…</Text>
      </View>
    );
  }

  if (state.lastError) {
    return (
      <View style={styles.row}>
        <MaterialCommunityIcons name="cloud-off-outline" size={13} color={colors.warning} />
        <Text style={[styles.text, { color: colors.warning }]}>Waiting to sync</Text>
      </View>
    );
  }

  if (state.lastSyncedAt) {
    return (
      <View style={styles.row}>
        <MaterialCommunityIcons name="cloud-check-outline" size={13} color={colors.textFaint} />
        <Text style={styles.text}>Synced</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  text: {
    ...typography.tiny,
    color: colors.textFaint,
  },
});
