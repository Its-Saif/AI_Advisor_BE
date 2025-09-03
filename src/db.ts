import { Pool, type QueryResult, type QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({ connectionString });

export async function query<R extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<R>> {
  const client = await pool.connect();
  try {
    const res = await client.query<R>(text, params);
    return res;
  } finally {
    client.release();
  }
}