// runner/db.js
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.QA_DB_URL,
  ssl: { rejectUnauthorized: false }
});