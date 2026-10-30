import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { getToken, setToken } from "./storage.js";

const USER = { id: "1", email: "alice@example.com" };

function json(status, body) {
  return new Response(JSON.stringify(body), { status });
}

/** @param {{ me?: () => Response, login?: () => Response }} routes */
function mockApi({ me, login }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/api/auth/me") && me) return me();
    if (String(url).endsWith("/api/auth/login") && login) return login();
    throw new Error(`unexpected request ${url}`);
  });
}

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

async function submitLogin() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "Password123!");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("session", () => {
  it("restores_session_from_stored_token", async () => {
    setToken("tok");
    const spy = mockApi({ me: () => json(200, { user: USER }) });
    renderApp();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Welcome, alice@example.com")).toBeInTheDocument();
    const init = /** @type {{ headers: Record<string, string> }} */ (spy.mock.calls[0][1]);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("no_token_skips_me_call", async () => {
    const spy = mockApi({});
    renderApp();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("clears_token_and_shows_login_on_401_from_me", async () => {
    setToken("tok");
    mockApi({ me: () => json(401, { error: "x" }) });
    renderApp();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Can't reach server")).not.toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it("keeps_token_and_shows_notice_when_server_unreachable", async () => {
    setToken("tok");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("down"));
    renderApp();
    expect(await screen.findByText("Can't reach server")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(getToken()).toBe("tok");
  });

  it("keeps_token_and_shows_notice_on_5xx_from_me", async () => {
    setToken("tok");
    mockApi({ me: () => json(500, {}) });
    renderApp();
    expect(await screen.findByText("Can't reach server")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(getToken()).toBe("tok");
  });

  it("retry_restores_session_after_outage", async () => {
    setToken("tok");
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("down"))
      .mockResolvedValueOnce(json(200, { user: USER }));
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Welcome, alice@example.com")).toBeInTheDocument();
  });

  it("retry_keeps_notice_when_still_down", async () => {
    setToken("tok");
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("down"));
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Can't reach server")).toBeInTheDocument();
    expect(getToken()).toBe("tok");
  });
});

describe("login and logout", () => {
  it("successful_login_shows_welcome_with_email", async () => {
    mockApi({ login: () => json(200, { token: "t", user: USER }) });
    renderApp();
    await submitLogin();
    expect(await screen.findByText("Welcome, alice@example.com")).toBeInTheDocument();
    expect(getToken()).toBe("t");
  });

  it("login_succeeds_when_storage_throws", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    const boom = () => {
      throw new Error("denied");
    };
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: { getItem: boom, setItem: boom, removeItem: boom },
    });
    try {
      mockApi({ login: () => json(200, { token: "t", user: USER }) });
      renderApp();
      await submitLogin();
      expect(await screen.findByText("Welcome, alice@example.com")).toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", original);
    }
  });

  it("logout_clears_token_and_returns_to_login", async () => {
    setToken("tok");
    mockApi({ me: () => json(200, { user: USER }) });
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Logout" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });
});
