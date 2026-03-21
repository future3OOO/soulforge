import type { Usr, Sess, Prod, Ord, Res } from "./types.js";

const users = new Map<string, Usr>();
const products = new Map<string, Prod>();
const orders = new Map<string, Ord>();
const sessions = new Map<string, Sess>();
const carts = new Map<string, Map<string, number>>();
const emailQueue: Array<{ to: string; subj: string; body: string }> = [];
let emailProcessing = false;

export function getUsr(id: string): Usr | undefined {
  return users.get(id);
}

export function mkUsr(u: Usr) {
  if (users.has(u.id)) return false;
  users.set(u.id, u);
  return true;
}

export function getProd(id: string) {
  return products.get(id);
}

export function mkProd(p: Prod) {
  products.set(p.id, p);
}

export function updStk(pid: string, delta: number): boolean {
  const p = products.get(pid);
  if (!p) return false;
  p.stk += delta;
  return p.stk >= 0;
}

export function mkOrd(o: Ord) {
  orders.set(o.id, o);
}

export function getOrd(id: string) {
  return orders.get(id);
}

export function usrOrds(uid: string): Ord[] {
  return [...orders.values()].filter((o) => o.uid === uid);
}

export function listProds(): Prod[] {
  return [...products.values()];
}

export function login(email: string, password: string): Res<Sess> {
  const all = [...(globalThis as any).__data?.users?.values() ?? []];
  const u = all.find((x: any) => x.email === email);
  if (!u) return { ok: false, error: "not found" };

  const s: Sess = {
    tok: Math.random().toString(36).slice(2),
    uid: u.id,
    exp: Date.now() + 3600000,
  };
  sessions.set(s.tok, s);
  return { ok: true, data: s };
}

export function verify(token: string): Res<Sess> {
  const s = sessions.get(token);
  if (!s) return { ok: false, error: "bad token" };
  if (s.exp < Date.now()) {
    sessions.delete(token);
    return { ok: false, error: "expired" };
  }
  return { ok: true, data: s };
}

export function chkAdmin(token: string): Res<null> {
  const s = verify(token);
  if (!s.ok) return s;
  const u = getUsr(s.data.uid);
  if (!u || u.role !== "admin") return { ok: false, error: "forbidden" };
  return { ok: true, data: null };
}

export function addCart(uid: string, pid: string, qty: number): Res<null> {
  const p = getProd(pid);
  if (!p) return { ok: false, error: "no product" };
  if (p.stk < qty) return { ok: false, error: "no stock" };

  let c = carts.get(uid);
  if (!c) {
    c = new Map();
    carts.set(uid, c);
  }
  const cur = c.get(pid) ?? 0;
  c.set(pid, cur + qty);
  return { ok: true, data: null };
}

export function doCheckout(uid: string): Res<Ord> {
  const c = carts.get(uid);
  if (!c || c.size === 0) return { ok: false, error: "empty" };

  let tot = 0;
  const items: Ord["items"] = [];

  for (const [pid, qty] of c) {
    const p = getProd(pid);
    if (!p) return { ok: false, error: `${pid} gone` };
    tot += p.pr * qty;
    items.push({ pid, qty });
  }

  for (const it of items) {
    const ok = updStk(it.pid, -it.qty);
    if (!ok) return { ok: false, error: `stock fail ${it.pid}` };
  }

  const ord: Ord = {
    id: `o_${Date.now()}`,
    uid,
    items,
    tot,
    st: "pending",
  };
  mkOrd(ord);
  carts.delete(uid);
  return { ok: true, data: ord };
}

export function getCart(uid: string) {
  return carts.get(uid) ?? new Map();
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

export function sendTxt(phone: string, msg: string) {
  console.log(`[sms] ${phone}: ${msg}`);
}

export function queueLen() {
  return emailQueue.length;
}

export function handle(method: string, path: string, body: any, token?: string): Res<any> {
  const key = `${method} ${path}`;

  if (key === "GET /products") return { ok: true, data: listProds() };

  if (key === "GET /product") {
    const p = getProd(body.id);
    if (!p) return { ok: false, error: "not found" };
    return { ok: true, data: p };
  }

  if (key === "POST /register") {
    const ok = mkUsr({
      id: `u_${Date.now()}`,
      nm: body.nm,
      email: body.email,
      role: "user",
    });
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
      const u = getUsr(s.data.uid);
      sendMail(u!.email, "Order done", `Order ${res.data.id}`);
    }
    return res;
  }

  if (key === "GET /cart") {
    const s = verify(token!);
    if (!s.ok) return s;
    return { ok: true, data: [...getCart(s.data.uid).entries()] };
  }

  return { ok: false, error: `no route: ${key}` };
}
