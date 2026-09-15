import { NextRequest, NextResponse } from "next/server";
import { deleteMessage, getMessages } from "@/lib/store";

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

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const id = searchParams.get("id");

  if (!userId || !id) {
    return NextResponse.json({ error: "userId and id are required" }, { status: 400 });
  }

  const deleted = await deleteMessage(userId, id);
  if (!deleted) {
    return NextResponse.json({ error: "message not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "ok" });
}
