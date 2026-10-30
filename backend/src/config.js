export const DEV_JWT_SECRET = "dev-only-insecure-secret";

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
  if (nodeEnv === "production" && jwtSecret === DEV_JWT_SECRET) {
    throw new Error("JWT_SECRET must be set in production");
  }
  return {
    nodeEnv,
    port: Number(env.PORT ?? 4000),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173",
    jwtSecret,
    jwtExpiresIn: "1h",
  };
}
