import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, login as apiLogin, me } from "../api.js";
import { clearToken, getToken, setToken } from "../storage.js";

const AuthContext = createContext(null);

export const UNREACHABLE_NOTICE = "Can't reach server";

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({
    status: getToken() ? "loading" : "anonymous",
    user: null,
    notice: "",
  }));

  const restore = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState({ status: "anonymous", user: null, notice: "" });
      return;
    }
    setState({ status: "loading", user: null, notice: "" });
    try {
      const user = await me(token);
      setState({ status: "authenticated", user, notice: "" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setState({ status: "anonymous", user: null, notice: "" });
      } else {
        setState({ status: "anonymous", user: null, notice: UNREACHABLE_NOTICE });
      }
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const login = useCallback(async (credentials) => {
    const { token, user } = await apiLogin(credentials);
    setToken(token);
    setState({ status: "authenticated", user, notice: "" });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ status: "anonymous", user: null, notice: "" });
  }, []);

  const value = useMemo(
    () => ({ ...state, login, logout, retry: restore }),
    [state, login, logout, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
