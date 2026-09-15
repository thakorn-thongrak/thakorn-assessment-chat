/**
 * In-memory message store, keyed by LINE userId.
 *
 * This is process-local: on Vercel every serverless invocation can land on a
 * different (or cold) instance, so messages can appear to "disappear" across
 * requests. It's fine for local dev and quick demos. Once you need messages
 * to survive across invocations/regions, swap this module for Vercel KV
 * (Upstash Redis) — same function signatures, just backed by `kv.rpush` /
 * `kv.lrange` instead of an in-memory array. Do that as soon as you deploy
 * to Vercel and need the webhook and polling routes to reliably share state.
 */

export type MessageDirection = "incoming" | "outgoing";

export interface ChatMessage {
  id: string;
  userId: string;
  direction: MessageDirection;
  text: string;
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
}

const messagesByUser = new Map<string, ChatMessage[]>();
const profileByUser = new Map<string, ConversationProfile>();
let nextId = 1;

export function addMessage(
  userId: string,
  direction: MessageDirection,
  text: string
): ChatMessage {
  const message: ChatMessage = {
    id: String(nextId++),
    userId,
    direction,
    text,
    timestamp: Date.now(),
  };
  const existing = messagesByUser.get(userId) ?? [];
  existing.push(message);
  messagesByUser.set(userId, existing);
  return message;
}

export function getMessages(userId: string, afterId?: string): ChatMessage[] {
  const all = messagesByUser.get(userId) ?? [];
  if (!afterId) return all;
  const afterIndex = all.findIndex((m) => m.id === afterId);
  return afterIndex === -1 ? all : all.slice(afterIndex + 1);
}

export function setProfile(userId: string, profile: ConversationProfile): void {
  profileByUser.set(userId, profile);
}

export function hasProfile(userId: string): boolean {
  return profileByUser.has(userId);
}

export function listConversations(): ConversationSummary[] {
  const summaries: ConversationSummary[] = [];
  for (const [userId, messages] of messagesByUser) {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) continue;
    summaries.push({ userId, profile: profileByUser.get(userId) ?? null, lastMessage });
  }
  return summaries.sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
}
