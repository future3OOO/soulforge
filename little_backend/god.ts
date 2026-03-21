import type { Res } from "./types.js";
import { getUser, createUser, getProduct, listProducts, searchProducts } from "./db.js";
import { login, verify } from "./auth.js";
import { addCart, doCheckout, getCart } from "./cart.js";
import { sendMail } from "./notifications.js";

// Re-export so existing importers keep working
export { getUser, createUser, getProduct, createProduct, updateStock, createOrder, getOrder, getUserOrders, listProducts, listOrders, searchProducts } from "./db.js";
export { login, verify, checkAdmin } from "./auth.js";
export { addCart, doCheckout, getCart } from "./cart.js";
export { sendMail, sendText, queueLen, getFailedEmails, retryFailedEmails } from "./notifications.js";

export function handle(method: string, path: string, body: any, token?: string): Res<any> {
  const key = `${method} ${path}`;

  if (key === "GET /products") return { ok: true, data: listProducts() };

  if (key === "GET /product") {
    const p = getProduct(body.id);
    if (!p) return { ok: false, error: "not found" };
    return { ok: true, data: p };
  }

  if (key === "GET /search") {
    const q = body?.q;
    if (!q || typeof q !== "string") return { ok: false, error: "q required" };
    return { ok: true, data: searchProducts(q, body?.category) };
  }

  if (key === "POST /login") {
    return login(body.email, body.password);
  }

  if (key === "POST /register") {
    const ok = createUser({
      id: `u_${Date.now()}`,
      name: body.name,
      email: body.email,
      role: "user",
    });
    if (!ok) return { ok: false, error: "exists" };
    sendMail(body.email, "Welcome!", `Hi ${body.name}`);
    return { ok: true, data: { ok: true } };
  }

  if (key === "POST /cart/add") {
    const s = verify(token!);
    if (!s.ok) return s;
    return addCart(s.data.userId, body.productId, body.qty);
  }

  if (key === "POST /checkout") {
    const s = verify(token!);
    if (!s.ok) return s;
    const res = doCheckout(s.data.userId);
    if (res.ok) {
      const u = getUser(s.data.userId);
      sendMail(u!.email, "Order done", `Order ${res.data.id}`);
    }
    return res;
  }

  if (key === "GET /cart") {
    const s = verify(token!);
    if (!s.ok) return s;
    return { ok: true, data: [...getCart(s.data.userId).entries()] };
  }

  return { ok: false, error: `no route: ${key}` };
}