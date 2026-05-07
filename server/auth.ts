import { clerkMiddleware, getAuth } from "@clerk/express";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Express, RequestHandler } from "express";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
const CLERK_PROXY_PATH = "/api/__clerk";

const rawDomains = process.env.ALLOWED_EMAIL_DOMAINS || "";
const ALLOWED_EMAIL_DOMAINS = rawDomains
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const rawEmails = process.env.ALLOWED_EMAILS || "";
const ALLOWED_EMAILS_SET = new Set(
  rawEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

/** Check if an email is allowed by domain or exact match. */
function isEmailAllowed(email: string): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (ALLOWED_EMAILS_SET.has(lower)) return true;
  const domain = lower.split("@")[1] || "";
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error(
      "[auth] CLERK_SECRET_KEY is not set — FAPI proxy is disabled in production"
    );
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host || "";
        const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
    },
  }) as RequestHandler;
}

export function setupAuth(app: Express) {
  // FAPI proxy must be mounted before body parsers
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

  // Clerk middleware populates auth state for getAuth(req)
  app.use(clerkMiddleware());
}

/**
 * Shared auth + domain gate. Used by both requireAuth and requireAdmin.
 * Returns the session claims if authorized, or sends an error response and returns null.
 */
function validateAuthAndDomain(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
): Record<string, unknown> | null {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  // Fail closed: if no domains/emails configured, deny all
  if (ALLOWED_EMAIL_DOMAINS.length === 0 && ALLOWED_EMAILS_SET.size === 0) {
    res.status(403).json({ message: "No allowed domains configured" });
    return null;
  }

  // Domain check using session claims (no Clerk API call)
  const claims = auth.sessionClaims as Record<string, unknown>;
  const email = (claims?.primary_email as string) || "";

  if (!isEmailAllowed(email)) {
    res.status(403).json({ message: "Access restricted to authorized domains" });
    return null;
  }

  return claims;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const claims = validateAuthAndDomain(req, res);
  if (!claims) return;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  const claims = validateAuthAndDomain(req, res);
  if (!claims) return;

  if (claims.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }

  next();
};
