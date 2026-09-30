import { Pool, PoolClient } from "pg";

// One shared connection pool per Function App instance.
// DATABASE_URL is set in Azure: Function App -> Environment variables.
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

/**
 * Runs queries inside a transaction scoped to one org.
 * Row-Level Security then only lets these queries see that org's rows.
 */
export async function withOrg<T>(
  orgId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
