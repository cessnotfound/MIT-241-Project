import RenewalTemplateModal from "./RenewalTemplateModal";
import { useEffect, useMemo, useState } from "react";
import { osasGet } from "./osasTypes";
import FeedbackNotification from "../../components/FeedbackNotification";
import "../../styles/FeedbackNotification.css";

type StatusTab = "ALL" | "SUBMITTED" | "APPROVED" | "RETURNED";
type Application = {
  office_order_number?: string | null;
  id: string;
  organization_id: string;
  organization_name: string;
  college: string | null;
  academic_year: string;
  status: string;
  submitted_at: string | null;
  uploaded_forms: number;
};
type Form = {
  form_number: number;
  file_name: string | null;
  uploaded: boolean;
  status: string;
  reviewer_comment: string | null;
};
type Comment = {
  id: number;
  form_number: number;
  comment_text: string;
  created_at: string;
  author: string;
};
type TimelineEvent = {
  event_type: string;
  form_number: number | null;
  created_at: string;
};
type Detail = {
  application: Application;
  forms: Form[];
  comments: Comment[];
  activity: TimelineEvent[];
};

const Icon = ({
  name,
}: {
  name: "send" | "return" | "approve" | "view" | "comment" | "back";
}) => {
  const paths = {
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    return: (
      <>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
      </>
    ),
    approve: (
      <>
        <path d="M20 6 9 17l-5-5" />
      </>
    ),
    comment: (
      <>
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" />
      </>
    ),
    back: (
      <>
        <path d="m12 19-7-7 7-7" />
        <path d="M5 12h14" />
      </>
    ),
    view: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  };
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(result.error || "Unable to save changes");
  return result;
}
function RenewalOrgPhoto({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="osas-renewal-org-avatar" aria-hidden="true">
      {!missing ? (
        <img
          src={`/api/osas/organizations/${encodeURIComponent(orgId)}/photo`}
          alt=""
          onError={() => setMissing(true)}
        />
      ) : (
        orgName
          .trim()
          .split(/\s+/)
          .map((word) => word[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

export default function OsasRenewalsPage() {
  const [showTemplates, setShowTemplates] = useState(false);
  const [list, setList] = useState<Application[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("ALL");
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const colleges = useMemo(
    () =>
      Array.from(
        new Set(list.map((a) => a.college).filter((c): c is string => !!c)),
      ).sort(),
    [list],
  );
  const filtered = useMemo(
    () =>
      list.filter(
        (a) =>
          (college === "ALL" || a.college === college) &&
          (statusTab === "ALL" || a.status === statusTab) &&
          `${a.organization_name} ${a.college || ""} ${a.academic_year} ${a.status}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [list, search, college, statusTab],
  );

  useEffect(() => {
    const controller = new AbortController();
    void osasGet<{ applications: Application[] }>(
      "/api/osas/renewals",
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) setList(r.applications);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load applications",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function refreshList() {
    const r = await osasGet<{ applications: Application[] }>(
      "/api/osas/renewals",
    );
    setList(r.applications);
  }
  async function loadDetail(id: string) {
    setSelected(id);
    setDetail(null);
    setDrafts({});
    setOpenComments({});
    const result = await osasGet<Detail>(`/api/osas/renewals/${id}`);
    setDetail(result);
  }
  async function updateDetail(id: string) {
    const result = await osasGet<Detail>(`/api/osas/renewals/${id}`);
    setDetail(result);
  }
  async function sendComment(number: number) {
    if (!selected || busy) return;
    const comment = (drafts[number] || "").trim();
    if (!comment) {
      setError(`Enter a comment for Form ${number}.`);
      return;
    }
    setBusy(true);
    try {
      await send(
        `/api/osas/renewals/${selected}/forms/${number}/comments`,
        "POST",
        { comment },
      );
      setDrafts((old) => ({ ...old, [number]: "" }));
      await updateDetail(selected);
      setNotice(`Comment sent for Form ${number}.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to send comment",
      );
    } finally {
      setBusy(false);
    }
  }
  async function returnForm(number: number) {
    if (!selected || busy) return;
    if (
      !window.confirm(
        `Return Form ${number} for correction? The organization will be able to re-upload this form and resubmit the application.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await send<{ message: string }>(
        `/api/osas/renewals/${selected}/forms/${number}`,
        "PATCH",
        { status: "FOR REVISION" },
      );
      await Promise.all([updateDetail(selected), refreshList()]);
      setNotice(result.message);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to return form",
      );
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "ACCEPT") {
    if (!selected || busy) return;
    const text =
      "Approve this complete renewal? Its existing permanent Office Order Number will become visible once the organization is RENEWED.";
    if (!window.confirm(text)) return;
    setBusy(true);
    try {
      const result = await send<{ message: string }>(
        `/api/osas/renewals/${selected}/decision`,
        "POST",
        { decision },
      );
      await Promise.all([updateDetail(selected), refreshList()]);
      setNotice(result.message);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to finish review",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="osas-page">
      <FeedbackNotification
        error={error}
        message={notice}
        onDismiss={() => {
          setError("");
          setNotice("");
        }}
      />
      {showTemplates && (
        <RenewalTemplateModal onClose={() => setShowTemplates(false)} />
      )}
      {selected ? (
        <>
          <div className="osas-renewal-review-header">
            <button
              type="button"
              className="osas-renewal-review-back"
              title="Back to Renewal Applications"
              aria-label="Back to Renewal Applications"
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
            >
              <Icon name="back" />
            </button>
            <div className="osas-renewal-review-heading">
              <h1>Renewal Application</h1>
              {!detail ? (
                <p className="osas-muted">Loading application...</p>
              ) : (
                <>
                  <p className="osas-renewal-review-org">
                    <strong>{detail.application.organization_name}</strong>
                    <span className="osas-renewal-review-separator"> · </span>
                    {detail.application.college || "College not specified"}
                  </p>
                  <p className="osas-muted">
                    Academic Year {detail.application.academic_year} · Status:{" "}
                    <strong>{detail.application.status}</strong>
                  </p>
                  {detail.activity?.some(
                    (e) => e.event_type === "FIRST_SUBMITTED",
                  ) && (
                    <p className="osas-renewal-review-submitted">
                      <span>Submitted:</span>{" "}
                      {formatDate(
                        detail.activity.find(
                          (e) => e.event_type === "FIRST_SUBMITTED",
                        )!.created_at,
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {!detail ? null : (
            <>
              <h2>Forms 1–6</h2>
              {Array.from({ length: 6 }, (_, i) => i + 1).map((number) => {
                const form = detail.forms.find(
                  (f) => Number(f.form_number) === number,
                );
                const history = detail.comments.filter(
                  (c) => Number(c.form_number) === number,
                );
                const editable =
                  (detail.application.status === "SUBMITTED" ||
                    detail.application.status === "FOR REVISION") &&
                  !!form?.uploaded &&
                  form.status === "SUBMITTED";
                const isOpen = !!openComments[number];
                return (
                  <section className="osas-renewal-form" key={number}>
                    <div className="osas-renewal-form-head">
                      <div className="osas-renewal-form-info">
                        <strong>Form {number}</strong>
                        <p className="osas-muted">
                          {form?.file_name || "Not uploaded"} ·{" "}
                          {form?.status || "NOT SUBMITTED"}
                        </p>
                      </div>
                      <div
                        className="osas-renewal-inline-icons"
                        aria-label={`Actions for Form ${number}`}
                      >
                        {form?.uploaded && (
                          <a
                            className="osas-renewal-icon"
                            href={`/api/osas/renewals/${selected}/forms/${number}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`View Form ${number}`}
                            aria-label={`View Form ${number}`}
                          >
                            <Icon name="view" />
                          </a>
                        )}
                        <button
                          type="button"
                          className={`osas-renewal-icon ${isOpen ? "is-active" : ""}`}
                          aria-expanded={isOpen}
                          aria-controls={`form-comments-${number}`}
                          title={isOpen ? "Hide comments" : "Show comments"}
                          aria-label={`${isOpen ? "Hide" : "Show"} comments for Form ${number}`}
                          onClick={() =>
                            setOpenComments((old) => ({
                              ...old,
                              [number]: !old[number],
                            }))
                          }
                        >
                          <Icon name="comment" />
                          {history.length > 0 && (
                            <span className="osas-renewal-comment-count">
                              {history.length}
                            </span>
                          )}
                        </button>
                        {editable && (
                          <button
                            type="button"
                            className="osas-renewal-icon"
                            disabled={busy}
                            title={`Return Form ${number}`}
                            aria-label={`Return Form ${number}`}
                            onClick={() => void returnForm(number)}
                          >
                            <Icon name="return" />
                          </button>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div
                        id={`form-comments-${number}`}
                        className="osas-renewal-comment-panel osas-compact-comments"
                      >
                        <h3>Comments</h3>
                        {history.length > 0 ? (
                          <div
                            className="osas-comment-history"
                            aria-label={`Form ${number} comment history`}
                          >
                            {history.map((comment) => (
                              <article
                                className="osas-comment-item"
                                key={comment.id}
                              >
                                <div className="osas-comment-meta">
                                  <strong>{comment.author}</strong>
                                  <time dateTime={comment.created_at}>
                                    {formatDate(comment.created_at)}
                                  </time>
                                </div>
                                <p>{comment.comment_text}</p>
                              </article>
                            ))}
                          </div>
                        ) : null}
                        {(() => {
                          const events = (detail.activity || []).filter(
                            (event) =>
                              Number(event.form_number) === number &&
                              [
                                "RETURNED",
                                "REVISED_UPLOAD",
                                "RESUBMITTED",
                              ].includes(event.event_type),
                          );
                          return events.length > 0 ? (
                            <div
                              className="osas-comment-timeline"
                              aria-label={`Form ${number} revision activity`}
                            >
                              {events.map((event, index) => (
                                <div
                                  className="osas-comment-timeline-entry"
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
                                    {formatDate(event.created_at)}
                                  </time>
                                </div>
                              ))}
                            </div>
                          ) : null;
                        })()}
                        {!history.length &&
                          !(detail.activity || []).some(
                            (event) =>
                              Number(event.form_number) === number &&
                              [
                                "RETURNED",
                                "REVISED_UPLOAD",
                                "RESUBMITTED",
                              ].includes(event.event_type),
                          ) && (
                            <p className="osas-muted osas-comment-empty">
                              No comments or revision activity yet.
                            </p>
                          )}
                        {editable && (
                          <div className="osas-comment-composer">
                            <textarea
                              id={`comment-${number}`}
                              aria-label={`Write a comment for Form ${number}`}
                              className="osas-renewal-comment"
                              value={drafts[number] || ""}
                              maxLength={2000}
                              disabled={busy}
                              onChange={(e) =>
                                setDrafts((old) => ({
                                  ...old,
                                  [number]: e.target.value,
                                }))
                              }
                              placeholder="Write a new comment (previous comments are preserved)"
                            />
                            <div className="osas-renewal-actions">
                              <button
                                type="button"
                                className="osas-renewal-icon"
                                title="Send comment"
                                aria-label={`Send comment for Form ${number}`}
                                disabled={busy || !drafts[number]?.trim()}
                                onClick={() => void sendComment(number)}
                              >
                                <Icon name="send" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
              {detail.application.status === "SUBMITTED" && (
                <div className="osas-renewal-footer">
                  <button
                    className="osas-primary osas-renewal-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("ACCEPT")}
                  >
                    Approve Renewal
                  </button>
                </div>
              )}
              {detail.application.status === "APPROVED" && (
                <p className="osas-muted">
                  Renewal approved. This organization is now RENEWED. Permanent
                  Office Order Number:{" "}
                  <strong>
                    {detail.application.office_order_number ||
                      "See Organizations"}
                  </strong>
                  .
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="osas-section-heading">
            <h1>Renewal Applications</h1>
            <span className="osas-muted">
              {filtered.length} of {list.length} applications
            </span>
          </div>
          <p className="osas-muted">
            Review and comment on submitted Forms 1–6.
          </p>
          <button
            type="button"
            className="osas-primary renewal-manage-templates-button"
            onClick={() => setShowTemplates(true)}
          >
            Manage Templates
          </button>
          <div
            className="osas-renewal-status-tabs"
            role="group"
            aria-label="Filter renewal applications by status"
          >
            {(["ALL", "SUBMITTED", "APPROVED", "RETURNED"] as StatusTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  className={statusTab === tab ? "is-active" : ""}
                  aria-pressed={statusTab === tab}
                  onClick={() => setStatusTab(tab)}
                >
                  {tab === "ALL"
                    ? "All"
                    : tab === "SUBMITTED"
                      ? "Submitted"
                      : tab === "APPROVED"
                        ? "Approved"
                        : "Returned"}
                </button>
              ),
            )}
          </div>
          <div className="osas-org-toolbar">
            <input
              className="osas-search osas-org-search"
              aria-label="Search renewal applications"
              placeholder="Search organizations or colleges..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="osas-org-college-label">
              College
              <select
                className="osas-org-select"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
              >
                <option value="ALL">All Colleges</option>
                {colleges.map((c) => (
                  <option value={c} key={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading ? (
            <p>Loading applications...</p>
          ) : (
            <div className="osas-table-scroll">
              <table className="osas-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>College</th>
                    <th>Academic Year</th>
                    <th>Forms</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr
                      key={a.id}
                      className="osas-clickable-review"
                      tabIndex={0}
                      role="button"
                      aria-label={`Open renewal for ${a.organization_name}`}
                      onClick={() =>
                        void loadDetail(a.id).catch((e: unknown) =>
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to open application",
                          ),
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void loadDetail(a.id).catch((e: unknown) =>
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Unable to open application",
                            ),
                          );
                        }
                      }}
                    >
                      <td>
                        <span className="osas-renewal-org-cell">
                          <RenewalOrgPhoto
                            orgId={a.organization_id}
                            orgName={a.organization_name}
                          />
                          <span>{a.organization_name}</span>
                        </span>
                      </td>
                      <td>{a.college || "—"}</td>
                      <td>{a.academic_year}</td>
                      <td>{a.uploaded_forms}/6</td>
                      <td>
                        <span className="osas-status">{a.status}</span>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={5}>No matching renewal applications.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
