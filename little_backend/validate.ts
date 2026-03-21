import type { Order, Product, User } from "./types.js";

export function validateEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

export function validateUser(u: Partial<User>): string[] {
  const errors: string[] = [];
  if (!u.name || u.name.length < 2) errors.push("name too short");
  if (!u.email || !validateEmail(u.email)) errors.push("bad email");
  if (!u.role) errors.push("role required");
  return errors;
}

export function validateProduct(p: Partial<Product>): string[] {
  const errors: string[] = [];
  if (!p.name) errors.push("name required");
  if (!p.desc) errors.push("desc required");
  if (!p.category) errors.push("category required");
  if (p.price == null || p.price < 0) errors.push("bad price");
  if (p.stock == null || p.stock < 0) errors.push("bad stock");
  return errors;
}

export function validateOrder(o: Partial<Order>): string[] {
  const errors: string[] = [];
  if (!o.userId) errors.push("userId required");
  if (!o.items || o.items.length === 0) errors.push("no items");
  if (o.total != null && o.total < 0) errors.push("negative total");
  return errors;
}