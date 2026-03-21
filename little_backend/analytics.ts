import type { Order, Product } from "./types.js";
import { getUser, listOrders, listProducts, getUserOrders } from "./god.js";

interface SalesReport {
  totalRevenue: number;
  orderCount: number;
  topProducts: Array<{ pid: string; qty: number; revenue: number }>;
}

export function salesReport(startDate?: number, endDate?: number): SalesReport {
  const prods = listProducts();
  let allOrders = listOrders();
  if (startDate) allOrders = allOrders.filter((o) => o.ts >= startDate);
  if (endDate) allOrders = allOrders.filter((o) => o.ts <= endDate);

  const productSales = new Map<string, { qty: number; revenue: number }>();
  for (const ord of allOrders) {
    for (const item of ord.items) {
      const existing = productSales.get(item.pid) ?? { qty: 0, revenue: 0 };
      const prod = prods.find((p) => p.id === item.pid);
      existing.qty += item.qty;
      existing.revenue += (prod?.pr ?? 0) * item.qty;
      productSales.set(item.pid, existing);
    }
  }

  const topProducts = [...productSales.entries()]
    .map(([pid, stats]) => ({ pid, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  let totalRevenue = 0;
  for (const ord of allOrders) totalRevenue += ord.total;

  return { totalRevenue, orderCount: allOrders.length, topProducts };
}

export function userActivity(uid: string) {
  const u = getUser(uid);
  if (!u) return null;
  const ords = getUserOrders(uid);
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
    .filter((p) => p.stk <= 5)
    .map((p) => ({ product: p, status: p.stk === 0 ? "out" as const : "low" as const }));
}