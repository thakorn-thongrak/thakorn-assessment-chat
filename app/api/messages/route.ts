import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const after = searchParams.get("after") ?? undefined;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const messages = await getMessages(userId, after);
  return NextResponse.json({ messages });
}
