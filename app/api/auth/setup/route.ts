import { NextResponse } from "next/server";
import { authSetupStatus } from "@/lib/auth/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(authSetupStatus(request));
}
