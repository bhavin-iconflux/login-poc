import jwt from "jsonwebtoken";

/**
 * @param {{ id: string, email: string }} user
 * @param {{ jwtSecret: string, jwtExpiresIn: import("jsonwebtoken").SignOptions["expiresIn"] }} config
 */
export function signToken(user, config) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * @param {{ config: { jwtSecret: string }, userStore: { findById(id: string): { id: string, email: string } | undefined } }} deps
 * @returns {import("express").RequestHandler}
 */
export function requireAuth({ config, userStore }) {
  return (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme === "Bearer" && token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
        const user = userStore.findById(String(payload.sub));
        if (user) {
          /** @type {any} */ (req).user = { id: user.id, email: user.email };
          return next();
        }
      } catch {
        // fall through to 401
      }
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}
