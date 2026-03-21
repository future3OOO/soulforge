import type { Order, Product } from "./types.js";
import { getUser, listOrders, listProducts, getUserOrders } from "./db.js";

interface SalesReport {
  totalRevenue: number;
  orderCount: number;
  topProducts: Array<{ productId: string; qty: number; revenue: number }>;
}

export function salesReport(_startDate?: number, _endDate?: number): SalesReport {
  const prods = listProducts();
  const allOrders = listOrders();

  const productSales = new Map<string, { qty: number; revenue: number }>();
  for (const ord of allOrders) {
    for (const item of ord.items) {
      const existing = productSales.get(item.productId) ?? { qty: 0, revenue: 0 };
      const prod = prods.find((p) => p.id === item.productId);
      existing.qty += item.qty;
      existing.revenue += (prod?.price ?? 0) * item.qty;
      productSales.set(item.productId, existing);
    }
  }

  const topProducts = [...productSales.entries()]
    .map(([productId, stats]) => ({ productId, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  let totalRevenue = 0;
  for (const ord of allOrders) totalRevenue += ord.total;

  return { totalRevenue, orderCount: allOrders.length, topProducts };
}

export function userActivity(userId: string) {
  const u = getUser(userId);
  if (!u) return null;
  const ords = getUserOrders(userId);
  const totalSpent = ords.reduce((sum, o) => sum + o.total, 0);
  return {
    user: u,
    orderCount: ords.length,
    totalSpent,
    lastOrder: ords.length > 0 ? ords[ords.length - 1] : null,
  };
}

export function inventoryAlerts(): Array<{ product: Product; status: "low" | "out" }> {
  return listProducts()
    .filter((p) => p.stock <= 5)
    .map((p) => ({ product: p, status: p.stock === 0 ? "out" as const : "low" as const }));
}