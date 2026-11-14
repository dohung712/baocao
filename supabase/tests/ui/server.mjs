// Máy chủ thử nghiệm giao diện v2: phục vụ file tĩnh + endpoint /__db chạy SQL trên Postgres cục bộ
// với vai trò "authenticated" (RLS bật) như Supabase thật.
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../../../", import.meta.url).pathname;     // gốc repo
const DB = process.env.TEST_DB || "t1";
const PORT = Number(process.env.PORT || 8790);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json" };

function runSql(email, sql) {
  const claims = JSON.stringify({ email, sub: "00000000-0000-0000-0000-000000000001" }).replace(/'/g, "''");
  const full = `set role authenticated; select set_config('request.jwt.claims', '${claims}', false); ${sql}`;
  try {
    const out = execFileSync("psql", ["-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", DB, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", full], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const rest = out.replace(/^[^\n]*\n?/, "").trim();   // bỏ dòng kết quả của set_config
    return { data: rest ? JSON.parse(rest) : null };
  } catch (e) {
    const msg = String(e.stderr || e.message).split("\n").find((l) => l.includes("ERROR")) || String(e.stderr || e.message);
    return { error: { message: msg.replace(/^.*ERROR:\s*/, "") } };
  }
}

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__db") {
    let body = ""; req.on("data", (c) => body += c);
    req.on("end", () => {
      const { email, sql } = JSON.parse(body);
      const r = runSql(email, sql);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(r));
    });
    return;
  }
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = normalize(join(ROOT, url));
  if (url.endsWith("/")) file = join(file, "index.html");
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log("ui test server on", PORT));
