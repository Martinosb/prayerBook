import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { PressableScale } from "@/components/ui/PressableScale";
import { showToast } from "@/components/ui/Toast";
import { generateAiSuggestions, type SuggestionKind } from "@/lib/portal/edge-functions";
import { addScriptures } from "@/lib/portal/mutations";
import type { AiSuggestion } from "@/lib/portal/types";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const KIND_OPTIONS: { key: SuggestionKind; label: string }[] = [
  { key: "scripture", label: "Scriptures" },
  { key: "quote", label: "Quotes" },
  { key: "mixed", label: "Mixed" },
];
const COUNT_OPTIONS = [5, 10, 20];

export function AiSuggestionsPanel({
  requestId,
  userId,
  onAdded,
}: {
  requestId: string;
  userId: string;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState<SuggestionKind>("scripture");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const result = await generateAiSuggestions({ requestId, count, kind });
    setLoading(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    setSuggestions(result.suggestions);
    setSelected(new Set(result.suggestions.map((_, i) => i)));
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleAddSelected() {
    const entries = suggestions
      .filter((_, i) => selected.has(i))
      .map((s) => ({ reference: s.reference, content: s.text, source: "ai" as const }));
    if (entries.length === 0) return;
    setAdding(true);
    const result = await addScriptures(userId, requestId, entries);
    setAdding(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast(`${entries.length} scripture${entries.length === 1 ? "" : "s"} added`, "success");
    setSuggestions((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    onAdded();
  }

  return (
    <GlassCard style={{ gap: spacing.md }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>AI Suggestions</Text>
        <MaterialCommunityIcons name="creation" size={16} color={colors.gold} />
      </View>

      <View style={styles.controlsRow}>
        {KIND_OPTIONS.map((opt) => (
          <PressableScale
            key={opt.key}
            haptic="selection"
            onPress={() => setKind(opt.key)}
            style={[styles.pill, kind === opt.key && styles.pillActive]}
          >
            <Text style={[styles.pillLabel, kind === opt.key && styles.pillLabelActive]}>{opt.label}</Text>
          </PressableScale>
        ))}
      </View>
      <View style={styles.controlsRow}>
        {COUNT_OPTIONS.map((n) => (
          <PressableScale
            key={n}
            haptic="selection"
            onPress={() => setCount(n)}
            style={[styles.pill, count === n && styles.pillActive]}
          >
            <Text style={[styles.pillLabel, count === n && styles.pillLabelActive]}>{n}</Text>
          </PressableScale>
        ))}
      </View>

      <PressableScale onPress={handleGenerate} disabled={loading} style={styles.generateButton}>
        {loading ? (
          <ActivityIndicator color="#1a1200" />
        ) : (
          <Text style={styles.generateButtonText}>
            {suggestions.length > 0 ? "Regenerate" : "Generate"}
          </Text>
        )}
      </PressableScale>

      {suggestions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {suggestions.map((s, i) => (
            <PressableScale key={i} onPress={() => toggle(i)} haptic="selection" style={styles.suggestionCard}>
              <MaterialCommunityIcons
                name={selected.has(i) ? "check-circle" : "circle-outline"}
                size={18}
                color={selected.has(i) ? colors.gold : colors.textFaint}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.suggestionHeaderRow}>
                  <Text style={styles.suggestionRef}>{s.reference}</Text>
                  <Text style={styles.suggestionType}>{s.type}</Text>
                </View>
                <Text style={styles.suggestionText}>{s.text}</Text>
              </View>
            </PressableScale>
          ))}
          <PressableScale
            onPress={handleAddSelected}
            disabled={selected.size === 0 || adding}
            style={[styles.generateButton, (selected.size === 0 || adding) && { opacity: 0.5 }]}
          >
            {adding ? (
              <ActivityIndicator color="#1a1200" />
            ) : (
              <Text style={styles.generateButtonText}>Add {selected.size} selected</Text>
            )}
          </PressableScale>
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { ...typography.heading, color: colors.text },
  controlsRow: { flexDirection: "row", gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.gold },
  pillLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: "600" },
  pillLabelActive: { color: "#1a1200" },
  generateButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  generateButtonText: { ...typography.caption, fontWeight: "700", color: "#1a1200" },
  suggestionCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  suggestionHeaderRow: { flexDirection: "row", justifyContent: "space-between" },
  suggestionRef: { ...typography.caption, color: colors.gold, fontWeight: "700" },
  suggestionType: { ...typography.tiny, color: colors.textFaint, textTransform: "uppercase" },
  suggestionText: { ...typography.tiny, color: colors.text, marginTop: 2 },
});
