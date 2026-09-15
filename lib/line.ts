import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot/message";

function getChannelSecret(): string {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error("LINE_CHANNEL_SECRET is not set");
  return secret;
}

function getAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  return token;
}

/**
 * Verifies the `x-line-signature` header against the raw request body using
 * the channel secret, per LINE's webhook signature spec (HMAC-SHA256, base64).
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = crypto
    .createHmac("sha256", getChannelSecret())
    .update(rawBody)
    .digest("base64");

  const expected = Buffer.from(hash);
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export type OutboundMessage =
  | { type: "text"; text: string }
  | { type: "sticker"; packageId: string; stickerId: string };

export async function replyMessage(replyToken: string, message: OutboundMessage): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE reply failed: ${res.status} ${body}`);
  }
}

export async function pushMessage(userId: string, message: OutboundMessage): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [message],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

export interface LineProfile {
  displayName: string;
  pictureUrl?: string;
}

export async function getProfile(userId: string): Promise<LineProfile | null> {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return { displayName: data.displayName, pictureUrl: data.pictureUrl };
}

export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type: string; text?: string; packageId?: string; stickerId?: string };
  timestamp?: number;
}

/**
 * Public CDN URL LINE documents for rendering a sticker image from its id —
 * works for any sticker (official or user-sent), not just ones we picked.
 */
export function stickerImageUrl(stickerId: string): string {
  return `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
}

export interface LineWebhookBody {
  destination?: string;
  events: LineWebhookEvent[];
}
