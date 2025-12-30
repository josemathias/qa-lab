import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool() {
  if (!process.env.QA_DB_URL) {
    throw new Error("QA_DB_URL não definido em .env.local");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.QA_DB_URL,
      ssl: { rejectUnauthorized: false }, // Neon normalmente requer SSL
    });
  }
  return pool;
}