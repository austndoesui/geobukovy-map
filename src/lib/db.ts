import postgres from "postgres";

const globalSql = globalThis as typeof globalThis & { __db?: ReturnType<typeof postgres> };

export function getDb() {
  if (globalSql.__db) return globalSql.__db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  globalSql.__db = postgres(url, { ssl: "require", max: 2 });
  return globalSql.__db;
}
