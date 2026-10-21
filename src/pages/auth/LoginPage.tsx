import { useState, type FormEvent } from "react";
import "../../styles/LoginPage.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setMessage(
          "Login server returned an unexpected response. Check that the backend is running on port 3001.",
        );
        return;
      }
      const data: { error?: string; role?: string } = await response.json();
      if (!response.ok) {
        setMessage(
          data.error || `Login request failed (HTTP ${response.status}).`,
        );
        return;
      }
      window.location.href =
        data.role === "SYSTEM_ADMIN"
          ? "/admin/test-reset"
          : data.role === "OSAS"
            ? "/osas"
            : "/organization/dashboard";
    } catch (error) {
      console.error("[Login] Request failed:", error);
      setMessage(
        'Unable to reach the backend. Wait for "SAS Backend ready" in the terminal, then try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sas-login-page">
      <div className="sas-login-shell">
        <aside
          className="sas-login-hero"
          aria-label="Mariano Marcos State University campus"
        >
          <div className="sas-login-hero-content">
            <div>
              <h1>
                Student Affairs and
                <br />
                Services
              </h1>
              <p className="sas-login-hero-description">
                "In the service of MMSU Students"
              </p>
            </div>
          </div>
        </aside>
        <section
          className="sas-login-panel"
          aria-labelledby="sas-login-heading"
        >
          <div className="sas-login-content">
            <h2 id="sas-login-heading">Sign in to your account</h2>
            <p className="sas-login-subtitle">
              For student organizations and authorized OSAS personnel.
            </p>
            <form onSubmit={handleLogin} className="sas-login-form">
              <label htmlFor="sas-username">Username</label>
              <div className="sas-login-input-wrap">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                </svg>
                <input
                  id="sas-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                />
              </div>
              <label htmlFor="sas-password">Password</label>
              <div className="sas-login-input-wrap">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <rect x="5" y="10" width="14" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="sas-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="sas-login-visibility"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.6 5.1A11 11 0 0 1 12 5c5.2 0 9 7 9 7a16 16 0 0 1-3.2 3.8M6.1 6.1C3.9 8 3 12 3 12s3.8 7 9 7a9 9 0 0 0 4.2-1" />
                      <path d="M10 10a3 3 0 0 0 4 4" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {message && (
                <p className="sas-login-message" role="alert">
                  {message}
                </p>
              )}
              <button
                className="sas-login-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </button>
            </form>
          </div>
          <footer className="sas-login-bottom">
            © {new Date().getFullYear()} Student Affairs and Services
          </footer>
        </section>
      </div>
      <section className="sas-login-about" aria-labelledby="sas-about-heading">
        <div className="sas-login-about-inner">
          <h2 id="sas-about-heading">ABOUT US</h2>
          <p>
            The Students Services and Development aims to enrich the student’s
            experiences and supplement the academic programs through
            educational, athletic, cultural, spiritual, civic and social
            activities.
          </p>
        </div>
      </section>
    </main>
  );
}
