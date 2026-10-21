import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/RenewalTemplates.css";

type Template = { form_number: number; file_name: string; uploaded_at: string };

type Props = { onClose: () => void };

export default function RenewalTemplateModal({ onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busyForms, setBusyForms] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/renewal-templates", {
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        data.error || `Could not load renewal templates (${res.status})`,
      );
    }
    const data = (await res.json()) as { forms: Template[] };
    setTemplates(data.forms);
  }

  useEffect(() => {
    void load()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load forms"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);

  async function upload(number: number, file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    if (
      !/\.(pdf|doc|docx)$/i.test(file.name) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Please select a PDF, DOC, or DOCX file up to 10 MB.");
      return;
    }
    setBusyForms((current) => [...current, number]);
    try {
      const res = await fetch(`/api/renewal-templates/${number}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Upload failed");
      }
      const data = (await res.json()) as { form?: Template };
      if (data.form)
        setTemplates((current) =>
          [...current.filter((t) => t.form_number !== number), data.form!].sort(
            (a, b) => a.form_number - b.form_number,
          ),
        );
      else await load();
      setMessage(`Form ${number} uploaded successfully.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyForms((current) => current.filter((n) => n !== number));
    }
  }

  async function remove(number: number) {
    if (!window.confirm(`Remove the official Form ${number} template?`)) return;
    setBusyForms((current) => [...current, number]);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/renewal-templates/${number}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Unable to remove template");
      }
      setTemplates((current) =>
        current.filter((t) => t.form_number !== number),
      );
      setMessage(`Form ${number} removed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove template");
    } finally {
      setBusyForms((current) => current.filter((n) => n !== number));
    }
  }

  return createPortal(
    <div
      className="renewal-template-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="renewal-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-template-title"
      >
        <div className="renewal-template-dialog-head">
          <div>
            <h2 id="renewal-template-title">Manage Renewal Forms</h2>
            <p>
              Upload or replace the six official templates for student
              organizations.
            </p>
          </div>
          <button
            type="button"
            className="renewal-template-close"
            aria-label="Close popup"
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="renewal-template-progress">
          {templates.length} of 6 forms uploaded
        </div>
        {error && (
          <p role="alert" className="renewal-template-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="renewal-template-success">
            {message}
          </p>
        )}
        <div className="renewal-template-modal-list">
          {loading ? (
            <p>Loading templates...</p>
          ) : (
            [1, 2, 3, 4, 5, 6].map((number) => {
              const template = templates.find((t) => t.form_number === number);
              return (
                <div className="renewal-template-row" key={number}>
                  <div className="renewal-template-file">
                    <strong>Form {number}</strong>
                    <p title={template?.file_name}>
                      {template?.file_name || "Not uploaded"}
                    </p>
                  </div>
                  <div className="renewal-template-actions">
                    {template && (
                      <a
                        className="renewal-template-icon"
                        href={`/api/renewal-templates/${number}/download`}
                        download
                        title={`Download Form ${number}`}
                        aria-label={`Download Form ${number}`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="21"
                          height="21"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 3v12m-4-4 4 4 4-4" />
                          <path d="M5 17v3h14v-3" />
                        </svg>
                      </a>
                    )}
                    <label
                      className={`renewal-template-icon renewal-template-upload ${busyForms.includes(number) ? "is-disabled" : ""}`}
                      title={
                        template
                          ? `Replace Form ${number}`
                          : `Upload Form ${number}`
                      }
                      aria-label={
                        template
                          ? `Replace Form ${number}`
                          : `Upload Form ${number}`
                      }
                    >
                      {busyForms.includes(number) ? (
                        <svg
                          className="renewal-template-spinning"
                          viewBox="0 0 24 24"
                          width="21"
                          height="21"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <path d="M21 12a9 9 0 1 1-9-9" />
                        </svg>
                      ) : template ? (
                        <svg
                          viewBox="0 0 24 24"
                          width="21"
                          height="21"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 7v5h-5" />
                          <path d="M4 17v-5h5" />
                          <path d="M5.6 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          width="21"
                          height="21"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 16V4m-4 4 4-4 4 4" />
                          <path d="M4 16v4h16v-4" />
                        </svg>
                      )}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        disabled={busyForms.includes(number)}
                        aria-label={`Choose file for Form ${number}`}
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          void upload(number, file);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {template && (
                      <button
                        type="button"
                        className="renewal-template-icon renewal-template-remove"
                        title={`Remove Form ${number}`}
                        aria-label={`Remove Form ${number}`}
                        disabled={busyForms.includes(number)}
                        onClick={() => void remove(number)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="21"
                          height="21"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18m-2 0-1 15H6L5 6m4 0V4h6v2m-6 4v8m6-8v8" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="renewal-template-footer">
          <span>PDF, DOC, DOCX · Maximum 10 MB per file</span>
        </div>
      </section>
    </div>,
    document.body,
  );
}
