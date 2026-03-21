import type { Order, Product, Res, Session, User } from "./types.js";
import { salesReport, userActivity, inventoryAlerts } from "./analytics.js";
import { validateUser, validateProduct } from "./validate.js";
import { authMiddleware, adminMiddleware } from "./middleware.js";

const users = new Map<string, User>();
const products = new Map<string, Product>();
const orders = new Map<string, Order>();
const sessions = new Map<string, Session>();
const userId = new Map<string, Map<string, number>>();
const emailQueue: Array<{ to: string; subj: string; body: string }> = [];
let emailProcessing = false;

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

export function createProduct(p: Product): Res<null> {
  const errors = validateProduct(p);
  if (errors.length > 0) return { ok: false, error: errors.join(", ") };
  products.set(p.id, p);
  return { ok: true, data: null };
}

export function updateStock(pid: string, delta: number): boolean {
  const p = products.get(pid);
  if (!p) return false;
  p.stk += delta;
  return p.stk >= 0;
}

export function createOrder(o: Order) {
  orders.set(o.id, o);
}

export function getOrder(id: string) {
  return orders.get(id);
}

export function getUserOrders(uid: string): Order[] {
  return [...orders.values()].filter((o) => o.uid === uid);
}

export function listProducts(): Product[] {
  return [...products.values()];
}

export function listOrders(): Order[] {
  return [...orders.values()];
}

export function login(email: string, password: string): Res<Session> {
  const u = [...users.values()].find((x) => x.email === email);
  if (!u) return { ok: false, error: "not found" };

  const s: Session = {
    token: Math.random().toString(36).slice(2),
    uid: u.id,
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
  const u = getUser(s.data.uid);
  if (!u || u.role !== "admin") return { ok: false, error: "forbidden" };
  return { ok: true, data: null };
}

export function addCart(uid: string, pid: string, qty: number): Res<null> {
  const p = getProduct(pid);
  if (!p) return { ok: false, error: "no product" };
  if (p.stk < qty) return { ok: false, error: "no stock" };

  let c = userId.get(uid);
  if (!c) {
    c = new Map();
    userId.set(uid, c);
  }
  const cur = c.get(pid) ?? 0;
  c.set(pid, cur + qty);
  return { ok: true, data: null };
}

export function doCheckout(uid: string): Res<Order> {
  const c = userId.get(uid);
  if (!c || c.size === 0) return { ok: false, error: "empty" };

  let tot = 0;
  const items: Order["items"] = [];
  const decremented: { pid: string; qty: number }[] = [];

  for (const [pid, qty] of c) {
    const p = getProduct(pid);
    if (!p) {
      for (const d of decremented) updateStock(d.pid, d.qty);
      return { ok: false, error: `${pid} gone` };
    }
    const ok = updateStock(pid, -qty);
    if (!ok) {
      updateStock(pid, qty);
      for (const d of decremented) updateStock(d.pid, d.qty);
      return { ok: false, error: `stock fail ${pid}` };
    }
    decremented.push({ pid, qty });
    tot += p.price * qty;
    items.push({ pid, qty });
  }

  const ord: Order = {
    id: `o_${Date.now()}`,
    uid,
    items,
    total,
    status: "pending",
    ts: Date.now(),
  };
  createOrder(ord);
  userId.delete(uid);
  return { ok: true, data: ord };
}

export function getCart(uid: string) {
  return userId.get(uid) ?? new Map();
}

export function sendMail(to: string, subj: string, body: string) {
  emailQueue.push({ to, subj, body });
  processEmails();
}

async function processEmails() {
  if (emailProcessing) return;
  emailProcessing = true;
  while (emailQueue.length > 0) {
    const msg = emailQueue.shift()!;
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[email] ${msg.to}: ${msg.subj}`);
  }
  emailProcessing = false;
}

export function sendText(phone: string, msg: string) {
  console.log(`[sms] ${phone}: ${msg}`);
}

export function queueLen() {
  return emailQueue.length;
}

export function handle(method: string, path: string, body: any, token?: string): Res<any> {
  const key = `${method} ${path}`;

  if (key === "GET /products") return { ok: true, data: listProducts() };

  if (key === "GET /product") {
    const p = getProduct(body.id);
    if (!p) return { ok: false, error: "not found" };
    return { ok: true, data: p };
  }

  if (key === "POST /register") {
    const usr = { id: `u_${Date.now()}`, nm: body.nm, email: body.email, role: "user" as const };
    const vErrors = validateUser(usr);
    if (vErrors.length > 0) return { ok: false, error: vErrors.join(", ") };
    const ok = createUser(usr);
    if (!ok) return { ok: false, error: "exists" };
    sendMail(body.email, "Welcome!", `Hi ${body.nm}`);
    return { ok: true, data: { ok: true } };
  }

  if (key === "POST /cart/add") {
    const s = verify(token!);
    if (!s.ok) return s;
    return addCart(s.data.uid, body.pid, body.qty);
  }

  if (key === "POST /checkout") {
    const s = verify(token!);
    if (!s.ok) return s;
    const res = doCheckout(s.data.uid);
    if (res.ok) {
      const u = getUser(s.data.uid);
      sendMail(u!.email, "Order done", `Order ${res.data.id}`);
    }
    return res;
  }

  if (key === "GET /cart") {
    const s = verify(token!);
    if (!s.ok) return s;
    return { ok: true, data: [...getCart(s.data.uid).entries()] };
  }

  if (key === "GET /analytics/sales") {
    const admin = checkAdmin(token!);
    if (!admin.ok) return admin;
    return { ok: true, data: salesReport(body?.startDate, body?.endDate) };
  }

  if (key === "GET /analytics/inventory") {
    const admin = checkAdmin(token!);
    if (!admin.ok) return admin;
    return { ok: true, data: inventoryAlerts() };
  }

  if (key === "GET /analytics/user") {
    const admin = checkAdmin(token!);
    if (!admin.ok) return admin;
    if (!body?.uid) return { ok: false, error: "uid required" };
    const activity = userActivity(body.uid);
    if (!activity) return { ok: false, error: "user not found" };
    return { ok: true, data: activity };
  }

  return { ok: false, error: `no route: ${key}` };
}
