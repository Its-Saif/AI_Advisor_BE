import { query } from './db.js';

export type StoredMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  product?: any | null;
  candidates?: any[] | null;
  mode?: string | null;
  created_at: string;
};

export async function saveMessage(msg: {
  role: 'user' | 'assistant';
  content: string;
  product?: any | null;
  candidates?: any[] | null;
  mode?: string | null;
}) {
  const productJson = msg.product != null ? JSON.stringify(msg.product) : null;
  const candidatesJson = msg.candidates != null ? JSON.stringify(msg.candidates) : null;
  const res = await query<StoredMessage>(
    `INSERT INTO messages (role, content, product, candidates, mode)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING id, role, content, product, candidates, mode, created_at`,
    [msg.role, msg.content, productJson, candidatesJson, msg.mode ?? null]
  );
  return res.rows[0];
}

export async function listMessages(): Promise<StoredMessage[]> {
  const res = await query<StoredMessage>(
    `SELECT id, role, content, product, candidates, mode, created_at
     FROM messages
     ORDER BY id ASC`
  );
  return res.rows;
}

export async function clearMessages() {
  await query(`DELETE FROM messages`);
}

export async function getLastAssistantProduct(): Promise<any | null> {
  const res = await query(
    `SELECT product FROM messages
     WHERE role = 'assistant' AND product IS NOT NULL
     ORDER BY id DESC LIMIT 1`
  );
  return res.rows[0]?.product ?? null;
}

export async function getLastAssistantCandidates(): Promise<string[] | null> {
  const res = await query(
    `SELECT candidates FROM messages
     WHERE role = 'assistant' AND candidates IS NOT NULL
     ORDER BY id DESC LIMIT 1`
  );
  const rows = res.rows[0]?.candidates;
  if (!rows) return null;
  // Persist full rows or ids; if full rows, map to ids; if already ids, return as-is.
  if (Array.isArray(rows) && rows.length && rows[0]?.id) {
    return rows.map((r: any) => r.id);
  }
  if (Array.isArray(rows) && typeof rows[0] === 'string') return rows as string[];
  return null;
}

export async function getRecentTurns(limit = 6) {
  const res = await query(
    `SELECT role, content FROM messages
     ORDER BY id DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.reverse();
}