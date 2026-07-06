import { format, subDays } from "date-fns";

import { supabase } from "../supabase/client";
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
  PrayerPlan,
  PrayerRequest,
  Profile,
  Reminder,
  RequestListItem,
  RequestStatus,
  Scripture,
} from "./types";

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("portal_profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

/** Plans + adherence/streaks, computed from the last 84 days of logs. */
export async function getPlansWithProgress(): Promise<PlanWithProgress[]> {
  const cutoff = format(subDays(new Date(), 84), "yyyy-MM-dd");

  const [plansRes, logsRes, requestsRes] = await Promise.all([
    supabase
      .from("portal_prayer_plans")
      .select("*, portal_prayer_requests(title), portal_categories(name)")
      .order("created_at", { ascending: true }),
    supabase.from("portal_prayer_logs").select("*").gte("prayed_on", cutoff),
    supabase.from("portal_prayer_requests").select("id, category_id"),
  ]);

  const requestCategory = new Map(
    (requestsRes.data ?? []).map((r) => [r.id, r.category_id]),
  );
  const logs = (logsRes.data ?? []) as PrayerLog[];

  return (
    (plansRes.data ?? []) as (PrayerPlan & {
      portal_prayer_requests: { title: string } | null;
      portal_categories: { name: string } | null;
    })[]
  ).map((row) => {
    const { portal_prayer_requests, portal_categories, ...plan } = row;
    const planLogs = logs.filter((log) =>
      plan.request_id
        ? log.request_id === plan.request_id
        : requestCategory.get(log.request_id) === plan.category_id,
    );
    return {
      ...plan,
      targetName: portal_prayer_requests?.title ?? portal_categories?.name ?? "(deleted)",
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

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");

  const [profile, plans, requestsRes, logsRes] = await Promise.all([
    getProfile(userId),
    getPlansWithProgress(),
    supabase
      .from("portal_prayer_requests")
      .select("id, title, portal_categories(name, color)")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.from("portal_prayer_logs").select("request_id, prayed_on"),
  ]);

  const logs = (logsRes.data ?? []) as { request_id: string; prayed_on: string }[];
  const lastPrayed = new Map<string, string>();
  for (const log of logs) {
    const current = lastPrayed.get(log.request_id);
    if (!current || log.prayed_on > current) lastPrayed.set(log.request_id, log.prayed_on);
  }

  const requests: DashboardRequest[] = (
    (requestsRes.data ?? []) as unknown as {
      id: string;
      title: string;
      portal_categories: { name: string; color: string | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    title: r.title,
    categoryName: r.portal_categories?.name ?? "Uncategorized",
    categoryColor: r.portal_categories?.color ?? null,
    lastPrayedOn: lastPrayed.get(r.id) ?? null,
  }));

  const activePlans = plans.filter((p) => p.is_active);
  const stats: DashboardStats = {
    totalSessions: logs.length,
    sessionsToday: logs.filter((l) => l.prayed_on === today).length,
    sessionsThisWeek: logs.filter((l) => l.prayed_on >= weekAgo).length,
    bestStreak: activePlans.reduce((max, p) => Math.max(max, p.progress.streak), 0),
  };

  return { profile, plans: activePlans, requests, stats };
}

export async function getCategoriesWithCount(): Promise<CategoryWithCount[]> {
  const { data } = await supabase
    .from("portal_categories")
    .select("*, portal_prayer_requests(count)")
    .order("created_at", { ascending: true });

  return (
    (data ?? []) as unknown as (Category & {
      portal_prayer_requests: { count: number }[];
    })[]
  ).map((row) => {
    const { portal_prayer_requests, ...category } = row;
    return { ...category, requestCount: portal_prayer_requests?.[0]?.count ?? 0 };
  });
}

export interface RequestsListData {
  categories: Category[];
  requests: RequestListItem[];
}

export async function getRequestsList(): Promise<RequestsListData> {
  const [categoriesRes, requestsRes, logsRes] = await Promise.all([
    supabase.from("portal_categories").select("*").order("created_at", { ascending: true }),
    supabase
      .from("portal_prayer_requests")
      .select("*, portal_categories(name, color)")
      .order("created_at", { ascending: false }),
    supabase.from("portal_prayer_logs").select("request_id, prayed_on"),
  ]);

  const logs = (logsRes.data ?? []) as { request_id: string; prayed_on: string }[];
  const byRequest = new Map<string, { count: number; last: string | null }>();
  for (const log of logs) {
    const entry = byRequest.get(log.request_id) ?? { count: 0, last: null };
    entry.count += 1;
    if (!entry.last || log.prayed_on > entry.last) entry.last = log.prayed_on;
    byRequest.set(log.request_id, entry);
  }

  const requests: RequestListItem[] = (
    (requestsRes.data ?? []) as unknown as (PrayerRequest & {
      portal_categories: { name: string; color: string | null } | null;
    })[]
  ).map((row) => {
    const { portal_categories, ...request } = row;
    const stats = byRequest.get(request.id) ?? { count: 0, last: null };
    return {
      ...request,
      categoryName: portal_categories?.name ?? "Uncategorized",
      categoryColor: portal_categories?.color ?? null,
      logCount: stats.count,
      lastPrayedOn: stats.last,
    };
  });

  return { categories: categoriesRes.data ?? [], requests };
}

export interface RequestDetailData {
  request: PrayerRequest & { categoryName: string; categoryColor: string | null };
  scriptures: Scripture[];
  logs: PrayerLog[];
  categories: Category[];
  signedUrls: Record<string, string>;
}

export async function getRequestDetail(id: string): Promise<RequestDetailData | null> {
  const [requestRes, scripturesRes, logsRes, categoriesRes] = await Promise.all([
    supabase.from("portal_prayer_requests").select("*, portal_categories(*)").eq("id", id).maybeSingle(),
    supabase
      .from("portal_scriptures")
      .select("*")
      .eq("request_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("portal_prayer_logs")
      .select("*")
      .eq("request_id", id)
      .order("prayed_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("portal_categories").select("*").order("created_at", { ascending: true }),
  ]);

  if (!requestRes.data) return null;

  const { portal_categories, ...request } = requestRes.data as unknown as PrayerRequest & {
    portal_categories: Category | null;
  };
  const scriptures = (scripturesRes.data ?? []) as Scripture[];
  const logs = (logsRes.data ?? []) as PrayerLog[];

  const paths = [
    request.voice_note_path,
    ...logs.map((l) => l.voice_note_path),
  ].filter((p): p is string => !!p);

  const signedUrls: Record<string, string> = {};
  if (paths.length > 0) {
    const { data } = await supabase.storage
      .from("portal-voice-notes")
      .createSignedUrls(paths, 3600);
    for (const entry of data ?? []) {
      if (entry.signedUrl && entry.path) signedUrls[entry.path] = entry.signedUrl;
    }
  }

  return {
    request: {
      ...request,
      categoryName: portal_categories?.name ?? "Uncategorized",
      categoryColor: portal_categories?.color ?? null,
    },
    scriptures,
    logs,
    categories: categoriesRes.data ?? [],
    signedUrls,
  };
}

export interface PlansScreenData {
  plans: PlanWithProgress[];
  categories: Category[];
  activeRequests: Pick<PrayerRequest, "id" | "title" | "status">[];
}

export async function getPlansScreenData(): Promise<PlansScreenData> {
  const [plans, categoriesRes, requestsRes] = await Promise.all([
    getPlansWithProgress(),
    supabase.from("portal_categories").select("*").order("created_at", { ascending: true }),
    supabase
      .from("portal_prayer_requests")
      .select("id, title, status")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  return {
    plans,
    categories: categoriesRes.data ?? [],
    activeRequests: requestsRes.data ?? [],
  };
}

export interface AnalyticsData {
  logs: AnalyticsLogEntry[];
  activeRequests: AnalyticsActiveRequest[];
  plans: PlanWithProgress[];
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  const cutoff90 = format(subDays(new Date(), 90), "yyyy-MM-dd");

  const [logsRes, requestsRes, plans, allLogsRes] = await Promise.all([
    supabase
      .from("portal_prayer_logs")
      .select("prayed_on, duration_minutes, request_id, portal_prayer_requests(title, portal_categories(name, color))")
      .gte("prayed_on", cutoff90),
    supabase
      .from("portal_prayer_requests")
      .select("id, title, status, portal_categories(name, color)")
      .eq("status", "active"),
    getPlansWithProgress(),
    supabase.from("portal_prayer_logs").select("request_id, prayed_on"),
  ]);

  const logs: AnalyticsLogEntry[] = (
    (logsRes.data ?? []) as unknown as {
      prayed_on: string;
      duration_minutes: number | null;
      request_id: string;
      portal_prayer_requests: {
        title: string;
        portal_categories: { name: string; color: string | null } | null;
      } | null;
    }[]
  ).map((row) => ({
    prayedOn: row.prayed_on,
    minutes: row.duration_minutes,
    requestId: row.request_id,
    requestTitle: row.portal_prayer_requests?.title ?? "(deleted)",
    categoryName: row.portal_prayer_requests?.portal_categories?.name ?? "Uncategorized",
    categoryColor: row.portal_prayer_requests?.portal_categories?.color ?? null,
  }));

  const allLogs = (allLogsRes.data ?? []) as { request_id: string; prayed_on: string }[];
  const lastPrayedEver = new Map<string, string>();
  for (const log of allLogs) {
    const current = lastPrayedEver.get(log.request_id);
    if (!current || log.prayed_on > current) lastPrayedEver.set(log.request_id, log.prayed_on);
  }

  const activeRequests: AnalyticsActiveRequest[] = (
    (requestsRes.data ?? []) as unknown as {
      id: string;
      title: string;
      portal_categories: { name: string; color: string | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    title: r.title,
    categoryName: r.portal_categories?.name ?? "Uncategorized",
    categoryColor: r.portal_categories?.color ?? null,
    lastPrayedOn: lastPrayedEver.get(r.id) ?? null,
  }));

  return { logs, activeRequests, plans: plans.filter((p) => p.is_active) };
}

export interface SettingsData {
  profile: Profile | null;
  reminders: Reminder[];
  activeRequests: Pick<PrayerRequest, "id" | "title">[];
}

export async function getSettingsData(userId: string): Promise<SettingsData> {
  const [profile, remindersRes, requestsRes] = await Promise.all([
    getProfile(userId),
    supabase.from("portal_reminders").select("*").order("remind_time", { ascending: true }),
    supabase
      .from("portal_prayer_requests")
      .select("id, title")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  return {
    profile,
    reminders: remindersRes.data ?? [],
    activeRequests: requestsRes.data ?? [],
  };
}

export type { RequestStatus };
