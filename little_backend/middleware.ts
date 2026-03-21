import type { Res } from "./types.js";
import { verify, chkAdmin, getUsr } from "./god.js";

export function authMiddleware(token: string | undefined): Res<string> {
  if (!token) return { ok: false, error: "missing token" };
  const s = verify(token);
  if (!s.ok) return s as Res<string>;
  return { ok: true, data: s.data.uid };
}

export function adminMiddleware(token: string | undefined): Res<null> {
  if (!token) return { ok: false, error: "missing token" };
  return chkAdmin(token);
}

export function rateLimit(ip: string): boolean {
  const now = Date.now();
  const window = rateLimits.get(ip);
  if (!window) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (now > window.resetAt) {
    window.count = 1;
    window.resetAt = now + 60000;
    return true;
  }
  window.count++;
  return window.count <= 100;
}

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function logRequest(method: string, path: string, uid?: string) {
  const entry = {
    ts: Date.now(),
    method,
    path,
    uid: uid ?? "anon",
  };
  requestLog.push(entry);
  if (requestLog.length > 1000) requestLog.shift();
}

const requestLog: Array<{ ts: number; method: string; path: string; uid: string }> = [];

export function getRecentRequests(limit = 50) {
  return requestLog.slice(-limit);
}

export function clearRateLimits() {
  rateLimits.clear();
}
