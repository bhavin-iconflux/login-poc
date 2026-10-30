/** @param {{ email: string, onLogout: () => void }} props */
export function WelcomePage({ email, onLogout }) {
  return (
    <main className="page">
      <section className="card">
        <h1>Welcome, {email}</h1>
        <button type="button" className="primary" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}
