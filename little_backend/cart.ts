import type { Order, Res } from "./types.js";
import { getProduct, updateStock, createOrder } from "./db.js";

const carts = new Map<string, Map<string, number>>();

export function addCart(userId: string, productId: string, qty: number): Res<null> {
  const p = getProduct(productId);
  if (!p) return { ok: false, error: "no product" };
  if (p.stock < qty) return { ok: false, error: "no stock" };

  let c = carts.get(userId);
  if (!c) {
    c = new Map();
    carts.set(userId, c);
  }
  const cur = c.get(productId) ?? 0;
  c.set(productId, cur + qty);
  return { ok: true, data: null };
}

export function doCheckout(userId: string): Res<Order> {
  const c = carts.get(userId);
  if (!c || c.size === 0) return { ok: false, error: "empty" };

  let total = 0;
  const items: Order["items"] = [];

  for (const [productId, qty] of c) {
    const p = getProduct(productId);
    if (!p) return { ok: false, error: `${productId} gone` };
    total += p.price * qty;
    items.push({ productId, qty });
  }

  for (const it of items) {
    const ok = updateStock(it.productId, -it.qty);
    if (!ok) return { ok: false, error: `stock fail ${it.productId}` };
  }

  const ord: Order = {
    id: `o_${Date.now()}`,
    userId,
    items,
    total,
    status: "pending",
  };
  createOrder(ord);
  carts.delete(userId);
  return { ok: true, data: ord };
}

export function getCart(userId: string) {
  return carts.get(userId) ?? new Map();
}