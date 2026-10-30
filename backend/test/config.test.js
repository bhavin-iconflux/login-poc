import { describe, it, expect } from "vitest";
import { loadConfig, DEV_JWT_SECRET } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults_apply_when_env_empty", () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: "development",
      port: 4000,
      corsOrigin: "http://localhost:5173",
      jwtSecret: DEV_JWT_SECRET,
      jwtExpiresIn: "1h",
    });
  });

  it("env_overrides_defaults", () => {
    const config = loadConfig({ PORT: "5000", CORS_ORIGIN: "http://example.test", JWT_SECRET: "s3cret" });
    expect(config.port).toBe(5000);
    expect(config.corsOrigin).toBe("http://example.test");
    expect(config.jwtSecret).toBe("s3cret");
  });

  it("production_without_jwt_secret_throws", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("JWT_SECRET must be set in production");
  });

  it("production_with_dev_secret_throws", () => {
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: DEV_JWT_SECRET })).toThrow(
      "JWT_SECRET must be set in production",
    );
  });
});
