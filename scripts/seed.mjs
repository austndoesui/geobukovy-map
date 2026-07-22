import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require" });

try {
  const existing = await sql`SELECT 1 FROM users LIMIT 1`;
  if (existing.length) {
    console.log("Users already exist, skipping seed");
    process.exit(0);
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("geobukovy2025"), "PBKDF2", false, ["deriveBits"]);
  const salt = crypto.randomUUID();
  const hashBuf = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    key, 256
  );
  const hash = Array.from(new Uint8Array(hashBuf), (v) => v.toString(16).padStart(2, "0")).join("");

  await sql`INSERT INTO users (username, password_hash, salt, role) VALUES (${"Tomáš Bukový"}, ${hash}, ${salt}, ${"admin"})`;
  console.log("Root admin created: username='Tomáš Bukový', password='geobukovy2025'");
} catch (err) {
  console.error("Seed failed:", err);
} finally {
  await sql.end();
}
