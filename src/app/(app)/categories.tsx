import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createCategory, deleteCategory, updateCategory } from "@/lib/portal/mutations";
import { CATEGORY_COLORS, PRESET_CATEGORIES } from "@/lib/portal/presets";
import { getCategoriesWithCount } from "@/lib/portal/queries";
import type { CategoryWithCount } from "@/lib/portal/types";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export default function CategoriesScreen() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<CategoryWithCount[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<CategoryWithCount | null | "new">(null);
  const [deleting, setDeleting] = useState<CategoryWithCount | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setCategories(getCategoriesWithCount(user.id));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete() {
    if (!deleting || !user) return;
    const result = deleteCategory(user.id, deleting.id);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast("Category deleted", "success");
    setDeleting(null);
    load();
  }

  if (!categories) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Categories</Text>
          <Button variant="glass" onPress={() => setEditing("new")}>
            + New
          </Button>
        </View>

        {categories.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="folder-heart" size={32} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>No categories yet</Text>
            <PressableScale onPress={() => setEditing("new")}>
              <Text style={styles.emptyAction}>Create your first category →</Text>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.grid}>
            {categories.map((category, i) => (
              <Animated.View
                key={category.id}
                entering={FadeIn.duration(300).delay(i * 40)}
                style={styles.gridItem}
              >
                <PressableScale
                  onPress={() =>
                    router.push({ pathname: "/(app)/requests", params: { category: category.id } })
                  }
                >
                  <GlassCard style={styles.categoryCard}>
                    <View style={styles.categoryTopRow}>
                      <View style={[styles.iconChip, { backgroundColor: `${category.color ?? colors.gold}26` }]}>
                        <MaterialCommunityIcons
                          name="folder-heart"
                          size={18}
                          color={category.color ?? colors.gold}
                        />
                      </View>
                      <View style={styles.cardActions}>
                        <PressableScale onPress={() => setEditing(category)} haptic="selection">
                          <MaterialCommunityIcons name="pencil" size={16} color={colors.textMuted} />
                        </PressableScale>
                        <PressableScale onPress={() => setDeleting(category)} haptic="selection">
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                        </PressableScale>
                      </View>
                    </View>
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {category.name}
                    </Text>
                    {category.description ? (
                      <Text style={styles.categoryDescription} numberOfLines={2}>
                        {category.description}
                      </Text>
                    ) : null}
                    <Text style={styles.categoryCount}>
                      {category.requestCount} prayer point{category.requestCount === 1 ? "" : "s"}
                    </Text>
                  </GlassCard>
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <CategoryEditor
        visible={editing !== null}
        editing={editing === "new" ? null : editing}
        existingNames={categories.map((c) => c.name.toLowerCase())}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        userId={user?.id ?? ""}
      />

      <Sheet visible={deleting !== null} onClose={() => setDeleting(null)}>
        <Text style={styles.sheetTitle}>Delete "{deleting?.name}"?</Text>
        <Text style={styles.sheetBody}>
          {deleting && deleting.requestCount > 0
            ? `This also removes its ${deleting.requestCount} prayer point${deleting.requestCount === 1 ? "" : "s"}, including their scriptures and prayer history. This cannot be undone.`
            : "This cannot be undone."}
        </Text>
        <View style={styles.sheetActions}>
          <Button variant="glass" onPress={() => setDeleting(null)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onPress={handleDelete} style={{ flex: 1 }}>
            Delete
          </Button>
        </View>
      </Sheet>
    </View>
  );
}

function CategoryEditor({
  visible,
  editing,
  existingNames,
  onClose,
  onSaved,
  userId,
}: {
  visible: boolean;
  editing: CategoryWithCount | null;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(editing?.name ?? "");
      setDescription(editing?.description ?? "");
      setColor(editing?.color ?? CATEGORY_COLORS[0]);
    }
  }, [visible, editing]);

  const availablePresets = PRESET_CATEGORIES.filter(
    (p) => !existingNames.includes(p.name.toLowerCase()),
  );

  function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const input = { name: name.trim(), description: description.trim() || undefined, color };
    const result = editing
      ? updateCategory(userId, editing.id, input)
      : createCategory(userId, input);
    setSaving(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    showToast(editing ? "Category updated" : "Category created", "success");
    onSaved();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>{editing ? "Edit category" : "New category"}</Text>

        {!editing && availablePresets.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {availablePresets.map((preset) => (
                <PressableScale
                  key={preset.name}
                  haptic="selection"
                  onPress={() => {
                    setName(preset.name);
                    setDescription(preset.description);
                    setColor(preset.color);
                  }}
                  style={[styles.presetChip, { borderColor: `${preset.color}55` }]}
                >
                  <Text style={{ color: preset.color, fontWeight: "600", fontSize: 12 }}>{preset.name}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
        ) : null}

        <View style={{ gap: spacing.md }}>
          <Input placeholder="Name" value={name} onChangeText={setName} maxLength={60} />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChangeText={setDescription}
            maxLength={300}
            multiline
            numberOfLines={2}
            style={{ minHeight: 56, textAlignVertical: "top" }}
          />
          <View style={styles.swatchRow}>
            {CATEGORY_COLORS.map((swatch) => (
              <Pressable key={swatch} onPress={() => setColor(swatch)}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch },
                    color === swatch && styles.swatchSelected,
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <Button onPress={handleSave} disabled={!name.trim() || saving} loading={saving} fullWidth>
            {editing ? "Save changes" : "Create category"}
          </Button>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  gridItem: {
    width: "48%",
  },
  categoryCard: {
    gap: spacing.xs,
    minHeight: 120,
  },
  categoryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  categoryName: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  categoryDescription: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  categoryCount: {
    ...typography.tiny,
    color: colors.textFaint,
    marginTop: "auto",
  },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
  },
  emptyAction: {
    ...typography.caption,
    color: colors.goldSoft,
    fontWeight: "600",
  },
  sheetTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sheetBody: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
});
