const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function stripPort(host) {
  const trimmed = String(host || "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const first = trimmed.split(",")[0].trim();
  if (!first) {
    return "";
  }

  if (first.startsWith("[") && first.includes("]")) {
    const closingIndex = first.indexOf("]");
    return first.slice(0, closingIndex + 1);
  }

  return first.split(":")[0];
}

export function isLocalAdminHostHeader(hostHeader) {
  const hostname = stripPort(hostHeader);
  if (!hostname) {
    return false;
  }

  if (LOCAL_HOSTNAMES.has(hostname)) {
    return true;
  }

  return hostname.endsWith(".localhost");
}

export function isLocalAdminRequest(request) {
  const forwardedHost = request?.headers?.get("x-forwarded-host") || "";
  const host = request?.headers?.get("host") || "";
  return isLocalAdminHostHeader(forwardedHost || host);
}
