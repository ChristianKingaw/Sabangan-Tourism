export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    now: Date.now(),
    iso: new Date().toISOString()
  });
}
