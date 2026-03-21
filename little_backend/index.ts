import { handle, mkUsr, mkProd, sendMail } from "./god.js";
import { salesReport, inventoryAlerts } from "./analytics.js";
import { logRequest } from "./middleware.js";

export function processRequest(
  method: string,
  path: string,
  body: any,
  token?: string,
  ip?: string,
) {
  logRequest(method, path);
  const result = handle(method, path, body, token);
  return result;
}

export function seedData() {
  mkUsr({ id: "u_admin", nm: "Admin", email: "admin@test.com", role: "admin" });
  mkUsr({ id: "u_jane", nm: "Jane", email: "jane@test.com", role: "user" });
  mkProd({ id: "p_1", nm: "Widget", pr: 9.99, stk: 100 });
  mkProd({ id: "p_2", nm: "Gadget", pr: 24.99, stk: 50 });
  mkProd({ id: "p_3", nm: "Doohickey", pr: 4.99, stk: 200 });
}

export function runDailyReport() {
  const report = salesReport();
  const alerts = inventoryAlerts();
  sendMail(
    "admin@test.com",
    "Daily Report",
    `Revenue: $${String(report.totalRevenue)} | Orders: ${String(report.orderCount)} | Low stock: ${String(alerts.length)}`,
  );
  return { report, alerts };
}
