import { NextRequest, NextResponse } from "next/server";
import { verifySignature, replyMessage, getProfile, type LineWebhookBody } from "@/lib/line";
import { addMessage, hasProfile, setProfile } from "@/lib/store";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body: LineWebhookBody = JSON.parse(rawBody);

  for (const event of body.events ?? []) {
    if (event.type !== "message" || event.message?.type !== "text") continue;

    const userId = event.source?.userId;
    const text = event.message.text;
    if (!userId || !text) continue;

    addMessage(userId, "incoming", text);

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
        await replyMessage(event.replyToken, `ได้รับข้อความแล้ว: ${text}`);
      } catch (err) {
        console.error("Failed to reply:", err);
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
