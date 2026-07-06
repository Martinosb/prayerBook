/**
 * Offline-aware prayer logging, mirroring Connexional-Prayer-Board's
 * lib/portal/offline/log-queue.ts (see docs/PORTAL_SPEC.md §9) with
 * AsyncStorage standing in for IndexedDB and NetInfo standing in for
 * navigator.onLine.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

import { logPrayerAction, stampLogInput, type LogInput } from "./mutations";

const STORAGE_KEY = "pb-pending-logs";

interface QueuedLog {
  id: string;
  input: LogInput;
  queuedAt: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let pendingCount = 0;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribePendingCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingCount(): number {
  return pendingCount;
}

async function readQueue(): Promise<QueuedLog[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedLog[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedLog[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage write failed (e.g. quota) — queue lives in memory only this session.
  }
  pendingCount = queue.length;
  notify();
}

export async function initPendingCount(): Promise<void> {
  const queue = await readQueue();
  pendingCount = queue.length;
  notify();
}

export type LogResult = { ok: true; queued?: boolean } | { error: string };

/** Single entry point every screen should call instead of logPrayerAction directly. */
export async function queueLogPrayer(userId: string, input: LogInput): Promise<LogResult> {
  const stamped = stampLogInput(input);
  const netState = await NetInfo.fetch();

  if (!netState.isConnected) {
    await enqueue(stamped);
    return { ok: true, queued: true };
  }

  try {
    const result = await logPrayerAction(userId, stamped);
    if ("error" in result) return result;
    return { ok: true };
  } catch {
    await enqueue(stamped);
    return { ok: true, queued: true };
  }
}

async function enqueue(input: LogInput): Promise<void> {
  const queue = await readQueue();
  queue.push({ id: crypto.randomUUID(), input, queuedAt: Date.now() });
  await writeQueue(queue);
}

let inFlight: Promise<{ synced: number; dropped: number }> | null = null;

/** FIFO, single-flight: sync one at a time, drop on validation error, stop on network failure. */
export async function flushPendingLogs(userId: string): Promise<{ synced: number; dropped: number }> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let queue = (await readQueue()).sort((a, b) => a.queuedAt - b.queuedAt);
    let synced = 0;
    let dropped = 0;

    while (queue.length > 0) {
      const [next, ...rest] = queue;
      try {
        const result = await logPrayerAction(userId, next.input);
        if ("error" in result) {
          dropped += 1;
          queue = rest;
          await writeQueue(queue);
          continue;
        }
        synced += 1;
        queue = rest;
        await writeQueue(queue);
      } catch {
        break; // still offline — leave remainder queued
      }
    }

    return { synced, dropped };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
