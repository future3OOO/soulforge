import type { Usr, Prod, Ord } from "./types.js";

export function validateEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

export function validateUsr(u: Partial<Usr>): string[] {
  const errors: string[] = [];
  if (!u.nm || u.nm.length < 2) errors.push("nm too short");
  if (!u.email || !validateEmail(u.email)) errors.push("bad email");
  if (!u.role) errors.push("role required");
  return errors;
}

export function validateProd(p: Partial<Prod>): string[] {
  const errors: string[] = [];
  if (!p.nm) errors.push("nm required");
  if (p.pr == null || p.pr < 0) errors.push("bad price");
  if (p.stk == null || p.stk < 0) errors.push("bad stock");
  return errors;
}

export function validateOrd(o: Partial<Ord>): string[] {
  const errors: string[] = [];
  if (!o.uid) errors.push("uid required");
  if (!o.items || o.items.length === 0) errors.push("no items");
  if (o.tot != null && o.tot < 0) errors.push("negative total");
  return errors;
}
