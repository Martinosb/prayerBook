// Domain types mirroring Connexional-Prayer-Board's lib/portal/types.ts
// (see docs/PORTAL_SPEC.md §1). Keep field names identical to the web app.

export interface Profile {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  sms_opt_in: boolean;
  timezone: string;
  last_ai_request_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export type RequestStatus = "active" | "answered" | "archived";

export interface PrayerRequest {
  id: string;
  user_id: string;
  category_id: string;
  title: string;
  details: string | null;
  status: RequestStatus;
  answered_at: string | null;
  voice_note_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scripture {
  id: string;
  user_id: string;
  request_id: string;
  content: string;
  reference: string | null;
  source: "manual" | "ai";
  position: number;
  created_at: string;
}

export interface PrayerLog {
  id: string;
  user_id: string;
  request_id: string;
  prayed_on: string; // date
  prayed_at: string | null; // time
  duration_minutes: number | null;
  note: string | null;
  voice_note_path: string | null;
  created_at: string;
}

export type PlanFrequency = "daily" | "weekly";

export interface PrayerPlan {
  id: string;
  user_id: string;
  request_id: string | null;
  category_id: string | null;
  title: string;
  frequency: PlanFrequency;
  days_of_week: number[] | null; // 0=Sun..6=Sat
  times_per_period: number;
  window_start: string | null; // time
  window_end: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  request_id: string | null;
  label: string;
  remind_time: string; // time, user-local
  days_of_week: number[];
  lead_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiSuggestion {
  type: "scripture" | "quote";
  reference: string;
  text: string;
}

// ---- Derived/composed shapes used by screens (see PORTAL_SPEC.md §1) ----

export interface PlanProgress {
  adherence7: number | null;
  adherence30: number | null;
  streak: number;
  currentPeriodDone: number;
  currentPeriodTarget: number;
}

export interface PlanWithProgress extends PrayerPlan {
  targetName: string;
  progress: PlanProgress;
}

export interface CategoryWithCount extends Category {
  requestCount: number;
}

export interface RequestListItem extends PrayerRequest {
  categoryName: string;
  categoryColor: string | null;
  logCount: number;
  lastPrayedOn: string | null;
}

export interface DashboardRequest {
  id: string;
  title: string;
  categoryName: string;
  categoryColor: string | null;
  lastPrayedOn: string | null;
}

export interface DashboardStats {
  totalSessions: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  bestStreak: number;
}

export interface AnalyticsLogEntry {
  prayedOn: string;
  minutes: number | null;
  requestId: string;
  requestTitle: string;
  categoryName: string;
  categoryColor: string | null;
}

export interface AnalyticsActiveRequest {
  id: string;
  title: string;
  categoryName: string;
  categoryColor: string | null;
  lastPrayedOn: string | null;
}
