import pg from "pg";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

export function createPool(config: AppConfig): DbPool {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on("error", (error) => {
    logger.error({ err: error.message }, "Unexpected PostgreSQL pool error");
  });
  return pool;
}

export async function checkDatabase(pool: DbPool): Promise<boolean> {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
