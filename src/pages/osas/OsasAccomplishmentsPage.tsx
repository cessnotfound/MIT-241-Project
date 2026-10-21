import { useEffect, useMemo, useState } from "react";
import { osasGet } from "./osasTypes";
import ApprovedArchiveBrowser from "./ApprovedArchiveBrowser";
import "../../styles/AccomplishmentReports.css";
import "../../styles/OsasAr.css";

type Report = {
  id: string;
  organization_id: string;
  organization_name: string;
  college: string;
  academic_year: string;
  current_academic_year: string;
  reference_number: string | null;
  status: string;
  review_status: string;
  submitted_at: string | null;
  has_profile_photo?: boolean;
};
type Activity = {
  id: string;
  activity_name: string;
  role: string;
  activity_type: string | null;
  activity_level: string;
  award_level: string | null;
  award_title: string | null;
  start_date: string;
  end_date: string;
  description: string | null;
};
type Project = {
  id: string;
  project_name: string;
  impact_level: string | null;
  beneficiaries: string | null;
  estimated_cost: string | null;
  description: string | null;
};
type Score = { scoring_group: string; option_code: string; raw_points: string };
type Comment = {
  id: string;
  comment_text: string;
  sender: string;
  created_at: string;
};
type Attachment = {
  id: string;
  file_name: string;
  file_kind: string;
  activity_id: string | null;
  tangible_project_id: string | null;
  mime_type: string;
};
type Detail = {
  report: Report;
  organization: { organization_name: string; college: string };
  activities: Activity[];
  projects: Project[];
  scoring: Score[];
  comments: Comment[];
  review: { status: string; returned_at?: string; approved_at?: string } | null;
  attachments: Attachment[];
};
type Archive = {
  id: string;
  organization_id?: string;
  report_id: string;
  organization_name: string;
  college: string;
  academic_year: string;
  reference_number: string;
  approved_at: string;
};
type ArchiveDetail = {
  snapshot: {
    report: Report;
    activities: Activity[];
    projects: Project[];
    scoring: Score[];
    attachments?: Attachment[];
  };
  files: { id: string; original_filename: string }[];
  approved_at: string;
};
const base = "/api/osas/ar";
async function mutate(url: string, body?: object) {
  const r = await fetch(base + url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Action failed");
  return data;
}
const display = (x: string | null | undefined) =>
  x
    ? x
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
const date = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleString("en-PH") : "—";
function weightedScoreForReport(d: Detail): number {
  const lookup = (group: string, code: string | null | undefined) => {
    const found = d.scoring.find(
      (s) => s.scoring_group === group && s.option_code === code,
    );
    return found ? Number(found.raw_points) : 0;
  };
  const initiated = d.activities
    .filter((a) => a.role === "INITIATED")
    .reduce(
      (n, a) =>
        n +
        lookup("INITIATED_LEVEL", a.activity_level) +
        lookup("INITIATED_TYPE", a.activity_type),
      0,
    );
  const participations = d.activities
    .filter((a) => a.role === "PARTICIPATED")
    .reduce((n, a) => n + lookup("PARTICIPATION_LEVEL", a.activity_level), 0);
  const awards = d.activities.reduce(
    (n, a) => n + lookup("EXTERNAL_AWARD_LEVEL", a.award_level),
    0,
  );
  const projects = d.projects.reduce(
    (n, p) => n + lookup("PROJECT_IMPACT", p.impact_level),
    0,
  );
  return initiated * 0.4 + participations * 0.1 + awards * 0.2 + projects * 0.3;
}

function MessageIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-5A8.8 8.8 0 1 1 21 11.5Z" />
    </svg>
  );
}
function OrganizationAvatar({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = organizationName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="osas-ar-org-avatar"
      style={{
        width: 42,
        height: 42,
        minWidth: 42,
        flex: "0 0 42px",
        borderRadius: "50%",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e5426",
        color: "#fff",
        verticalAlign: "middle",
      }}
    >
      {!imageFailed ? (
        <img
          src={`/api/osas/organizations/${encodeURIComponent(organizationId)}/photo`}
          alt={`${organizationName} logo`}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          aria-label="Organization initials"
          style={{ fontWeight: 700, fontSize: 12 }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
export default function OsasAccomplishmentsPage() {
  const [reports, setReports] = useState<Report[]>([]),
    [archive, setArchive] = useState<Archive[]>([]),
    [id, setId] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [archiveId, setArchiveId] = useState(""),
    [archiveDetail, setArchiveDetail] = useState<ArchiveDetail | null>(null);
  const [viewer, setViewer] = useState<{
      kind: "activity" | "project";
      id: string;
    } | null>(null),
    [archiveSearch, setArchiveSearch] = useState(""),
    [archiveCollege, setArchiveCollege] = useState("All Colleges"),
    [archiveYear, setArchiveYear] = useState("All Academic Years");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [listScores, setListScores] = useState<Record<string, number | null>>(
    {},
  );
  const [section, setSection] = useState<"reviews" | "repository">("reviews"),
    [tab, setTab] = useState<"activities" | "projects" | "summary">(
      "activities",
    ),
    [search, setSearch] = useState(""),
    [college, setCollege] = useState("All Colleges"),
    [status, setStatus] = useState("All"),
    [year, setYear] = useState("Current Academic Year"),
    [comment, setComment] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function reload() {
    const [r, a] = await Promise.all([
      osasGet<Report[]>(base + "/reports"),
      osasGet<Archive[]>(base + "/repository"),
    ]);
    setReports(r);
    setArchive(a);
  }
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, []);
  // Refresh when OSAS returns to the browser tab, and while reviewing a report.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [latest, repo] = await Promise.all([
          osasGet<Report[]>(base + "/reports?t=" + Date.now()),
          osasGet<Archive[]>(base + "/repository?t=" + Date.now()),
        ]);
        if (cancelled) return;
        setReports(latest);
        setArchive(repo);
        if (id && !archiveId) {
          const fresh = await osasGet<Detail>(
            base + "/reports/" + id + "?t=" + Date.now(),
          );
          if (!cancelled) setDetail(fresh);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    const handler = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    const timer = window.setInterval(handler, 20000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
      window.clearInterval(timer);
    };
  }, [id, archiveId]);
  async function openReport(next: string) {
    setError("");
    setNotice("");
    setId(next);
    setViewer(null);
    setTab("activities");
    setCommentsOpen(false);
    try {
      setDetail(
        await osasGet<Detail>(base + "/reports/" + next + "?t=" + Date.now()),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function openArchive(next: string) {
    setError("");
    setArchiveId(next);
    setViewer(null);
    setTab("activities");
    try {
      setArchiveDetail(
        await osasGet<ArchiveDetail>(base + "/repository/" + next),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(kind: "comments" | "return" | "approve") {
    if (!id || busy) return;
    if (kind === "comments" && !comment.trim()) {
      setError("Write a comment before sending");
      return;
    }
    if (
      kind === "return" &&
      !window.confirm("Return this whole accomplishment report for revision?")
    )
      return;
    if (
      kind === "approve" &&
      !window.confirm("Approve this report and store its permanent OSAS copy?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/reports/${id}/${kind}`,
        kind === "comments" ? { comment } : {},
      );
      setNotice(
        kind === "comments"
          ? "Comment sent"
          : kind === "return"
            ? "Report returned for revision"
            : "Report approved and archived",
      );
      setComment("");
      await reload();
      await openReport(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const colleges = useMemo(
    () => [
      "All Colleges",
      ...new Set(reports.map((r) => r.college).filter(Boolean)),
    ],
    [reports],
  );
  const years = useMemo(
    () => [
      "Current Academic Year",
      ...new Set(reports.map((r) => r.academic_year)),
    ],
    [reports],
  );
  const shown = reports.filter(
    (r) =>
      (r.organization_name + " " + r.college)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (college === "All Colleges" || r.college === college) &&
      (year === "Current Academic Year"
        ? r.academic_year === r.current_academic_year
        : r.academic_year === year) &&
      (status === "All" ||
        (status === "Submitted" && r.review_status === "SUBMITTED") ||
        (status === "Returned" && r.review_status === "RETURNED") ||
        (status === "Approved" && r.review_status === "APPROVED")),
  );
  // Scores are loaded read-only from the existing report detail endpoint, using the same calculation as Summary.
  // Fetch in small batches to avoid overwhelming the API when many organizations exist.
  useEffect(() => {
    let cancelled = false;
    const missing = reports.filter(
      (r) => !Object.prototype.hasOwnProperty.call(listScores, r.id),
    );
    if (!missing.length) return;
    void (async () => {
      for (let index = 0; index < missing.length && !cancelled; index += 5) {
        const batch = missing.slice(index, index + 5);
        const results = await Promise.all(
          batch.map(async (r) => {
            try {
              const d = await osasGet<Detail>(
                base + "/reports/" + encodeURIComponent(r.id),
              );
              return [r.id, weightedScoreForReport(d)] as const;
            } catch {
              return [r.id, null] as const;
            }
          }),
        );
        if (!cancelled)
          setListScores((previous) => ({
            ...previous,
            ...Object.fromEntries(results),
          }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reports, listScores]);
  const archiveColleges = [
    "All Colleges",
    ...new Set(archive.map((a) => a.college).filter(Boolean)),
  ];
  const archiveYears = [
    "All Academic Years",
    ...new Set(archive.map((a) => a.academic_year)),
  ];

  const d = archiveId ? archiveDetail?.snapshot : detail;
  const isApproved = Boolean(archiveId) || detail?.report.status === "APPROVED";
  const points = (group: string, code: string | null | undefined) => {
    const s = d?.scoring.find(
      (t) => t.scoring_group === group && t.option_code === code,
    );
    return s ? Number(s.raw_points) : 0;
  };
  const activityPoints = (a: Activity) =>
    points(
      a.role === "INITIATED" ? "INITIATED_LEVEL" : "PARTICIPATION_LEVEL",
      a.activity_level,
    ) +
    (a.role === "INITIATED" ? points("INITIATED_TYPE", a.activity_type) : 0) +
    points("EXTERNAL_AWARD_LEVEL", a.award_level);
  const groups = d
    ? [
        {
          name: "Initiated Activities",
          weight: 40,
          items: d.activities.filter((a) => a.role === "INITIATED"),
          raw: d.activities
            .filter((a) => a.role === "INITIATED")
            .reduce(
              (n, a) =>
                n +
                points("INITIATED_LEVEL", a.activity_level) +
                points("INITIATED_TYPE", a.activity_type),
              0,
            ),
        },
        {
          name: "Participations",
          weight: 10,
          items: d.activities.filter((a) => a.role === "PARTICIPATED"),
          raw: d.activities
            .filter((a) => a.role === "PARTICIPATED")
            .reduce(
              (n, a) => n + points("PARTICIPATION_LEVEL", a.activity_level),
              0,
            ),
        },
        {
          name: "Awards and Recognition (External)",
          weight: 20,
          items: d.activities.filter((a) => a.award_level),
          raw: d.activities.reduce(
            (n, a) => n + points("EXTERNAL_AWARD_LEVEL", a.award_level),
            0,
          ),
        },
        {
          name: "Tangible Projects",
          weight: 30,
          items: d.projects,
          raw: d.projects.reduce(
            (n, p) => n + points("PROJECT_IMPACT", p.impact_level),
            0,
          ),
        },
      ]
    : [];
  const totalWeightedPoints = groups.reduce(
    (n, g) => n + (g.raw * g.weight) / 100,
    0,
  );

  return (
    <div className="osas-page osas-ar osas-review-page">
      <h1>Accomplishment Reports</h1>
      <p className="osas-review-subtitle">
        Review the organization's activities, tangible projects and cumulative
        scoring using the existing report rules.
      </p>
      {error && (
        <p className="osas-ar-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="osas-ar-success" role="status">
          {notice}
        </p>
      )}
      {(id || archiveId) && d ? (
        <>
          <div className="osas-ar-detail-head">
            <button
              className="ac-back"
              type="button"
              title="Back to reports"
              onClick={() => {
                setId("");
                setDetail(null);
                setArchiveId("");
                setArchiveDetail(null);
                setError("");
              }}
              aria-label="Back to accomplishment reports"
            >
              <svg
                width="23"
                height="23"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <div className="osas-ar-detail-title">
              <div className="osas-ar-report-info">
                <strong>
                  {archiveId
                    ? archive.find((a) => a.id === archiveId)?.organization_name
                    : detail?.organization.organization_name}
                </strong>
                <span>
                  {archiveId
                    ? archive.find((a) => a.id === archiveId)?.college
                    : detail?.organization.college}
                </span>
              </div>
              <div className="osas-ar-report-metrics">
                <span>
                  Reference:{" "}
                  {archiveId
                    ? archive.find((a) => a.id === archiveId)
                        ?.reference_number || "—"
                    : d.report.reference_number || "—"}
                </span>
                <span>
                  {" "}
                  | Status: {display(archiveId ? "APPROVED" : d.report.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="osas-ar-tabs">
            {(["activities", "projects", "summary"] as const).map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "activities"
                  ? "Accomplishment/Activities"
                  : t === "projects"
                    ? "Tangible Projects"
                    : "Summary"}
              </button>
            ))}
          </div>
          {tab === "activities" && (
            <section>
              <h2>Accomplishment/Activities</h2>
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>Title of Activity</th>
                      <th>Role</th>
                      <th>Type</th>
                      <th>Level</th>
                      <th>Inclusive Dates</th>
                      <th>Award</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.activities.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button
                            type="button"
                            className="osas-ar-link"
                            title="View full details"
                            onClick={() =>
                              setViewer({ kind: "activity", id: a.id })
                            }
                          >
                            {a.activity_name}
                          </button>
                        </td>
                        <td>{display(a.role)}</td>
                        <td>{display(a.activity_type)}</td>
                        <td>{display(a.activity_level)}</td>
                        <td>
                          {a.start_date?.slice(0, 10)} –{" "}
                          {a.end_date?.slice(0, 10)}
                        </td>
                        <td>{a.award_title || display(a.award_level)}</td>
                        <td>{activityPoints(a)} pts</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ac-points-total">
                      <td colSpan={6}>Total Activity Points</td>
                      <td>
                        {d.activities.reduce(
                          (n, a) => n + activityPoints(a),
                          0,
                        )}{" "}
                        pts
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
          {tab === "projects" && (
            <section>
              <h2>Tangible Projects</h2>
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Impact</th>
                      <th>Beneficiaries</th>
                      <th>Estimated Cost</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.projects.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            type="button"
                            className="osas-ar-link"
                            title="View full details"
                            onClick={() =>
                              setViewer({ kind: "project", id: p.id })
                            }
                          >
                            {p.project_name}
                          </button>
                        </td>
                        <td>{display(p.impact_level)}</td>
                        <td>{p.beneficiaries || "—"}</td>
                        <td>
                          {p.estimated_cost == null
                            ? "—"
                            : `₱${Number(p.estimated_cost).toLocaleString("en-PH")}`}
                        </td>
                        <td>{points("PROJECT_IMPACT", p.impact_level)} pts</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ac-points-total">
                      <td colSpan={4}>Total Tangible Project Points</td>
                      <td>
                        {d.projects.reduce(
                          (n, p) =>
                            n + points("PROJECT_IMPACT", p.impact_level),
                          0,
                        )}{" "}
                        pts
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
          {tab === "summary" && (
            <section>
              <h2>Summary</h2>
              <div className="ac-summary-grid">
                <div>
                  <strong>Activities</strong>
                  <p>{d.activities.length}</p>
                </div>
                <div>
                  <strong>Tangible Projects</strong>
                  <p>{d.projects.length}</p>
                </div>
                <div>
                  <strong>Report Status</strong>
                  <p>{display(archiveId ? "APPROVED" : d.report.status)}</p>
                </div>
                <div>
                  <strong>Total Points</strong>
                  <p>{totalWeightedPoints.toFixed(2)}</p>
                </div>
              </div>
              <h3>Accomplishment Evaluation Summary</h3>
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>Evaluation Criteria</th>
                      <th>Weight</th>
                      <th>Records</th>
                      <th>Raw Points</th>
                      <th>Weighted Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.name}>
                        <td>{g.name}</td>
                        <td>{g.weight}%</td>
                        <td>{g.items.length}</td>
                        <td>{g.raw} pts</td>
                        <td>{((g.raw * g.weight) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ac-points-total">
                      <td>TOTAL</td>
                      <td>100%</td>
                      <td>{d.activities.length + d.projects.length}</td>
                      <td>{groups.reduce((n, g) => n + g.raw, 0)} pts</td>
                      <td>
                        {groups
                          .reduce((n, g) => n + (g.raw * g.weight) / 100, 0)
                          .toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="ac-points-note">
                Proposed direct-weighted tally, using the same cumulative
                scoring groups as Organization View. Not an officially confirmed
                normalized rating.
              </p>
            </section>
          )}
          {archiveId && archiveDetail && (
            <section>
              <h3>Preserved Supporting Files</h3>
              {archiveDetail.files.length ? (
                archiveDetail.files.map((f) => (
                  <p key={f.id}>
                    <a
                      href={`${base}/repository/${archiveId}/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {f.original_filename}
                    </a>
                  </p>
                ))
              ) : (
                <p className="osas-muted">
                  No uploaded attachments were included.
                </p>
              )}
            </section>
          )}
          {!archiveId && (
            <section className="osas-ar-comments ac-osas-review-comments">
              <button
                type="button"
                className="osas-ar-comment-toggle"
                onClick={() => setCommentsOpen((v) => !v)}
                aria-expanded={commentsOpen}
                aria-label="Toggle comments"
              >
                <MessageIcon /> <strong>Comments</strong>
                {detail?.comments.length ? ` (${detail.comments.length})` : ""}
              </button>
              {commentsOpen && (
                <>
                  <div className="osas-ar-compact-history">
                    {detail?.review?.returned_at && (
                      <span>
                        ↩ Returned · {date(detail.review.returned_at)}
                      </span>
                    )}
                    {detail?.report.submitted_at && (
                      <span>
                        ↑ Submitted · {date(detail.report.submitted_at)}
                      </span>
                    )}
                  </div>
                  {detail?.comments.map((c) => (
                    <div key={c.id} className="ac-osas-review-comment">
                      <strong>{c.sender}</strong>
                      <small> · {date(c.created_at)}</small>
                      <p>{c.comment_text}</p>
                    </div>
                  ))}
                  {!detail?.comments.length && (
                    <p className="osas-muted">No comments yet.</p>
                  )}
                  {!isApproved && (
                    <>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Write a comment..."
                        rows={2}
                      />
                      <div className="osas-ar-actions">
                        <button
                          onClick={() => void action("comments")}
                          disabled={busy || !comment.trim()}
                          aria-label="Send comment"
                        >
                          Send
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          {!archiveId && !isApproved && (
            <div className="osas-ar-actions">
              <button
                onClick={() => void action("return")}
                disabled={busy || detail?.report.status !== "SUBMITTED"}
              >
                Return for Revision
              </button>
              <button
                className="osas-ar-approve"
                onClick={() => void action("approve")}
                disabled={busy || detail?.report.status !== "SUBMITTED"}
              >
                Approve Report
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="osas-review-tabs">
            <button
              className={section === "reviews" ? "active" : ""}
              onClick={() => setSection("reviews")}
            >
              Reports for Review
            </button>
            <button
              className={section === "repository" ? "active" : ""}
              onClick={() => setSection("repository")}
            >
              Approved Repository
            </button>
          </div>
          {section === "reviews" ? (
            <>
              <div className="osas-review-filters">
                <input
                  aria-label="Search organizations"
                  placeholder="Search organizations or colleges..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="College"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                >
                  {colleges.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Academic year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="osas-review-tabs osas-review-status-tabs">
                {["All", "Submitted", "Returned", "Approved"].map((s) => (
                  <button
                    key={s}
                    className={status === s ? "active" : ""}
                    onClick={() => setStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="osas-table-scroll">
                <table className="osas-table">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>College</th>
                      <th>Academic Year</th>
                      <th>Total Points</th>
                      <th> Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr
                        key={r.id}
                        className="osas-clickable-review"
                        tabIndex={0}
                        role="button"
                        aria-label={`Open accomplishment report for ${r.organization_name}`}
                        onClick={() => void openReport(r.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void openReport(r.id);
                          }
                        }}
                      >
                        <td>
                          <div
                            className="osas-ar-org-cell"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <OrganizationAvatar
                              organizationId={r.organization_id}
                              organizationName={r.organization_name}
                            />
                            <span>{r.organization_name}</span>
                          </div>
                        </td>
                        <td>{r.college}</td>
                        <td>{r.academic_year}</td>
                        <td>
                          {typeof listScores[r.id] === "number"
                            ? listScores[r.id]!.toFixed(2)
                            : listScores[r.id] === null
                              ? "—"
                              : "…"}
                        </td>
                        <td>{display(r.review_status)}</td>
                      </tr>
                    ))}
                    {!shown.length && (
                      <tr>
                        <td colSpan={5}>No matching submitted reports.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="osas-review-filters">
                <input
                  aria-label="Search approved repository"
                  placeholder="Search organizations or reference..."
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                />
                <select
                  aria-label="Repository college"
                  value={archiveCollege}
                  onChange={(e) => setArchiveCollege(e.target.value)}
                >
                  {archiveColleges.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Repository academic year"
                  value={archiveYear}
                  onChange={(e) => setArchiveYear(e.target.value)}
                >
                  {archiveYears.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              <ApprovedArchiveBrowser
                records={archive}
                onOpen={(next) => void openArchive(next)}
                label="accomplishment reports"
                search={archiveSearch}
                college={archiveCollege}
                academicYear={archiveYear}
              />
            </>
          )}
        </>
      )}
      {viewer &&
        d &&
        (() => {
          const isActivity = viewer.kind === "activity";
          const item = isActivity
            ? d.activities.find((a) => a.id === viewer.id)
            : d.projects.find((p) => p.id === viewer.id);
          if (!item) return null;
          const title = isActivity
            ? (item as Activity).activity_name
            : (item as Project).project_name;
          const attachments =
            (archiveId
              ? archiveDetail?.snapshot.attachments
              : detail?.attachments) || [];
          const related = attachments.filter((f) =>
            isActivity
              ? f.activity_id === viewer.id
              : f.tangible_project_id === viewer.id,
          );
          return (
            <div
              className="ac-modal-overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setViewer(null);
              }}
            >
              <div
                className="ac-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${isActivity ? "Activity" : "Project"} details`}
              >
                <div className="ac-modal-header">
                  <strong>
                    {isActivity ? "Activity Report" : "Tangible Project Report"}
                  </strong>
                  <button
                    type="button"
                    aria-label="Close details"
                    onClick={() => setViewer(null)}
                  >
                    ×
                  </button>
                </div>
                <h2 className="ac-detail-title">{title}</h2>
                {isActivity ? (
                  <div className="ac-report-meta osas-ar-modal-grid">
                    <span>
                      <strong>Inclusive Dates</strong>{" "}
                      {(item as Activity).start_date?.slice(0, 10)} –{" "}
                      {(item as Activity).end_date?.slice(0, 10)}
                    </span>
                    <span>
                      <strong>Role</strong> {display((item as Activity).role)}
                    </span>
                    <span>
                      <strong>Type</strong>{" "}
                      {display((item as Activity).activity_type)}
                    </span>
                    <span>
                      <strong>Level</strong>{" "}
                      {display((item as Activity).activity_level)}
                    </span>
                  </div>
                ) : (
                  <div className="ac-report-meta osas-ar-modal-grid">
                    <span>
                      <strong>Impact</strong>{" "}
                      {display((item as Project).impact_level)}
                    </span>
                    <span>
                      <strong>Estimated Cost</strong>{" "}
                      {(item as Project).estimated_cost == null
                        ? "—"
                        : `₱${Number((item as Project).estimated_cost).toLocaleString("en-PH")}`}
                    </span>
                    <span>
                      <strong>Beneficiaries</strong>{" "}
                      {(item as Project).beneficiaries || "—"}
                    </span>
                  </div>
                )}
                <p className="osas-ar-description">
                  {item.description || "No description provided."}
                </p>
                <h3>Supporting Documents and Photos</h3>
                {archiveId ? (
                  <p className="osas-muted">
                    Archived evidence files are available in Preserved
                    Supporting Files below the report.
                  </p>
                ) : related.length ? (
                  related.map((f) => (
                    <p key={f.id}>
                      <a
                        href={`${base}/reports/${id}/attachments/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.file_name}
                      </a>
                    </p>
                  ))
                ) : (
                  <p className="osas-muted">
                    No directly uploaded supporting files.
                  </p>
                )}
                <div className="osas-ar-actions">
                  <button onClick={() => setViewer(null)}>Close</button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
