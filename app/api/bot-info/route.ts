import { NextResponse } from "next/server";
import { getBotInfo } from "@/lib/line";

export async function GET() {
  const botInfo = await getBotInfo();
  return NextResponse.json({ botInfo });
}
