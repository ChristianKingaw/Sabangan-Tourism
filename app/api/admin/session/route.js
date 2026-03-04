import { getAdminSessionFromRequest } from "../../../../lib/adminAuth";
import { isLocalAdminRequest } from "../../../../lib/adminAccess";

export const runtime = "nodejs";

export async function GET(request) {
  if (!isLocalAdminRequest(request)) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, authenticated: false }, { status: 200 });
  }

  return Response.json({
    ok: true,
    authenticated: true,
    username: session.username
  });
}
