import express from "express";
import cors from "cors";
import { createAuthRouter } from "./routes/auth.js";

/**
 * @param {{ config: any, userStore: any }} deps
 */
export function createApp({ config, userStore }) {
  const app = express();
  // A string origin makes cors send the header for every caller; allow only the exact match.
  app.use(cors({ origin: (origin, callback) => callback(null, origin === config.corsOrigin) }));
  app.use(express.json({ limit: "10kb" }));
  app.use("/api/auth", createAuthRouter({ config, userStore }));

  // eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Request too large" });
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
