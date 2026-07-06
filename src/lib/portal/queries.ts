import { format, subDays } from "date-fns";

import {
  categoryStore,
  logStore,
  planStore,
  profileStore,
  reminderStore,
  requestStore,
  scriptureStore,
} from "../db/local-store";
import { computePlanProgress } from "./progress";
import type {
  AnalyticsActiveRequest,
  AnalyticsLogEntry,
  Category,
  CategoryWithCount,
  DashboardRequest,
  DashboardStats,
  PlanWithProgress,
  PrayerLog,
  PrayerRequest,
  Profile,
  Reminder,
  RequestListItem,
  RequestStatus,
} from "./types";

/**
 * Every function here reads only from the local SQLite mirror (see
 * ../db/local-store.ts) — never the network. That's the whole point of the
 * offline-first rewrite: these reads are instant and work with zero
 * connectivity. Freshness comes from the sync engine (../db/sync.ts)
 * running in the background, not from these functions reaching out
 * themselves. See CLAUDE.md's "Offline-first architecture" section.
 */

export function getProfile(userId: string): Profile | null {
  return profileStore.get(userId);
}

/** Plans + adherence/streaks, computed from the last 84 days of local logs. */
export function getPlansWithProgress(userId: string): PlanWithProgress[] {
  const plans = planStore.listForUser(userId);
  const cutoff = format(subDays(new Date(), 84), "yyyy-MM-dd");
  const logs = logStore.listSince(userId, cutoff);
  const requests = requestStore.listForUser(userId);
  const categories = categoryStore.listForUser(userId);

  const requestById = new Map(requests.map((r) => [r.id, r]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return plans.map((plan) => {
    const planLogs = logs.filter((log) =>
      plan.request_id
        ? log.request_id === plan.request_id
        : requestById.get(log.request_id)?.category_id === plan.category_id,
    );
    const targetName = plan.request_id
      ? (requestById.get(plan.request_id)?.title ?? "(deleted)")
      : (categoryById.get(plan.category_id ?? "")?.name ?? "(deleted)");
    return {
      ...plan,
      targetName,
      progress: computePlanProgress(plan, planLogs),
    };
  });
}

export interface DashboardData {
  profile: Profile | null;
  plans: PlanWithProgress[];
  requests: DashboardRequest[];
  stats: DashboardStats;
}

export function getDashboardData(userId: string): DashboardData {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");

  const profile = getProfile(userId);
  const plans = getPlansWithProgress(userId);
  const activeRequests = requestStore.listActiveForUser(userId);
  const categories = categoryStore.listForUser(userId);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const logs = logStore.listForUser(userId);

  const lastPrayed = new Map<string, string>();
  for (const log of logs) {
    const current = lastPrayed.get(log.request_id);
    if (!current || log.prayed_on > current) lastPrayed.set(log.request_id, log.prayed_on);
  }

  const requests: DashboardRequest[] = activeRequests.map((r) => {
    const category = categoryById.get(r.category_id);
    return {
      id: r.id,
      title: r.title,
      categoryName: category?.name ?? "Uncategorized",
      categoryColor: category?.color ?? null,
      lastPrayedOn: lastPrayed.get(r.id) ?? null,
    };
  });

  const activePlans = plans.filter((p) => p.is_active);
  const stats: DashboardStats = {
    totalSessions: logs.length,
    sessionsToday: logs.filter((l) => l.prayed_on === today).length,
    sessionsThisWeek: logs.filter((l) => l.prayed_on >= weekAgo).length,
    bestStreak: activePlans.reduce((max, p) => Math.max(max, p.progress.streak), 0),
  };

  return { profile, plans: activePlans, requests, stats };
}

export function getCategoriesWithCount(userId: string): CategoryWithCount[] {
  return categoryStore.listForUser(userId).map((category) => ({
    ...category,
    requestCount: categoryStore.requestCount(category.id),
  }));
}

export interface RequestsListData {
  categories: Category[];
  requests: RequestListItem[];
}

export function getRequestsList(userId: string): RequestsListData {
  const categories = categoryStore.listForUser(userId);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const requests = requestStore.listForUser(userId);
  const logs = logStore.listForUser(userId);

  const byRequest = new Map<string, { count: number; last: string | null }>();
  for (const log of logs) {
    const entry = byRequest.get(log.request_id) ?? { count: 0, last: null };
    entry.count += 1;
    if (!entry.last || log.prayed_on > entry.last) entry.last = log.prayed_on;
    byRequest.set(log.request_id, entry);
  }

  const items: RequestListItem[] = requests.map((request) => {
    const category = categoryById.get(request.category_id);
    const stats = byRequest.get(request.id) ?? { count: 0, last: null };
    return {
      ...request,
      categoryName: category?.name ?? "Uncategorized",
      categoryColor: category?.color ?? null,
      logCount: stats.count,
      lastPrayedOn: stats.last,
    };
  });

  return { categories, requests: items };
}

export interface RequestDetailData {
  request: PrayerRequest & { categoryName: string; categoryColor: string | null };
  scriptures: ReturnType<typeof scriptureStore.listForRequest>;
  logs: PrayerLog[];
  categories: Category[];
  signedUrls: Record<string, string>;
}

export function getRequestDetail(userId: string, id: string): RequestDetailData | null {
  const request = requestStore.getById(id);
  if (!request) return null;

  const categories = categoryStore.listForUser(userId);
  const category = categories.find((c) => c.id === request.category_id);
  const scriptures = scriptureStore.listForRequest(id);
  const logs = logStore.listForRequest(id);

  // Voice-note playback needs a network round-trip for a signed URL — best
  // effort only, and deliberately not blocking the (offline-first) read
  // path. Screens should treat a missing entry here as "unavailable
  // offline" rather than an error.
  return {
    request: {
      ...request,
      categoryName: category?.name ?? "Uncategorized",
      categoryColor: category?.color ?? null,
    },
    scriptures,
    logs,
    categories,
    signedUrls: {},
  };
}

export interface PlansScreenData {
  plans: PlanWithProgress[];
  categories: Category[];
  activeRequests: Pick<PrayerRequest, "id" | "title" | "status">[];
}

export function getPlansScreenData(userId: string): PlansScreenData {
  return {
    plans: getPlansWithProgress(userId),
    categories: categoryStore.listForUser(userId),
    activeRequests: requestStore.listActiveForUser(userId),
  };
}

export interface AnalyticsData {
  logs: AnalyticsLogEntry[];
  activeRequests: AnalyticsActiveRequest[];
  plans: PlanWithProgress[];
}

export function getAnalyticsData(userId: string): AnalyticsData {
  const cutoff90 = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const allLogs = logStore.listForUser(userId);
  const logsInRange = allLogs.filter((l) => l.prayed_on >= cutoff90);
  const requests = requestStore.listForUser(userId);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const categories = categoryStore.listForUser(userId);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const logs: AnalyticsLogEntry[] = logsInRange.map((log) => {
    const request = requestById.get(log.request_id);
    const category = request ? categoryById.get(request.category_id) : undefined;
    return {
      prayedOn: log.prayed_on,
      minutes: log.duration_minutes,
      requestId: log.request_id,
      requestTitle: request?.title ?? "(deleted)",
      categoryName: category?.name ?? "Uncategorized",
      categoryColor: category?.color ?? null,
    };
  });

  const lastPrayedEver = new Map<string, string>();
  for (const log of allLogs) {
    const current = lastPrayedEver.get(log.request_id);
    if (!current || log.prayed_on > current) lastPrayedEver.set(log.request_id, log.prayed_on);
  }

  const activeRequests: AnalyticsActiveRequest[] = requests
    .filter((r) => r.status === "active")
    .map((r) => {
      const category = categoryById.get(r.category_id);
      return {
        id: r.id,
        title: r.title,
        categoryName: category?.name ?? "Uncategorized",
        categoryColor: category?.color ?? null,
        lastPrayedOn: lastPrayedEver.get(r.id) ?? null,
      };
    });

  return { logs, activeRequests, plans: getPlansWithProgress(userId).filter((p) => p.is_active) };
}

export interface SettingsData {
  profile: Profile | null;
  reminders: Reminder[];
  activeRequests: Pick<PrayerRequest, "id" | "title">[];
}

export function getSettingsData(userId: string): SettingsData {
  return {
    profile: getProfile(userId),
    reminders: reminderStore.listForUser(userId),
    activeRequests: requestStore.listActiveForUser(userId),
  };
}

export type { RequestStatus };
