import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Express, RequestHandler } from "express";

export function setupAuth(app: Express) {
  // Clerk middleware populates auth state for getAuth(req).
  // Production uses Clerk in custom-domain (CNAME) mode, so the client talks to
  // the FAPI directly — no server-side FAPI proxy.
  app.use(clerkMiddleware());
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
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
