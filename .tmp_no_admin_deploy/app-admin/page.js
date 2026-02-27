import { headers } from "next/headers";
import { notFound } from "next/navigation";
import AdminLocalPortal from "../../components/AdminLocalPortal";
import { isLocalAdminHostHeader } from "../../lib/adminAccess";

export const runtime = "nodejs";

export default async function AdminPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  if (!isLocalAdminHostHeader(host)) {
    notFound();
  }

  return <AdminLocalPortal />;
}
