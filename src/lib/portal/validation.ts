import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3–20 characters: lowercase letters, numbers, underscores");

/** Ghana phone: accepts 0XXXXXXXXX or 233XXXXXXXXX (+ optional +). */
export function normalizeGhanaPhone(input: string): string | null {
  const digits = input.replace(/[\s\-+]/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const requestSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(2000).optional(),
  voiceNotePath: z.string().max(300).optional(),
});

export const requestUpdateSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(2000).optional(),
});

export const logSchema = z.object({
  requestId: z.uuid(),
  prayedOn: z.iso.date().optional(),
  prayedAt: z.iso.time({ precision: -1 }).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  note: z.string().trim().max(500).optional(),
  voiceNotePath: z.string().max(300).optional(),
});

export const planSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    requestId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    frequency: z.enum(["daily", "weekly"]),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    timesPerPeriod: z.number().int().min(1).max(24),
    windowStart: z.iso.time().optional(),
    windowEnd: z.iso.time().optional(),
    endDate: z.iso.date().optional(),
  })
  .refine((v) => (v.requestId ? !v.categoryId : !!v.categoryId), {
    message: "Pick a prayer point or a category (not both)",
    path: ["categoryId"],
  })
  .refine((v) => !!v.windowStart === !!v.windowEnd, {
    message: "Set both a start and end time, or neither",
    path: ["windowEnd"],
  })
  .refine((v) => !v.windowStart || !v.windowEnd || v.windowStart < v.windowEnd, {
    message: "Start time must be before end time",
    path: ["windowEnd"],
  });

export const reminderSchema = z.object({
  label: z.string().trim().min(1).max(80),
  remindTime: z.iso.time(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
  leadMinutes: z.number().int().min(0).max(120),
  requestId: z.uuid().optional(),
});

export const profileSchema = z
  .object({
    timezone: z.string().min(1).max(60),
    phone: z.string().trim().max(20).optional(),
    smsOptIn: z.boolean(),
  })
  .refine((v) => !v.smsOptIn || !!(v.phone && normalizeGhanaPhone(v.phone)), {
    message: "Add a phone number to enable SMS reminders",
    path: ["phone"],
  });

export const scriptureSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  reference: z.string().trim().max(100).optional(),
  source: z.enum(["manual", "ai"]).default("manual"),
});

export const addScripturesSchema = z.object({
  requestId: z.uuid(),
  entries: z.array(scriptureSchema).min(1).max(20),
});
