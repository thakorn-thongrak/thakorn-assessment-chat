import { NextRequest, NextResponse } from "next/server";
import { pushMessage } from "@/lib/line";
import { addMessage } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId: string | undefined = body?.userId;
  const text: string | undefined = body?.text;

  if (!userId || !text) {
    return NextResponse.json({ error: "userId and text are required" }, { status: 400 });
  }

  try {
    await pushMessage(userId, text);
  } catch (err) {
    console.error("Failed to push message:", err);
    return NextResponse.json({ error: "failed to send message to LINE" }, { status: 502 });
  }

  const message = addMessage(userId, "outgoing", text);
  return NextResponse.json({ message });
}
