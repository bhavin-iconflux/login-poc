import { Router } from "express";
import { parseLoginBody } from "../validation.js";
import { requireAuth, signToken } from "../auth.js";

/**
 * @param {{ config: any, userStore: any }} deps
 */
export function createAuthRouter({ config, userStore }) {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const parsed = parseLoginBody(req.body);
      if ("fields" in parsed) {
        return res.status(400).json({ error: "Validation failed", fields: parsed.fields });
      }
      const { email, password } = parsed.data;
      const user = userStore.findByEmail(email);
      if (!(await userStore.verifyPassword(user, password))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const publicUser = { id: user.id, email: user.email };
      res.json({ token: signToken(publicUser, config), user: publicUser });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireAuth({ config, userStore }), (req, res) => {
    res.json({ user: /** @type {any} */ (req).user });
  });

  return router;
}
