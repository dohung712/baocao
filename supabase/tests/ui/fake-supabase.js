// Giả lập supabase-js tối thiểu cho kiểm thử: dịch các lệnh truy vấn sang SQL và gửi tới /__db
const PK = { settings: "key", locked_dates: "d", staff: "id", memberships: "email", items: "id", staff_targets: "staff_id,item_name" };
const argLit = (v) => {
  if (Array.isArray(v) && !v.some((x) => x && typeof x === "object")) return v.length ? `array[${v.map(lit).join(",")}]` : "'{}'";
  return v !== null && typeof v === "object" ? lit(JSON.stringify(v)) + "::jsonb" : lit(v);
};
const lit = (v) => v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
let EMAIL = localStorage.getItem("fake-email");

async function db(sql) {
  const r = await fetch("/__db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, sql }) });
  return r.json();
}

class Q {
  constructor(t) { this.t = t; this.w = []; this.o = []; this.lim = null; this.off = null; this.op = "select"; this.cols = "*"; this.opts = {}; }
  select(cols = "*", opts = {}) { if (this.op === "select") { this.cols = cols; this.opts = opts; } return this; }
  eq(c, v) { this.w.push(`${c} = ${lit(v)}`); return this; }
  gte(c, v) { this.w.push(`${c} >= ${lit(v)}`); return this; }
  lte(c, v) { this.w.push(`${c} <= ${lit(v)}`); return this; }
  in(c, arr) { this.w.push(`${c} in (${arr.map(lit).join(",")})`); return this; }
  order(c, o = {}) { this.o.push(`${c} ${o.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
  insert(v) { this.op = "insert"; this.val = Array.isArray(v) ? v : [v]; return this; }
  upsert(v) { this.op = "upsert"; this.val = Array.isArray(v) ? v : [v]; return this; }
  update(v) { this.op = "update"; this.val = v; return this; }
  delete() { this.op = "delete"; return this; }
  sql() {
    const where = this.w.length ? " where " + this.w.join(" and ") : "";
    const t = "public." + this.t;
    if (this.op === "select") {
      if (this.opts.head) return `select json_build_object('count', count(*)) from ${t}${where}`;
      return `select coalesce(json_agg(x), '[]') from (select ${this.cols} from ${t}${where}${this.o.length ? " order by " + this.o.join(",") : ""}${this.lim != null ? " limit " + this.lim : ""}${this.off != null ? " offset " + this.off : ""}) x`;
    }
    if (this.op === "insert" || this.op === "upsert") {
      const cols = Object.keys(this.val[0]);
      const json = lit(JSON.stringify(this.val));
      let s = `insert into ${t} (${cols.join(",")}) select ${cols.join(",")} from json_populate_recordset(null::${t}, ${json}::json)`;
      if (this.op === "upsert") s += ` on conflict (${PK[this.t]}) do update set ${cols.filter((c) => !PK[this.t].split(",").includes(c)).map((c) => `${c} = excluded.${c}`).join(",") || PK[this.t] + " = excluded." + PK[this.t]}`;
      return `with r as (${s} returning 1) select json_build_object('n', count(*)) from r`;
    }
    if (this.op === "update") {
      const sets = Object.entries(this.val).map(([k, v]) => `${k} = ${Array.isArray(v) ? `array[${v.map(lit).join(",")}]::text[]` : lit(v)}`).join(",");
      return `with r as (update ${t} set ${sets}${where} returning 1) select json_build_object('n', count(*)) from r`;
    }
    return `with r as (delete from ${t}${where} returning 1) select json_build_object('n', count(*)) from r`;
  }
  then(ok, bad) {
    return db(this.sql()).then((r) => {
      if (r.error) return { data: null, error: r.error };
      if (this.op === "select" && this.opts.head) return { data: null, count: r.data.count, error: null };
      return { data: this.op === "select" ? r.data : null, error: null };
    }).then(ok, bad);
  }
}

export function createClient() {
  const listeners = [];
  const session = () => EMAIL ? { access_token: "fake", user: { email: EMAIL } } : null;
  return {
    from: (t) => new Q(t),
    rpc: async (fn, args = {}) => {
      const a = Object.entries(args).map(([k, v]) => `${k} => ${argLit(v)}`).join(", ");
      const isTable = fn === "leaderboard";
      if (a.includes("::jsonb") === false) {} 
      const r = await db(isTable ? `select coalesce(json_agg(x), '[]') from public.${fn}(${a}) x` : `select to_json(public.${fn}(${a}))`);
      return r.error ? { data: null, error: r.error } : { data: r.data, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: session()?.user || null } }),
      getSession: async () => ({ data: { session: session() } }),
      signInWithPassword: async ({ email }) => { EMAIL = email; localStorage.setItem("fake-email", email); listeners.forEach((f) => f("SIGNED_IN")); return { error: null }; },
      signOut: async () => { EMAIL = null; localStorage.removeItem("fake-email"); listeners.forEach((f) => f("SIGNED_OUT")); return { error: null }; },
      onAuthStateChange: (f) => { listeners.push(f); return { data: { subscription: { unsubscribe() {} } } }; },
      updateUser: async () => ({ error: null }), signInWithOtp: async () => ({ error: null }), verifyOtp: async () => ({ error: null }), setSession: async () => ({ error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=" } }) }) },
    channel: () => { const c = { on: () => c, subscribe: (cb) => { setTimeout(() => cb("SUBSCRIBED"), 10); return c; } }; return c; },
    removeChannel: () => {},
  };
}
