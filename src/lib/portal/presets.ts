/** Preset categories users can pick from — selecting one just creates a normal row. */
export const PRESET_CATEGORIES = [
  { name: "Academics", description: "Studies, exams and excellence", color: "#3b82f6" },
  { name: "Family", description: "Parents, siblings and loved ones", color: "#ef4444" },
  { name: "Health", description: "Healing and wholeness", color: "#22c55e" },
  { name: "Ministry & Church", description: "The work of God and His people", color: "#b8923f" },
  { name: "Finances", description: "Provision and stewardship", color: "#10b981" },
  { name: "Nation", description: "Ghana, leaders and society", color: "#f59e0b" },
  { name: "Friends", description: "Companions and colleagues", color: "#8b5cf6" },
  { name: "Spiritual Growth", description: "Intimacy with God, character and faith", color: "#ec4899" },
] as const;

/** Accent palette offered in the category dialog. */
export const CATEGORY_COLORS = [
  "#b8923f",
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
  "#06b6d4",
] as const;
