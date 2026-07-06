import type { PrayerPlan } from "./types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2× a day on Mon, Wed, Fri, 06:00–07:00" — mirrors the web app's describePlan(). */
export function describePlan(plan: Pick<PrayerPlan, "frequency" | "times_per_period" | "days_of_week" | "window_start" | "window_end">): string {
  const periodWord = plan.frequency === "daily" ? "day" : "week";
  const timesText = plan.times_per_period === 1 ? "once" : `${plan.times_per_period}×`;
  const parts = [`${timesText} a ${periodWord}`];

  if (plan.days_of_week && plan.days_of_week.length > 0 && plan.days_of_week.length < 7) {
    parts.push(`on ${[...plan.days_of_week].sort().map((d) => DAY_NAMES[d]).join(", ")}`);
  }

  if (plan.window_start && plan.window_end) {
    parts.push(`${plan.window_start.slice(0, 5)}–${plan.window_end.slice(0, 5)}`);
  }

  return parts.join(", ");
}
