import { useState } from "react";

type Category = "renewal" | "ar" | "fs" | "documents";
const sections: { key: Category; label: string }[] = [
  { key: "renewal", label: "Renewal applications and comments" },
  { key: "ar", label: "Accomplishment reports and reviews" },
  { key: "fs", label: "Financial statements and reviews" },
  { key: "documents", label: "Document repositories and records" },
];
export default function AdminTestResetPage() {
  const [armed, setArmed] = useState<Category | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [year, setYear] = useState("2026-2027");
  const [yearConfirmation, setYearConfirmation] = useState("");
  async function reset(category: Category) {
    if (confirmation !== `RESET ${category.toUpperCase()}` || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await fetch(`/api/admin/test-reset/${category}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ confirmation }),
      });
      const data = (await result.json()) as {
        error?: string;
        message?: string;
      };
      if (!result.ok) throw new Error(data.error || "Reset failed");
      setMessage(data.message || "Reset completed");
      setArmed(null);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }
  async function setAcademicYear() {
    if (busy || yearConfirmation !== `SET YEAR ${year}`) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/test-academic-year", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academic_year: year,
          confirmation: yearConfirmation,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Unable to update academic year");
      setMessage(result.message || "Academic year updated");
      setYearConfirmation("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update academic year",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ padding: 24 }}>
      <h1>Test Data Reset</h1>
      <p>
        System Administrator only. Development database only. Each reset applies
        to ALL organizations and ALL academic years.
      </p>
      <p>
        <strong>Warning:</strong> permanently deletes the selected database
        records. Stored upload files are NOT automatically removed. Do not use
        with production data.
      </p>
      <section
        style={{ margin: "24px 0", padding: 16, border: "1px solid #ccc" }}
      >
        <h2>Set Current Academic Year (Testing Only)</h2>
        <p>
          Updates the global year and all organization accounts together. Does
          not delete renewal forms, AR, FS, documents, or Office Order Numbers.
          Reopening a past year makes that year's records editable again, so use
          only in a disposable test environment.
        </p>
        <label htmlFor="admin-test-year">Academic year: </label>{" "}
        <select
          id="admin-test-year"
          value={year}
          disabled={busy}
          onChange={(event) => {
            setYear(event.target.value);
            setYearConfirmation("");
          }}
        >
          {Array.from({ length: 11 }, (_, i) => 2024 + i).map((start) => (
            <option key={start} value={`${start}-${start + 1}`}>
              {start}–{start + 1}
            </option>
          ))}
        </select>
        <p>
          <label>
            Type <strong>SET YEAR {year}</strong> to confirm:{" "}
            <input
              autoComplete="off"
              value={yearConfirmation}
              disabled={busy}
              onChange={(event) => setYearConfirmation(event.target.value)}
            />
          </label>
        </p>
        <button
          type="button"
          disabled={busy || yearConfirmation !== `SET YEAR ${year}`}
          onClick={() => void setAcademicYear()}
        >
          {busy ? "Saving..." : "Set Current Academic Year"}
        </button>
      </section>
      {sections.map(({ key, label }) => (
        <section key={key} style={{ margin: "20px 0" }}>
          <strong>{label}</strong>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setArmed(armed === key ? null : key);
              setConfirmation("");
              setMessage("");
            }}
          >
            Reset {key.toUpperCase()}
          </button>
          {armed === key && (
            <div style={{ padding: 12 }}>
              <label>
                Type <strong>RESET {key.toUpperCase()}</strong> to confirm:{" "}
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </label>{" "}
              <button
                type="button"
                disabled={busy || confirmation !== `RESET ${key.toUpperCase()}`}
                onClick={() => void reset(key)}
              >
                {busy ? "Resetting..." : "Permanently delete records"}
              </button>{" "}
              <button
                type="button"
                onClick={() => {
                  setArmed(null);
                  setConfirmation("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      ))}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
