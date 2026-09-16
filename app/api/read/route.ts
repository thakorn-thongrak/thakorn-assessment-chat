import { NextRequest, NextResponse } from "next/server";
import { markConversationRead } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId: string | undefined = body?.userId;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await markConversationRead(userId);
  return NextResponse.json({ status: "ok" });
}
