import "../../styles/RenewalTemplates.css";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import FeedbackNotification from "../../components/FeedbackNotification";
import "../../styles/FeedbackNotification.css";
import "../../styles/RenewalTimelineCompact.css";
import "../../styles/RenewalCommentHistory.css";

type RenewalComment = {
  id: number;
  form_number: number;
  comment_text: string;
  created_at: string;
  author: string;
};

type RenewalForm = {
  form_number: number;
  file_name: string | null;
  status: string;
  reviewer_comment: string | null;
  comments?: RenewalComment[];
  activity?: RenewalEvent[];
};

type RenewalEvent = {
  event_type: string;
  form_number: number | null;
  created_at: string;
};

type RenewalData = {
  academic_year: string;
  status: string;
  submitted_at: string | null;
  first_submitted_at?: string | null;
  activity?: RenewalEvent[];
  forms: RenewalForm[];
};

type Organization = {
  academic_year: string | null;
  current_academic_year: string;
  recognition_status: string | null;
  office_order_number: string | null;
};

type ApiResult = {
  error?: string;
  message?: string;
};

const FORM_NUMBERS = [1, 2, 3, 4, 5, 6];

type RenewalIconName =
  | "check"
  | "file"
  | "up"
  | "eye"
  | "trash"
  | "chevron-up"
  | "chevron-down"
  | "message";

function RenewalIcon({
  name,
  size = 17,
}: {
  name: RenewalIconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<RenewalIconName, React.ReactNode> = {
    check: <path d="m20 6-11 11-5-5" />,
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h8" />
      </>
    ),
    up: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5" />
        <path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    "chevron-up": <path d="m6 15 6-6 6 6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    message: (
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" />
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function displayStatus(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Submitted";
    case "UNDER REVIEW":
      return "Under Review";
    case "FOR REVISION":
      return "For Revision";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

function statusClass(status: string): string {
  if (status === "APPROVED") return "approved";
  if (status === "FOR REVISION" || status === "REJECTED") {
    return "revision";
  }
  if (status === "SUBMITTED" || status === "UNDER REVIEW") {
    return "pending";
  }
  return "draft";
}

export default function ApplicationRenewalPage() {
  const navigate = useNavigate();

  const [renewal, setRenewal] = useState<RenewalData | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const [visibleComment, setVisibleComment] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploadingForms, setUploadingForms] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [removingForm, setRemovingForm] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Same auto-dismiss behavior as Organization Profile.
  useEffect(() => {
    if (!error && !message) return;
    const timer = window.setTimeout(() => {
      setError("");
      setMessage("");
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const loadRenewal = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch("/api/renewal", {
        credentials: "same-origin",
        signal,
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return null;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load renewal application.");
      }

      const result = data as RenewalData;

      if (!result.academic_year) {
        throw new Error("Academic year is unavailable.");
      }

      if (!signal?.aborted) {
        setRenewal(result);
      }

      return result;
    },
    [navigate],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function initialize() {
      try {
        const [renewalResult, profileResult] = await Promise.allSettled([
          loadRenewal(controller.signal),
          fetch("/api/me", {
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        if (renewalResult.status === "rejected") {
          throw renewalResult.reason;
        }

        if (profileResult.status === "fulfilled") {
          const response = profileResult.value;

          if (response.status === 401) {
            navigate("/login", { replace: true });
            return;
          }

          if (response.ok) {
            const data: Organization = await response.json();

            if (!controller.signal.aborted) {
              setOrganization(data);
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Loading failed.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => controller.abort();
  }, [loadRenewal, navigate]);

  async function uploadForm(
    number: number,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setMessage("");

    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setError("Please choose a PDF, JPG, or PNG document.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Maximum file size is 10 MB.");
      event.target.value = "";
      return;
    }

    setUploadingForms((old) => (old.includes(number) ? old : [...old, number]));

    try {
      const response = await fetch(`/api/renewal/forms/${number}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      const result: ApiResult = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed.");
      }

      await loadRenewal();
      setMessage(`Form ${number} uploaded successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingForms((old) => old.filter((n) => n !== number));
      event.target.value = "";
    }
  }

  async function removeForm(number: number) {
    if (
      !window.confirm(
        `Remove the uploaded document for Form ${number}? You can upload a new one afterward.`,
      )
    )
      return;

    setError("");
    setMessage("");
    setRemovingForm(number);
    try {
      const response = await fetch(`/api/renewal/forms/${number}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      const result: ApiResult = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to remove document.");
      await loadRenewal();
      setMessage(`Form ${number} document removed.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to remove document.",
      );
    } finally {
      setRemovingForm(null);
    }
  }

  async function submitApplication() {
    if (!window.confirm("Submit all six forms for SAS administrator review?")) {
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/renewal/submit", {
        method: "POST",
        credentials: "same-origin",
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      const result: ApiResult = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to submit renewal application.",
        );
      }

      await loadRenewal();
      setMessage("Application submitted. Waiting for administrator review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p>Loading Application for Renewal...</p>;
  }

  if (!renewal) {
    return <p role="alert">{error || "Unable to load renewal application."}</p>;
  }

  const recognitionActive =
    organization?.academic_year === renewal.academic_year &&
    renewal.status === "APPROVED" &&
    ["ACTIVE", "RENEWED"].includes(
      String(organization?.recognition_status || "").toUpperCase(),
    );

  const editable =
    (renewal.status === "DRAFT" || renewal.status === "FOR REVISION") &&
    !recognitionActive;

  const uploadedCount = FORM_NUMBERS.filter((number) =>
    renewal.forms.some(
      (form) => form.form_number === number && Boolean(form.file_name),
    ),
  ).length;

  const hasOutstandingRevision = renewal.forms.some(
    (form) => form.status === "FOR REVISION" || form.status === "REJECTED",
  );

  const canSubmit =
    editable &&
    uploadedCount === 6 &&
    !hasOutstandingRevision &&
    uploadingForms.length === 0 &&
    removingForm === null &&
    !submitting;

  function findForm(number: number): RenewalForm {
    return (
      renewal!.forms.find((form) => form.form_number === number) || {
        form_number: number,
        file_name: null,
        status: "NOT SUBMITTED",
        reviewer_comment: null,
      }
    );
  }

  return (
    <div className="renewal-page">
      <FeedbackNotification
        error={error}
        message={message}
        onDismiss={() => {
          setError("");
          setMessage("");
        }}
      />
      <div className="renewal-page-heading">
        <h1>Application for Renewal</h1>
      </div>

      {/* RECOGNITION INFORMATION */}
      <section className="renewal-recognition">
        <div className="renewal-recognition-details">
          <p>
            <strong>Academic Year:</strong>{" "}
            {renewal.academic_year.replace("-", "–")}
          </p>
          <p>
            <strong>Office Order Number:</strong>{" "}
            <span>{organization?.office_order_number || "Not assigned"}</span>
          </p>
          <p>
            <strong>Status of Organization:</strong>{" "}
            <span
              className={
                recognitionActive
                  ? "renewal-recognition-active"
                  : "renewal-recognition-inactive"
              }
            >
              {organization
                ? recognitionActive
                  ? "Active"
                  : "Not Renewed"
                : "Unavailable"}
            </span>
          </p>
        </div>

        {recognitionActive ? (
          <p className="renewal-recognition-message">
            Your Organization has been renewed for the
            <span className="renewal-recognition-break">
              Academic Year:{" "}
              <strong>{renewal.academic_year.replace("-", "–")}</strong>
              {organization?.office_order_number && (
                <>
                  {" "}
                  with office number{" "}
                  <strong>{organization.office_order_number}</strong>
                </>
              )}
            </span>
          </p>
        ) : (
          <p className="renewal-recognition-message">
            {organization
              ? `Your organization has not yet been confirmed as renewed for Academic Year ${renewal.academic_year.replace("-", "–")}.`
              : "Recognition information is temporarily unavailable."}
          </p>
        )}
      </section>

      {/* PROGRESS BAR + COUNT */}
      <section
        className="renewal-compact-progress"
        aria-label="Required form uploads"
      >
        <div className="renewal-compact-progress-count">{uploadedCount}/6</div>

        <div
          className="renewal-progress-track"
          role="progressbar"
          aria-label="Forms uploaded"
          aria-valuemin={0}
          aria-valuemax={6}
          aria-valuenow={uploadedCount}
        >
          <div
            className="renewal-progress-fill"
            style={{
              width: `${(uploadedCount / 6) * 100}%`,
            }}
          />
        </div>
      </section>

      {/* Six forms: actions are always visible; comments alone toggle. */}
      <div className="renewal-accordion">
        {FORM_NUMBERS.map((number) => {
          const form = findForm(number);
          const uploaded = Boolean(form.file_name);
          const hasOsasComment = Boolean(
            form.comments?.length || form.reviewer_comment?.trim(),
          );
          const commentOpen = hasOsasComment && visibleComment === number;
          const busy =
            uploadingForms.includes(number) || removingForm === number;
          const canReplace =
            editable &&
            !busy &&
            !submitting &&
            (renewal.status === "DRAFT" ||
              form.status === "FOR REVISION" ||
              (form.status === "NOT SUBMITTED" &&
                !!form.activity?.some((e) => e.event_type === "RETURNED")));
          const showStatus = uploaded && form.status !== "NOT SUBMITTED";

          return (
            <section className="renewal-accordion-item" key={number}>
              <div className="renewal-form-row">
                <span
                  className={`renewal-document-icon ${uploaded ? "uploaded" : ""}`}
                  aria-hidden="true"
                >
                  <RenewalIcon name={uploaded ? "check" : "file"} size={21} />
                </span>
                <span className="renewal-document-title">
                  <strong>Form {number}</strong>
                  <small title={form.file_name || undefined}>
                    {form.file_name || "Not uploaded"}
                  </small>
                </span>
                {showStatus && (
                  <span
                    className={`renewal-form-badge ${statusClass(form.status)}`}
                  >
                    {displayStatus(form.status)}
                  </span>
                )}
                <div className="renewal-form-icon-actions">
                  {uploaded && (
                    <a
                      className="renewal-icon-control"
                      title={`View Form ${number}`}
                      aria-label={`View Form ${number}`}
                      href={`/api/renewal/forms/${number}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <RenewalIcon name="eye" size={20} />
                    </a>
                  )}
                  {uploaded && canReplace && (
                    <button
                      type="button"
                      className="renewal-icon-control danger"
                      title={`Remove Form ${number}`}
                      aria-label={`Remove Form ${number}`}
                      onClick={() => void removeForm(number)}
                    >
                      <RenewalIcon name="trash" size={20} />
                    </button>
                  )}
                  {canReplace && (
                    <label
                      className="renewal-icon-control renewal-icon-file-picker"
                      title={
                        uploaded
                          ? `Re-upload Form ${number}`
                          : `Upload Form ${number}`
                      }
                    >
                      <RenewalIcon name="up" size={20} />
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        aria-label={
                          uploaded
                            ? `Re-upload Form ${number}`
                            : `Upload Form ${number}`
                        }
                        onChange={(event) => void uploadForm(number, event)}
                      />
                    </label>
                  )}
                  {hasOsasComment && (
                    <button
                      type="button"
                      className={`renewal-icon-control comment ${commentOpen ? "active" : ""}`}
                      title={
                        commentOpen
                          ? `Hide Form ${number} comment`
                          : `Show Form ${number} comment`
                      }
                      aria-label={
                        commentOpen
                          ? `Hide Form ${number} comment`
                          : `Show Form ${number} comment`
                      }
                      aria-expanded={commentOpen}
                      aria-controls={`renewal-comment-${number}`}
                      onClick={() =>
                        setVisibleComment(commentOpen ? null : number)
                      }
                    >
                      <RenewalIcon name="message" size={20} />
                      {(!!form.comments?.length || !!form.reviewer_comment) && (
                        <span
                          className="renewal-comment-dot"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  )}
                </div>
              </div>
              {(uploadingForms.includes(number) || removingForm === number) && (
                <p className="renewal-inline-status" role="status">
                  {uploadingForms.includes(number)
                    ? "Uploading document..."
                    : "Removing document..."}
                </p>
              )}
              {commentOpen && (
                <div
                  id={`renewal-comment-${number}`}
                  className={`renewal-compact-comment renewal-comment-panel ${form.status === "FOR REVISION" ? "needs-revision" : ""}`}
                >
                  <div>
                    <strong>Comments</strong>
                    {form.comments?.length ? (
                      <div className="renewal-comment-history">
                        {form.comments.map((comment) => (
                          <article
                            key={comment.id}
                            className="renewal-comment-history-item"
                          >
                            <div className="renewal-comment-history-meta">
                              <strong>{comment.author}</strong>
                              <time dateTime={comment.created_at}>
                                {new Date(comment.created_at).toLocaleString(
                                  "en-PH",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  },
                                )}
                              </time>
                            </div>
                            <p>{comment.comment_text}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>{form.reviewer_comment || "No comments yet."}</p>
                    )}
                    {!!form.activity?.length && (
                      <div
                        className="renewal-comment-timeline"
                        aria-label={`Form ${number} revision activity`}
                      >
                        {form.activity
                          .filter((event) =>
                            [
                              "RETURNED",
                              "REVISED_UPLOAD",
                              "RESUBMITTED",
                            ].includes(event.event_type),
                          )
                          .map((event, index) => (
                            <div
                              className="renewal-comment-timeline-entry"
                              key={`${event.event_type}-${event.created_at}-${index}`}
                            >
                              <span>
                                {event.event_type === "RETURNED"
                                  ? "Returned by OSAS"
                                  : event.event_type === "REVISED_UPLOAD"
                                    ? "Revised document uploaded"
                                    : "Resubmitted"}
                              </span>
                              <time dateTime={event.created_at}>
                                {new Date(event.created_at).toLocaleString(
                                  "en-PH",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  },
                                )}
                              </time>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* ONLY THE SUBMIT BUTTON — NO CARD OR HEADING */}
      <div className="renewal-submit-only">
        <button
          type="button"
          className="renewal-templates-download renewal-page-download"
          title="Download Renewal Forms 1–6"
          aria-label="Download Renewal Forms 1 through 6"
          onClick={async () => {
            try {
              const response = await fetch(
                "/api/renewal-templates/all/download",
                { credentials: "same-origin" },
              );
              if (!response.ok) {
                const json = (await response.json()) as { error?: string };
                throw new Error(json.error || "Unable to download forms");
              }
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "Application_Renewal_Forms.zip";
              anchor.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to download forms",
              );
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
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
          Templates
        </button>
        {editable ? (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submitApplication()}
          >
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        ) : (
          <span className={`renewal-status ${statusClass(renewal.status)}`}>
            {recognitionActive
              ? "Already Renewed"
              : displayStatus(renewal.status)}
          </span>
        )}
      </div>
    </div>
  );
}
