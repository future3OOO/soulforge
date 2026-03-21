import type { Ord, Prod } from "./types.js";
import { usrOrds, listProds, getUsr } from "./god.js";

interface SalesReport {
  totalRevenue: number;
  orderCount: number;
  topProducts: Array<{ pid: string; qty: number; revenue: number }>;
}

export function salesReport(startDate?: number, endDate?: number): SalesReport {
  const allOrders: Ord[] = [];
  const prods = listProds();
  for (const p of prods) {
    const ords = usrOrds(p.id);
    allOrders.push(...ords);
  }

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
  for (const ord of allOrders) totalRevenue += ord.tot;

  return { totalRevenue, orderCount: allOrders.length, topProducts };
}

export function userActivity(uid: string) {
  const u = getUsr(uid);
  if (!u) return null;
  const ords = usrOrds(uid);
  const totalSpent = ords.reduce((sum, o) => sum + o.tot, 0);
  return {
    user: u,
    orderCount: ords.length,
    totalSpent,
    lastOrder: ords.length > 0 ? ords[ords.length - 1] : null,
  };
}

export function inventoryAlerts(): Array<{ product: Prod; status: "low" | "out" }> {
  return listProds()
    .filter((p) => p.stk <= 5)
    .map((p) => ({ product: p, status: p.stk === 0 ? "out" as const : "low" as const }));
}
