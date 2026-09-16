/**
 * Message store backed by Upstash Redis (provisioned via the Vercel
 * Marketplace "Upstash for Redis" integration, free tier).
 *
 * Data model:
 * - `messages:{userId}` — a Redis list of ChatMessage, oldest first (RPUSH).
 * - `conversations`     — a sorted set of userIds, scored by last message
 *   time, so the conversation list can be read back most-recent-first.
 * - `profile:{userId}`  — the cached LINE display name/avatar for that user.
 * - `message:next_id`   — a counter (INCR) for globally unique message ids.
 * - `read:{userId}`     — the id of the last message the admin has seen in
 *   that conversation (message ids increase monotonically across every
 *   conversation, since they share one global counter, so a plain numeric
 *   comparison against a conversation's last message id is enough to tell
 *   whether it has unread activity).
 */

import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export type MessageDirection = "incoming" | "outgoing";

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "sticker"; packageId: string; stickerId: string };

export interface ChatMessage {
  id: string;
  userId: string;
  direction: MessageDirection;
  content: MessageContent;
  timestamp: number;
}

export interface ConversationProfile {
  displayName: string;
  pictureUrl?: string;
}

export interface ConversationSummary {
  userId: string;
  profile: ConversationProfile | null;
  lastMessage: ChatMessage;
  unread: boolean;
}

export async function addMessage(
  userId: string,
  direction: MessageDirection,
  content: MessageContent
): Promise<ChatMessage> {
  const id = String(await redis.incr("message:next_id"));
  const message: ChatMessage = { id, userId, direction, content, timestamp: Date.now() };

  await Promise.all([
    redis.rpush(`messages:${userId}`, message),
    redis.zadd("conversations", { score: message.timestamp, member: userId }),
  ]);

  return message;
}

/**
 * Removes a message from our own webchat history only — this has no effect
 * on LINE itself (there's no API for an OA to unsend a message it sent; the
 * only way a message ever disappears on LINE's side is the user doing it
 * themselves, in their own app).
 */
export async function deleteMessage(userId: string, id: string): Promise<boolean> {
  const key = `messages:${userId}`;
  const all = await redis.lrange<ChatMessage>(key, 0, -1);
  const remaining = all.filter((m) => m.id !== id);
  if (remaining.length === all.length) return false;

  await redis.del(key);
  if (remaining.length > 0) {
    await redis.rpush(key, ...remaining);
  } else {
    await redis.zrem("conversations", userId);
  }
  return true;
}

export async function getMessages(userId: string, afterId?: string): Promise<ChatMessage[]> {
  const all = await redis.lrange<ChatMessage>(`messages:${userId}`, 0, -1);
  if (!afterId) return all;
  const afterIndex = all.findIndex((m) => m.id === afterId);
  return afterIndex === -1 ? all : all.slice(afterIndex + 1);
}

export async function setProfile(userId: string, profile: ConversationProfile): Promise<void> {
  await redis.set(`profile:${userId}`, profile);
}

export async function hasProfile(userId: string): Promise<boolean> {
  return (await redis.exists(`profile:${userId}`)) === 1;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const userIds = await redis.zrange<string[]>("conversations", 0, -1, { rev: true });

  const summaries = await Promise.all(
    userIds.map(async (userId): Promise<ConversationSummary | null> => {
      const [profile, lastMessages, readId] = await Promise.all([
        redis.get<ConversationProfile>(`profile:${userId}`),
        redis.lrange<ChatMessage>(`messages:${userId}`, -1, -1),
        redis.get<string>(`read:${userId}`),
      ]);
      const lastMessage = lastMessages[0];
      if (!lastMessage) return null;

      const unread =
        lastMessage.direction === "incoming" &&
        (readId === null || Number(lastMessage.id) > Number(readId));

      return { userId, profile: profile ?? null, lastMessage, unread };
    })
  );

  return summaries.filter((s): s is ConversationSummary => s !== null);
}

/** Marks a conversation as read up to its current latest message. */
export async function markConversationRead(userId: string): Promise<void> {
  const latest = await redis.lrange<ChatMessage>(`messages:${userId}`, -1, -1);
  const lastMessage = latest[0];
  if (!lastMessage) return;
  await redis.set(`read:${userId}`, lastMessage.id);
}
