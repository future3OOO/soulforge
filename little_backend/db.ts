import type { User, Product, Order } from "./types.js";

export const users = new Map<string, User>();
export const products = new Map<string, Product>();
export const orders = new Map<string, Order>();

export function getUser(id: string): User | undefined {
  return users.get(id);
}

export function createUser(u: User) {
  if (users.has(u.id)) return false;
  users.set(u.id, u);
  return true;
}

export function getProduct(id: string) {
  return products.get(id);
}

export function createProduct(p: Product) {
  products.set(p.id, p);
}

export function updateStock(productId: string, delta: number): boolean {
  const p = products.get(productId);
  if (!p) return false;
  p.stock += delta;
  return p.stock >= 0;
}

export function createOrder(o: Order) {
  orders.set(o.id, o);
}

export function getOrder(id: string) {
  return orders.get(id);
}

export function getUserOrders(userId: string): Order[] {
  return [...orders.values()].filter((o) => o.userId === userId);
}

export function listProducts(): Product[] {
  return [...products.values()];
}

export function listOrders(): Order[] {
  return [...orders.values()];
}

export function searchProducts(query: string, category?: string): Product[] {
  const q = query.toLowerCase();
  return [...products.values()].filter((p) => {
    const matchesQuery =
      p.name.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q));
    const matchesCategory = !category || p.category === category;
    return matchesQuery && matchesCategory;
  });
}