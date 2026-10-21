import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminTestResetPage from "./AdminTestResetPage";

type Access = "checking" | "allowed" | "denied";

export default function ProtectedAdminReset() {
  const [access, setAccess] = useState<Access>("checking");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function checkAccess() {
      try {
        const response = await fetch("/api/admin/me", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          role?: string;
          error?: string;
        } | null;
        if (controller.signal.aborted) return;
        if (response.ok && data?.role === "SYSTEM_ADMIN") {
          setAccess("allowed");
          return;
        }
        setReason(
          data?.error ||
            `System Admin session not verified (HTTP ${response.status}).`,
        );
        setAccess("denied");
      } catch {
        if (!controller.signal.aborted) {
          setReason(
            "Cannot reach the backend. Start the server on port 3001 and verify the Vite /api proxy.",
          );
          setAccess("denied");
        }
      }
    }
    void checkAccess();
    return () => controller.abort();
  }, []);

  if (access === "checking")
    return (
      <main style={{ padding: 24 }}>Checking System Admin session...</main>
    );
  if (access === "denied") {
    return (
      <main style={{ padding: 24 }}>
        <h1>System Admin sign-in required</h1>
        <p>{reason}</p>
        <p>
          Sign out of OSAS or organization accounts, then sign in as your System
          Admin account.
        </p>
        <Link to="/login">Go to login</Link>
      </main>
    );
  }
  return (
    <div style={{ maxWidth: 850, margin: "24px auto", padding: 16 }}>
      <div style={{ textAlign: "right" }}>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch("/api/logout", {
                method: "POST",
                credentials: "same-origin",
              });
            } finally {
              window.location.replace("/login");
            }
          }}
        >
          Logout
        </button>
      </div>
      <AdminTestResetPage />
    </div>
  );
}
