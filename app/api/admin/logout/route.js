import { NextResponse } from "next/server";
import { getAdminCookieName } from "../../../../lib/adminAuth";
import { isLocalAdminRequest } from "../../../../lib/adminAccess";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isLocalAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getAdminCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
