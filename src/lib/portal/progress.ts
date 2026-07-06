/**
 * Pure plan-progress math. A "period" is a day (daily plans) or an ISO week
 * (weekly plans). A period is "met" when it has at least `times_per_period`
 * qualifying logs. Logs without a time still count toward windowed plans —
 * quick logging is never punished.
 *
 * Ported verbatim from Connexional-Prayer-Board/lib/portal/progress.ts —
 * keep in sync with that file (see docs/PORTAL_SPEC.md §5).
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  isBefore,
  parseISO,
  startOfWeek,
} from "date-fns";

import type { PlanProgress, PrayerLog, PrayerPlan } from "./types";

function dayEligible(plan: PrayerPlan, date: Date): boolean {
  if (!plan.days_of_week || plan.days_of_week.length === 0) return true;
  return plan.days_of_week.includes(date.getDay());
}

function logQualifies(plan: PrayerPlan, log: PrayerLog): boolean {
  const date = parseISO(log.prayed_on);
  if (!dayEligible(plan, date)) return false;
  if (plan.window_start && plan.window_end && log.prayed_at) {
    const time = log.prayed_at.slice(0, 5);
    return (
      time >= plan.window_start.slice(0, 5) && time <= plan.window_end.slice(0, 5)
    );
  }
  return true;
}

function periodKey(plan: PrayerPlan, date: Date): string {
  return plan.frequency === "daily"
    ? format(date, "yyyy-MM-dd")
    : format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function periodExpected(plan: PrayerPlan, key: string, today: Date): boolean {
  const start = parseISO(plan.start_date);
  const end = plan.end_date ? parseISO(plan.end_date) : null;
  if (plan.frequency === "daily") {
    const date = parseISO(key);
    if (isBefore(date, start) || (end && isBefore(end, date))) return false;
    if (isBefore(today, date)) return false;
    return dayEligible(plan, date);
  }
  const weekStart = parseISO(key);
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (isBefore(date, start) || (end && isBefore(end, date))) continue;
    if (isBefore(today, date)) continue;
    if (dayEligible(plan, date)) return true;
  }
  return false;
}

export function computePlanProgress(
  plan: PrayerPlan,
  logs: PrayerLog[],
  today: Date = new Date(),
  lookbackDays = 84,
): PlanProgress {
  const done = new Map<string, number>();
  for (const log of logs) {
    if (!logQualifies(plan, log)) continue;
    const key = periodKey(plan, parseISO(log.prayed_on));
    done.set(key, (done.get(key) ?? 0) + 1);
  }

  const currentKey = periodKey(plan, today);
  const periods: { key: string; met: boolean; expected: boolean }[] = [];
  const step = plan.frequency === "daily" ? 1 : 7;
  const anchor =
    plan.frequency === "daily" ? today : startOfWeek(today, { weekStartsOn: 1 });

  for (let offset = 0; offset <= lookbackDays; offset += step) {
    const date = addDays(anchor, -offset);
    if (isBefore(date, addDays(parseISO(plan.start_date), -step))) break;
    const key = periodKey(plan, date);
    const expected = periodExpected(plan, key, today);
    const met = (done.get(key) ?? 0) >= plan.times_per_period;
    periods.push({ key, met, expected });
  }

  const adherence = (days: number): number | null => {
    const cutoff = addDays(today, -days);
    const relevant = periods.filter(
      (p) => p.expected && !isBefore(parseISO(p.key), cutoff),
    );
    if (relevant.length === 0) return null;
    return relevant.filter((p) => p.met).length / relevant.length;
  };

  let streak = 0;
  for (const period of periods) {
    if (!period.expected) continue;
    if (period.key === currentKey) {
      if (period.met) streak++;
      continue;
    }
    if (period.met) {
      streak++;
    } else {
      break;
    }
  }

  const currentExpected = periodExpected(plan, currentKey, today);
  return {
    adherence7: adherence(7),
    adherence30: adherence(30),
    streak,
    currentPeriodDone: Math.min(done.get(currentKey) ?? 0, plan.times_per_period),
    currentPeriodTarget: currentExpected ? plan.times_per_period : 0,
  };
}

export function daysSince(
  dateStr: string | null,
  today: Date = new Date(),
): number | null {
  if (!dateStr) return null;
  return differenceInCalendarDays(today, parseISO(dateStr));
}
