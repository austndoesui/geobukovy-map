import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require" });

const migration = readFileSync("supabase/migrations/00001_create_users_sessions.sql", "utf8");

try {
  await sql.unsafe(migration);
  console.log("Migration applied successfully");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
