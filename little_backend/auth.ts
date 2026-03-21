import type { Session, Res } from "./types.js";
import { users, getUser } from "./db.js";

const sessions = new Map<string, Session>();

export function login(email: string, _password: string): Res<Session> {
  const u = [...users.values()].find((x) => x.email === email);
  if (!u) return { ok: false, error: "not found" };

  const s: Session = {
    token: Math.random().toString(36).slice(2),
    userId: u.id,
    exp: Date.now() + 3600000,
  };
  sessions.set(s.token, s);
  return { ok: true, data: s };
}

export function verify(token: string): Res<Session> {
  const s = sessions.get(token);
  if (!s) return { ok: false, error: "bad token" };
  if (s.exp < Date.now()) {
    sessions.delete(token);
    return { ok: false, error: "expired" };
  }
  return { ok: true, data: s };
}

export function checkAdmin(token: string): Res<null> {
  const s = verify(token);
  if (!s.ok) return s;
  const u = getUser(s.data.userId);
  if (!u || u.role !== "admin") return { ok: false, error: "forbidden" };
  return { ok: true, data: null };
}