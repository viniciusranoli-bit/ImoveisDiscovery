import { randomUUID } from "node:crypto";
import { query } from "./client";

export type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const SESSION_REUSE_HOURS = 24;

export async function getOrCreateChatSession(userId: string) {
  const recent = await query<{ id: string }>(
    `
      SELECT id
      FROM tb_chat_sessions
      WHERE user_id = $1
        AND updated_at > now() - ($2::text || ' hours')::interval
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId, String(SESSION_REUSE_HOURS)],
  );
  const existing = recent.rows[0]?.id;
  if (existing) return existing;

  const id = randomUUID();
  await query(
    `INSERT INTO tb_chat_sessions (id, user_id) VALUES ($1, $2)`,
    [id, userId],
  );
  return id;
}

export async function touchChatSession(sessionId: string) {
  await query(`UPDATE tb_chat_sessions SET updated_at = now() WHERE id = $1`, [sessionId]);
}

export async function appendChatMessage(input: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const id = randomUUID();
  await query(
    `
      INSERT INTO tb_chat_messages (id, session_id, role, content, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [id, input.sessionId, input.role, input.content, JSON.stringify(input.metadata ?? {})],
  );
  await touchChatSession(input.sessionId);
  return id;
}

export async function readRecentChatMessages(sessionId: string, limit = 40) {
  const safeLimit = Math.min(Math.max(limit, 1), 80);
  const result = await query<{
    id: string;
    role: "user" | "assistant";
    content: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `
      SELECT id, role, content, metadata, created_at
      FROM tb_chat_messages
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [sessionId, safeLimit],
  );
  return result.rows
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
    }));
}

export async function countUserChatTurnsLastHour(userId: string) {
  const result = await query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM tb_chat_messages m
      JOIN tb_chat_sessions s ON s.id = m.session_id
      WHERE s.user_id = $1
        AND m.role = 'user'
        AND m.created_at > now() - interval '1 hour'
    `,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
