import { NextRequest } from "next/server";

export type Outcome = "answered" | "handoff" | "fallback" | "error" | "pending";
export type HistoryTurn = { event_id: string; line_user_id: string; question: string; reply: string | null; outcome: Outcome; delivered: boolean; created_at: string };
export const SESSION_COOKIE = "nadee_owner";
export function historyConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.HISTORY_OWNER_EMAIL);
}
export function retentionDays() {
  const days = Number(process.env.HISTORY_RETENTION_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : null;
}
export function recordingEnabled() {
  return historyConfigured() && process.env.HISTORY_ENABLED === "true" && retentionDays() !== null && !!process.env.HISTORY_NOTICE_VERSION;
}
function base() {
  const url = new URL(process.env.SUPABASE_URL!);
  if (url.protocol !== "https:") throw new Error("database_requires_https");
  return url.origin;
}
export async function database(path: string, method = "GET", body?: unknown) {
  if (!historyConfigured()) throw new Error("history_not_configured");
  const res = await fetch(`${base()}/rest/v1/${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(3000),
    headers: { apikey: process.env.SUPABASE_SECRET_KEY!, "Content-Type": "application/json", Prefer: "return=representation" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`history_database_${res.status}`);
  return res.status === 204 ? null : res.json();
}
export async function ownerFromToken(token: string): Promise<{ id: string; email: string } | null> {
  if (!historyConfigured() || !token || token.length > 6000) return null;
  const res = await fetch(`${base()}/auth/v1/user`, {
    cache: "no-store", signal: AbortSignal.timeout(3000),
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user.email_confirmed_at && user.email?.toLowerCase() === process.env.HISTORY_OWNER_EMAIL?.trim().toLowerCase() ? { id: user.id, email: user.email } : null;
}
export async function requireOwner(req: NextRequest) {
  return ownerFromToken(req.cookies.get(SESSION_COOKIE)?.value ?? "");
}
export async function signIn(email: string, password: string) {
  if (!historyConfigured() || email.trim().toLowerCase() !== process.env.HISTORY_OWNER_EMAIL?.trim().toLowerCase()) return null;
  const res = await fetch(`${base()}/auth/v1/token?grant_type=password`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) return null;
  const session = await res.json();
  const owner = await ownerFromToken(session.access_token);
  return owner ? { token: session.access_token as string, expires: Math.min(Number(session.expires_in) || 3600, 3600) } : null;
}
export async function recordTurn(turn: HistoryTurn) {
  if (!recordingEnabled()) return;
  try {
    await database("rpc/record_history_turn", "POST", { turn, keep_days: retentionDays() });
  } catch {
    // Never log message text, LINE identifiers, database error bodies, or credentials.
    console.error(JSON.stringify({ event: "history.write_failed", outcome: turn.outcome }));
  }
}
export function isSameOrigin(req: NextRequest) {
  return req.headers.get("origin") === new URL(req.url).origin;
}
export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function containsObviousPersonalData(text: string) {
  return /(?:\+?66|0)[\d\s-]{8,14}\d|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{13}\b/i.test(text);
}
export function weekBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid_date");
  const start = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(+start) || new Date(+start + 7 * 3600000).toISOString().slice(0, 10) !== date) throw new Error("invalid_date");
  return { start: start.toISOString(), end: new Date(+start + 7 * 86400000).toISOString() };
}
