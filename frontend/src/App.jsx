import { useAuth } from "./auth/AuthContext.jsx";
import { LoginPage } from "./components/LoginPage.jsx";
import { WelcomePage } from "./components/WelcomePage.jsx";

export function App() {
  const { status, user, notice, login, logout, retry } = useAuth();

  if (status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p>Loading…</p>
      </main>
    );
  }
  if (status === "authenticated") {
    return <WelcomePage email={user.email} onLogout={logout} />;
  }
  return <LoginPage onSubmit={login} notice={notice} onRetry={retry} />;
}
