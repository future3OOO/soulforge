export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

export interface Session {
  token: string;
  uid: string;
  exp: number;
}

export interface Product {
  id: string;
  name: string;
  desc: string;
  category: string;
  tags: string[];
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  uid: string;
  items: { pid: string; qty: number }[];
  total: number;
  status: "pending" | "paid" | "shipped";
}

export type Res<T> = { ok: true; data: T } | { ok: false; error: string };
