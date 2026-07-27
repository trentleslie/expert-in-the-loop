import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { serveStatic } from "./static";
import { storage } from "./storage";
import { createServer } from "http";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// Clerk FAPI proxy and middleware MUST be mounted before body parsers
setupAuth(app);

// Body-parser limits. Parsers run before route-level auth, so keep the DEFAULT
// small to bound pre-authentication parse cost (a large body to any path is
// otherwise fully buffered/parsed before authorization rejects it). ONLY the
// campaign-pairs import — which POSTs a large `{ pairs: [...] }` JSON body from
// the column-mapping wizard — gets the 10mb allowance, scoped to its exact path.
const DEFAULT_BODY_LIMIT = "1mb";
const IMPORT_BODY_LIMIT = "10mb";
const isPairImport = (req: Request) =>
  req.method === "POST" && /^\/api\/campaigns\/[^/]+\/pairs\/?$/.test(req.path);

const jsonDefault = express.json({ limit: DEFAULT_BODY_LIMIT });
const jsonImport = express.json({ limit: IMPORT_BODY_LIMIT });
app.use((req, res, next) => (isPairImport(req) ? jsonImport : jsonDefault)(req, res, next));

app.use(express.urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Startup recovery: mark any campaign whose bulk recompute was interrupted by a
  // crash (left in 'running') as 'failed', so the admin UI can offer a retry
  // rather than leaving it permanently stuck. Non-fatal — log and continue.
  try {
    await storage.reconcileStaleRecomputes();
  } catch (err) {
    log(`reconcileStaleRecomputes failed at startup: ${String(err)}`);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
