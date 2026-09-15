import { NextRequest, NextResponse } from "next/server";
import { pushMessage } from "@/lib/line";
import { addMessage, type MessageContent } from "@/lib/store";

function parseContent(body: unknown): MessageContent | null {
  if (typeof body !== "object" || body === null || !("content" in body)) return null;
  const content = (body as { content: unknown }).content;
  if (typeof content !== "object" || content === null) return null;

  const c = content as Record<string, unknown>;
  if (c.type === "text" && typeof c.text === "string" && c.text.trim()) {
    return { type: "text", text: c.text };
  }
  if (c.type === "sticker" && typeof c.packageId === "string" && typeof c.stickerId === "string") {
    return { type: "sticker", packageId: c.packageId, stickerId: c.stickerId };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId: string | undefined = body?.userId;
  const content = parseContent(body);

  if (!userId || !content) {
    return NextResponse.json({ error: "userId and a valid content are required" }, { status: 400 });
  }

  try {
    await pushMessage(userId, content);
  } catch (err) {
    console.error("Failed to push message:", err);
    return NextResponse.json({ error: "failed to send message to LINE" }, { status: 502 });
  }

  const message = await addMessage(userId, "outgoing", content);
  return NextResponse.json({ message });
}
