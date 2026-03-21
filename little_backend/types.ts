export interface Usr {
  id: string;
  nm: string;
  email: string;
  role: "admin" | "user";
}

export interface Sess {
  tok: string;
  uid: string;
  exp: number;
}

export interface Prod {
  id: string;
  nm: string;
  pr: number;
  stk: number;
}

export interface Ord {
  id: string;
  uid: string;
  items: { pid: string; qty: number }[];
  tot: number;
  st: "pending" | "paid" | "shipped";
}

export type Res<T> = { ok: true; data: T } | { ok: false; error: string };
