import { clerkMiddleware, getAuth, clerkClient } from "@clerk/express";
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

function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
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

export const requireAuth: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Fail closed: if ALLOWED_EMAIL_DOMAINS is not configured, deny all
  if (ALLOWED_EMAIL_DOMAINS.length === 0 && ALLOWED_EMAILS_SET.size === 0) {
    return res.status(403).json({ message: "No allowed domains configured" });
  }

  try {
    const user = await clerkClient.users.getUser(auth.userId);
    const primaryEmail = (
      user.primaryEmailAddress?.emailAddress || ""
    ).toLowerCase();
    const emailDomain = primaryEmail.split("@")[1] || "";

    const isAllowed =
      ALLOWED_EMAILS_SET.has(primaryEmail) ||
      ALLOWED_EMAIL_DOMAINS.includes(emailDomain);

    if (!isAllowed) {
      return res
        .status(403)
        .json({ message: "Access restricted to authorized domains" });
    }
  } catch (err) {
    console.error("Failed to validate user domain:", err);
    return res
      .status(500)
      .json({ message: "Could not verify access permissions" });
  }

  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const role = (auth.sessionClaims as Record<string, unknown>)?.role;
  if (role !== "admin") {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }

  next();
};
