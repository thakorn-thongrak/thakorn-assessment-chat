import { NextRequest, NextResponse } from "next/server";
import {
  verifySignature,
  replyMessage,
  getProfile,
  type LineWebhookBody,
  type OutboundMessage,
} from "@/lib/line";
import { addMessage, hasProfile, setProfile, type MessageContent } from "@/lib/store";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body: LineWebhookBody = JSON.parse(rawBody);

  for (const event of body.events ?? []) {
    if (event.type !== "message" || !event.message) continue;

    const userId = event.source?.userId;
    if (!userId) continue;

    let content: MessageContent;
    let ack: OutboundMessage;

    if (event.message.type === "text" && event.message.text) {
      content = { type: "text", text: event.message.text };
      ack = { type: "text", text: `ได้รับข้อความแล้ว: ${event.message.text}` };
    } else if (event.message.type === "sticker" && event.message.packageId && event.message.stickerId) {
      content = { type: "sticker", packageId: event.message.packageId, stickerId: event.message.stickerId };
      ack = { type: "text", text: "ได้รับสติกเกอร์แล้ว" };
    } else {
      continue;
    }

    addMessage(userId, "incoming", content);

    if (!hasProfile(userId)) {
      try {
        const profile = await getProfile(userId);
        if (profile) setProfile(userId, profile);
      } catch (err) {
        console.error("Failed to fetch LINE profile:", err);
      }
    }

    if (event.replyToken) {
      try {
        await replyMessage(event.replyToken, ack);
      } catch (err) {
        console.error("Failed to reply:", err);
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
