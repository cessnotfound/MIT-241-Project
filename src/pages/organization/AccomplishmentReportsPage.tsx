import { useCallback, useEffect, useState, type FormEvent } from "react";
import "../../styles/AccomplishmentReports.css";
import "../../styles/FeedbackNotification.css";
import FeedbackNotification from "../../components/FeedbackNotification";

type Report = {
  id: string;
  academic_year: string;
  reference_number: string | null;
  status: string;
  created_at: string;
  activity_count?: number;
  project_count?: number;
};
type Activity = {
  id: string;
  activity_name: string;
  description: string | null;
  role: string;
  activity_type: string | null;
  activity_level: string;
  start_date: string;
  end_date: string;
  participants: string | null;
  award_title: string | null;
  award_level: string | null;
  award_placement: string | null;
};
type Project = {
  id: string;
  project_name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  beneficiaries: string | null;
  outcomes: string | null;
  impact_level: string | null;
  estimated_cost: number | null;
};
type Attachment = {
  id: string;
  file_name: string;
  caption: string | null;
  mime_type: string;
  file_kind: string;
  uploaded_at: string;
};
type Score = {
  scoring_group: string;
  option_code: string;
  label: string;
  raw_points: string;
};
type Detail = {
  report: Report;
  activities: Activity[];
  projects: Project[];
  scoring: Score[];
  osas_comments?: {
    id: string;
    comment_text: string;
    created_at: string;
    sender: string;
  }[];
  review?: {
    status: string;
    returned_at?: string | null;
    approved_at?: string | null;
  } | null;
};
const LEVELS = [
  "DEPARTMENT",
  "COLLEGE",
  "UNIVERSITY",
  "LOCAL",
  "REGIONAL",
  "NATIONAL",
  "INTERNATIONAL",
];
const TYPES = ["CO-CURRICULAR", "EXTRA-CURRICULAR", "OUTREACH"];
const AWARDS = ["LOCAL", "REGIONAL", "NATIONAL", "INTERNATIONAL"];
const impact = ["LOW", "MODERATE", "HIGH"];
const base = "/api/accomplishments";
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const result = await fetch(base + url, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = result.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new Error(
      `API returned ${result.status} ${result.statusText} instead of JSON for ${method} ${base + url}. Check that Express is running and the route exists.`,
    );
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
const nice = (text: string | null | undefined) =>
  text
    ? text
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (x) => x.toUpperCase())
    : "—";
const activityInitial = {
  activity_name: "",
  description: "",
  role: "INITIATED",
  activity_type: "CO-CURRICULAR",
  activity_level: "DEPARTMENT",
  start_date: "",
  end_date: "",
  participants: "",
  award_title: "",
  award_level: "",
  award_placement: "",
};
const projectInitial = {
  project_name: "",
  description: "",
  beneficiaries: "",
  impact_level: "",
  estimated_cost: "",
};
function PhotoSelection({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  return files.length ? (
    <div className="ac-selection-preview">
      <p className="ac-selection-heading">Selected photos ({files.length})</p>
      <div className="ac-photo-grid ac-preview-grid">
        {files.map((file, index) => (
          <PhotoPreview
            key={`${file.name}-${index}`}
            file={file}
            onRemove={() => onRemove(index)}
          />
        ))}
      </div>
    </div>
  ) : null;
}
function PhotoPreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <figure className="ac-photo-tile">
      {url && <img src={url} alt={file.name} />}
      <button
        type="button"
        className="ac-remove-x"
        aria-label={`Remove ${file.name}`}
        title="Remove photo"
        onClick={onRemove}
      >
        ×
      </button>
    </figure>
  );
}
function DocumentSelection({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  return files.length ? (
    <div className="ac-selection-preview">
      <p className="ac-selection-heading">
        Selected documents ({files.length})
      </p>
      <div className="ac-document-list ac-selected-documents">
        {files.map((file, index) => (
          <div key={`${file.name}-${index}`}>
            <span>{file.name}</span>
            <button
              className="ac-remove-x ac-inline-x"
              type="button"
              aria-label={`Remove ${file.name}`}
              onClick={() => onRemove(index)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;
}
function AttachmentPicker({
  kind,
  onFiles,
  disabled = false,
}: {
  kind: "photos" | "documents";
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const isPhoto = kind === "photos";
  return (
    <label
      className="ac-attachment-picker"
      title={isPhoto ? "Add photos" : "Add documents"}
    >
      <input
        type="file"
        className="ac-attachment-file"
        accept={
          isPhoto
            ? "image/jpeg,image/png,image/webp"
            : ".pdf,.docx,image/jpeg,image/png,image/webp"
        }
        multiple
        disabled={disabled}
        onChange={(e) => {
          const picked = Array.from(e.currentTarget.files || []);
          onFiles(picked);
          e.currentTarget.value = "";
        }}
      />
      <span aria-hidden="true" className="ac-picker-plus">
        +
      </span>
      <strong>{isPhoto ? "Add Photos" : "Add Documents"}</strong>
    </label>
  );
}
type LibraryDoc = {
  id: string;
  file_name: string;
  document_type: string;
  activity_title: string;
  resolution_number: number | null;
  source_kind: "activity" | "repository";
  source_activity_id: string | null;
};
type LinkedDoc = {
  id: string;
  source_kind: "activity" | "repository";
  source_file_id: string;
  file_name: string;
  document_type: string;
  source_activity_id: string | null;
  resolution_number: number | null;
  activity_title: string;
};
const libraryKey = (d: {
  source_kind: string;
  id?: string;
  source_file_id?: string;
}) => `${d.source_kind}:${d.id || d.source_file_id}`;
const linkedHref = (d: LinkedDoc) =>
  d.source_kind === "activity"
    ? `/api/documents/activities/${d.source_activity_id}/files/${d.source_file_id}`
    : `/api/documents/repository/${d.source_file_id}/file`;
function DocumentChoice({
  onUpload,
  onReuse,
  disabled = false,
}: {
  onUpload: (files: File[]) => void;
  onReuse: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ac-document-choice">
      <button
        type="button"
        className="ac-inline-detail-toggle"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
      >
        <span aria-hidden="true">{open ? "−" : "+"}</span> Add Documents
      </button>
      {open && (
        <div
          className="ac-document-choice-menu"
          role="group"
          aria-label="Choose document source"
        >
          <label
            className="ac-document-choice-option"
            aria-label="Upload documents from device"
          >
            <input
              type="file"
              accept=".pdf,.docx,image/jpeg,image/png,image/webp"
              multiple
              disabled={disabled}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files || []);
                event.currentTarget.value = "";
                if (files.length) {
                  onUpload(files);
                  setOpen(false);
                }
              }}
            />
            <span className="ac-document-choice-title">Upload Document</span>
            <span className="ac-document-choice-caption">
              Choose files from your device
            </span>
          </label>
          <button
            type="button"
            className="ac-document-choice-option"
            disabled={disabled}
            onClick={() => {
              onReuse();
              setOpen(false);
            }}
          >
            <span className="ac-document-choice-title">
              Reuse Existing Document
            </span>
            <span className="ac-document-choice-caption">
              Choose from Document Management
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
function LinkedRows({
  items,
  editable,
  onUnlink,
}: {
  items: LinkedDoc[];
  editable: boolean;
  onUnlink?: (id: string) => void;
}) {
  return items.length ? (
    <div className="ac-document-list ac-linked-list">
      {items.map((d) => (
        <div key={d.id}>
          <span>
            <a href={linkedHref(d)} target="_blank" rel="noreferrer">
              {d.file_name}
            </a>
            <small>
              Linked · {d.document_type.replaceAll("_", " ")}
              {d.resolution_number
                ? ` · Resolution No. ${d.resolution_number}`
                : ""}
            </small>
          </span>
          <a
            className="ac-link-view"
            href={linkedHref(d)}
            target="_blank"
            rel="noreferrer"
          >
            View
          </a>
          {editable && onUnlink && (
            <button
              type="button"
              className="ac-remove-x ac-inline-x"
              aria-label={`Unlink ${d.file_name}`}
              onClick={() => onUnlink(d.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  ) : null;
}

// Table action icons: no extra dependencies or changes to existing handlers.
function ArActionIcon({ kind }: { kind: "view" | "edit" | "delete" }) {
  if (kind === "view")
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  if (kind === "edit")
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16 4.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16 4.5Z" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14M10 10v7M14 10v7" />
    </svg>
  );
}

export default function AccomplishmentReportsPage() {
  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [picker, setPicker] = useState<null | {
    kind: "activity" | "project";
    id: string | null;
  }>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [chosenLibrary, setChosenLibrary] = useState<string[]>([]);
  const [pendingActivityLinks, setPendingActivityLinks] = useState<
    LibraryDoc[]
  >([]);
  const [pendingProjectLinks, setPendingProjectLinks] = useState<LibraryDoc[]>(
    [],
  );
  const [activityLinks, setActivityLinks] = useState<LinkedDoc[]>([]);
  const [projectLinks, setProjectLinks] = useState<LinkedDoc[]>([]);
  async function openLibrary(kind: "activity" | "project", id: string | null) {
    if (!selected) return;
    setError("");
    setChosenLibrary([]);
    setLibrarySearch("");
    try {
      const docs = await api<LibraryDoc[]>(
        `/reports/${selected}/document-library`,
      );
      setLibrary(docs);
      setPicker({ kind, id });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadLinks(kind: "activity" | "project", id: string) {
    if (!selected) return;
    const segment = kind === "activity" ? "activities" : "projects";
    const linked = await api<LinkedDoc[]>(
      `/reports/${selected}/${segment}/${id}/linked-documents`,
    );
    if (kind === "activity") setActivityLinks(linked);
    else setProjectLinks(linked);
  }
  async function linkFiles(
    kind: "activity" | "project",
    id: string,
    docs: LibraryDoc[],
  ) {
    if (!selected) return;
    const segment = kind === "activity" ? "activities" : "projects";
    for (const d of docs) {
      await api(
        `/reports/${selected}/${segment}/${id}/linked-documents`,
        "POST",
        { source_kind: d.source_kind, source_file_id: d.id },
      );
    }
  }
  async function confirmLibrary() {
    if (!picker) return;
    const docs = library.filter((d) => chosenLibrary.includes(libraryKey(d)));
    if (!docs.length) return;
    setBusy(true);
    setError("");
    try {
      if (picker.id) {
        await linkFiles(picker.kind, picker.id, docs);
        await loadLinks(picker.kind, picker.id);
      } else if (picker.kind === "activity")
        setPendingActivityLinks((old) => [
          ...old,
          ...docs.filter(
            (d) => !old.some((x) => libraryKey(x) === libraryKey(d)),
          ),
        ]);
      else
        setPendingProjectLinks((old) => [
          ...old,
          ...docs.filter(
            (d) => !old.some((x) => libraryKey(x) === libraryKey(d)),
          ),
        ]);
      setPicker(null);
      setMessage("Documents linked successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unlinkFile(
    kind: "activity" | "project",
    id: string,
    linkId: string,
  ) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/reports/${selected}/${kind === "activity" ? "activities" : "projects"}/${id}/linked-documents/${linkId}`,
        "DELETE",
      );
      await loadLinks(kind, id);
      setMessage("Document unlinked successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [create, setCreate] = useState(false);
  const [year, setYear] = useState("2026-2027");
  const [currentYear, setCurrentYear] = useState("2026-2027");
  const [tab, setTab] = useState<"activities" | "projects" | "summary">(
    "activities",
  );
  const [adding, setAdding] = useState<"activity" | "project" | null>(null);
  const [popup, setPopup] = useState<{
    mode: "view" | "edit";
    item: Activity;
  } | null>(null);
  const [photos, setPhotos] = useState<Attachment[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [documents, setDocuments] = useState<Attachment[]>([]);
  const [addDetailsOpen, setAddDetailsOpen] = useState(false);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newDocuments, setNewDocuments] = useState<File[]>([]);
  const [newProjectPhotos, setNewProjectPhotos] = useState<File[]>([]);
  const [newProjectDocuments, setNewProjectDocuments] = useState<File[]>([]);
  const [projectView, setProjectView] = useState<{
    mode: "view" | "edit";
    item: Project;
  } | null>(null);
  const [projectPhotos, setProjectPhotos] = useState<Attachment[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState({ ...activityInitial });
  const [project, setProject] = useState({ ...projectInitial });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!error && !message) return;
    const timeout = window.setTimeout(() => {
      setError("");
      setMessage("");
    }, 5500);
    return () => window.clearTimeout(timeout);
  }, [error, message]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadList = useCallback(async () => {
    setReports(await api<Report[]>("/reports"));
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    setDetail(await api<Detail>("/reports/" + id));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/academic-years/current", { credentials: "same-origin" })
      .then(async (res) => {
        const d = (await res.json()) as {
          academic_year?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(d.error || "Unable to load academic year");
        return d;
      })
      .then((d) => {
        if (!cancelled && d.academic_year) {
          setCurrentYear(d.academic_year);
          setYear(d.academic_year);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Unable to load academic year",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    loadList()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadList]);
  const open = async (id: string) => {
    setError("");
    setSelected(id);
    setTab("activities");
    setAdding(null);
    setPopup(null);
    try {
      await loadDetail(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function run(
    action: () => Promise<unknown>,
    after?: () => void,
    successMessage = "Changes saved successfully.",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      after?.();
      setMessage(successMessage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const locked = detail
    ? detail.report.academic_year !== currentYear ||
      !["DRAFT", "RETURNED"].includes(detail.report.status)
    : true;
  // Category score references remain cumulative; direct weighting is shown separately as a proposed tally.
  const scoreValue = (
    group: string,
    code: string | null | undefined,
  ): number | null => {
    if (!code) return null;
    const match = detail?.scoring.find(
      (s) => s.scoring_group === group && s.option_code === code,
    );
    return match ? Number(match.raw_points) : null;
  };
  const activityBreakdown = (a: Activity) => {
    const level = scoreValue(
      a.role === "INITIATED" ? "INITIATED_LEVEL" : "PARTICIPATION_LEVEL",
      a.activity_level,
    );
    const type =
      a.role === "INITIATED"
        ? scoreValue("INITIATED_TYPE", a.activity_type)
        : null;
    const award = scoreValue("EXTERNAL_AWARD_LEVEL", a.award_level);
    const unscored =
      level === null ||
      (a.role === "INITIATED" && type === null) ||
      (Boolean(a.award_level) && award === null);
    return {
      level,
      type,
      award,
      total: unscored ? null : level! + (type ?? 0) + (award ?? 0),
    };
  };
  const projectPoints = (p: Project) =>
    scoreValue("PROJECT_IMPACT", p.impact_level);
  const activityTotal =
    detail?.activities.reduce(
      (sum, a) => sum + (activityBreakdown(a).total ?? 0),
      0,
    ) ?? 0;
  const projectTotal =
    detail?.projects.reduce((sum, p) => sum + (projectPoints(p) ?? 0), 0) ?? 0;
  const unscoredActivities =
    detail?.activities.filter((a) => activityBreakdown(a).total === null)
      .length ?? 0;
  const unscoredProjects =
    detail?.projects.filter((p) => projectPoints(p) === null).length ?? 0;
  const fmtPoints = (n: number | null) =>
    n === null ? "—" : `${Number.isInteger(n) ? n : n.toFixed(2)} pts`;
  // Four distinct categories: never count an external award inside initiated/participation totals.
  const initiatedEntries =
    detail?.activities.filter((a) => a.role === "INITIATED") ?? [];
  const participationEntries =
    detail?.activities.filter((a) => a.role === "PARTICIPATED") ?? [];
  const awardEntries =
    detail?.activities.filter((a) => Boolean(a.award_level)) ?? [];
  const initiatedSubtotal = initiatedEntries.reduce(
    (sum, a) =>
      sum +
      (scoreValue("INITIATED_LEVEL", a.activity_level) ?? 0) +
      (scoreValue("INITIATED_TYPE", a.activity_type) ?? 0),
    0,
  );
  const participationSubtotal = participationEntries.reduce(
    (sum, a) =>
      sum + (scoreValue("PARTICIPATION_LEVEL", a.activity_level) ?? 0),
    0,
  );
  const awardSubtotal = awardEntries.reduce(
    (sum, a) => sum + (scoreValue("EXTERNAL_AWARD_LEVEL", a.award_level) ?? 0),
    0,
  );
  const grandRawSubtotal =
    initiatedSubtotal + participationSubtotal + awardSubtotal + projectTotal;
  const pendingInitiated = initiatedEntries.some(
    (a) =>
      scoreValue("INITIATED_LEVEL", a.activity_level) === null ||
      scoreValue("INITIATED_TYPE", a.activity_type) === null,
  );
  const pendingParticipation = participationEntries.some(
    (a) => scoreValue("PARTICIPATION_LEVEL", a.activity_level) === null,
  );
  const pendingAward = awardEntries.some(
    (a) => scoreValue("EXTERNAL_AWARD_LEVEL", a.award_level) === null,
  );
  const summaryRows = [
    {
      name: "Initiated Activities",
      weight: 40,
      count: initiatedEntries.length,
      points: initiatedSubtotal,
      pending: pendingInitiated,
    },
    {
      name: "Participations",
      weight: 10,
      count: participationEntries.length,
      points: participationSubtotal,
      pending: pendingParticipation,
    },
    {
      name: "Awards and Recognition (External)",
      weight: 20,
      count: awardEntries.length,
      points: awardSubtotal,
      pending: pendingAward,
    },
    {
      name: "Tangible Projects",
      weight: 30,
      count: detail?.projects.length ?? 0,
      points: projectTotal,
      pending: unscoredProjects > 0,
    },
  ];
  // Proposed direct weighting: cumulative category points x category weight.
  // The MMSU guidelines state the weights but do not define a final normalized rating.
  const weightedSubtotal = summaryRows.reduce(
    (sum, row) => sum + row.points * (row.weight / 100),
    0,
  );
  const formatWeighted = (points: number) => points.toFixed(2);

  async function sendFiles(
    activityId: string,
    files: File[],
    kind: "photos" | "documents",
  ) {
    if (!selected) return;
    for (const file of files) {
      const response = await fetch(
        `${base}/reports/${selected}/activities/${activityId}/${kind}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Could not upload ${file.name}`);
      }
    }
  }
  async function saveActivity(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      // Create the database activity first; attachment rows need its ID.
      const saved = await api<Activity>(
        `/reports/${selected}/activities`,
        "POST",
        activity,
      );
      try {
        await sendFiles(saved.id, newPhotos, "photos");
        await sendFiles(saved.id, newDocuments, "documents");
        await linkFiles("activity", saved.id, pendingActivityLinks);
      } catch (uploadError) {
        await loadDetail(selected);
        throw new Error(
          `Activity saved, but some attachments failed: ${(uploadError as Error).message}. Use Edit to retry.`,
        );
      }
      await loadDetail(selected);
      setAdding(null);
      setActivity({ ...activityInitial });
      setNewPhotos([]);
      setNewDocuments([]);
      setPendingActivityLinks([]);
      setMessage("Activity created successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sendProjectFiles(
    projectId: string,
    files: File[],
    kind: "photos" | "documents",
  ) {
    if (!selected) return;
    for (const file of files) {
      const response = await fetch(
        `${base}/reports/${selected}/projects/${projectId}/${kind}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed: ${file.name}`);
      }
    }
  }
  async function saveProject(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Project>(
        `/reports/${selected}/projects`,
        "POST",
        project,
      );
      try {
        await sendProjectFiles(saved.id, newProjectPhotos, "photos");
        await sendProjectFiles(saved.id, newProjectDocuments, "documents");
        await linkFiles("project", saved.id, pendingProjectLinks);
      } catch (err) {
        await loadDetail(selected);
        throw new Error(
          `Project saved, but an upload failed: ${(err as Error).message}`,
        );
      }
      await loadDetail(selected);
      setAdding(null);
      setProject({ ...projectInitial });
      setNewProjectPhotos([]);
      setNewProjectDocuments([]);
      setPendingProjectLinks([]);
      setMessage("Tangible project created successfully.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function viewProject(item: Project, mode: "view" | "edit" = "view") {
    if (!selected) return;
    setError("");
    setProjectView({ mode, item });
    setProject({
      project_name: item.project_name,
      description: item.description || "",
      beneficiaries: item.beneficiaries || "",
      impact_level: item.impact_level || "",
      estimated_cost:
        item.estimated_cost == null ? "" : String(item.estimated_cost),
    });
    try {
      const [p, d] = await Promise.all([
        api<Attachment[]>(`/reports/${selected}/projects/${item.id}/photos`),
        api<Attachment[]>(`/reports/${selected}/projects/${item.id}/documents`),
      ]);
      setProjectPhotos(p);
      setProjectDocuments(d);
      await loadLinks("project", item.id);
    } catch (e) {
      setError((e as Error).message);
      setProjectPhotos([]);
      setProjectDocuments([]);
    }
  }
  async function editProject(e: FormEvent) {
    e.preventDefault();
    if (!selected || !projectView) return;
    await run(
      async () => {
        await api<Project>(
          `/reports/${selected}/projects/${projectView.item.id}`,
          "PUT",
          project,
        );
        await loadDetail(selected);
        setProjectView(null);
      },
      undefined,
      "Tangible project updated successfully.",
    );
  }
  async function uploadProjectFiles(
    files: File[],
    kind: "photos" | "documents",
  ) {
    if (!files || !selected || !projectView) return;
    setPhotoBusy(true);
    setError("");
    try {
      await sendProjectFiles(projectView.item.id, Array.from(files), kind);
      const list = await api<Attachment[]>(
        `/reports/${selected}/projects/${projectView.item.id}/${kind}`,
      );
      if (kind === "photos") setProjectPhotos(list);
      else setProjectDocuments(list);
      setMessage("Files updated successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function removeProjectFile(kind: "photos" | "documents", id: string) {
    if (!selected || !projectView) return;
    setPhotoBusy(true);
    setError("");
    try {
      await api(
        `/reports/${selected}/projects/${projectView.item.id}/${kind}/${id}`,
        "DELETE",
      );
      const list = await api<Attachment[]>(
        `/reports/${selected}/projects/${projectView.item.id}/${kind}`,
      );
      if (kind === "photos") setProjectPhotos(list);
      else setProjectDocuments(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function showPopup(item: Activity, mode: "view" | "edit" = "view") {
    setError("");
    setPopup({ item, mode });
    setActivity({
      activity_name: item.activity_name,
      description: item.description || "",
      role: item.role,
      activity_type: item.activity_type || "",
      activity_level: item.activity_level,
      start_date: item.start_date.slice(0, 10),
      end_date: item.end_date.slice(0, 10),
      participants: item.participants || "",
      award_title: item.award_title || "",
      award_level: item.award_level || "",
      award_placement: item.award_placement || "",
    });
    try {
      const [p, d] = await Promise.all([
        api<Attachment[]>(`/reports/${selected}/activities/${item.id}/photos`),
        api<Attachment[]>(
          `/reports/${selected}/activities/${item.id}/documents`,
        ),
      ]);
      setPhotos(p);
      setDocuments(d);
      await loadLinks("activity", item.id);
    } catch (e) {
      setError((e as Error).message);
      setPhotos([]);
      setDocuments([]);
    }
  }
  async function editActivity(e: FormEvent) {
    e.preventDefault();
    if (!selected || !popup) return;
    await run(
      async () => {
        await api<Activity>(
          `/reports/${selected}/activities/${popup.item.id}`,
          "PUT",
          activity,
        );
        await loadDetail(selected);
        setPopup(null);
      },
      undefined,
      "Activity updated successfully.",
    );
  }
  async function uploadPhotos(files: File[]) {
    if (!files || !selected || !popup) return;
    setPhotoBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        )
          throw new Error("Photos must be JPG, PNG or WebP, maximum 5 MB each");
        const response = await fetch(
          `${base}/reports/${selected}/activities/${popup.item.id}/photos`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": file.type },
            body: file,
          },
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Upload failed");
        }
      }
      setPhotos(
        await api<Attachment[]>(
          `/reports/${selected}/activities/${popup.item.id}/photos`,
        ),
      );
      setMessage("Photos uploaded successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function uploadDocuments(files: File[]) {
    if (!files || !selected || !popup) return;
    setPhotoBusy(true);
    setError("");
    try {
      await sendFiles(popup.item.id, Array.from(files), "documents");
      setDocuments(
        await api<Attachment[]>(
          `/reports/${selected}/activities/${popup.item.id}/documents`,
        ),
      );
      setMessage("Documents uploaded successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  function select(name: string, value: string) {
    setActivity((current) => ({ ...current, [name]: value }));
  }
  function proj(name: string, value: string) {
    setProject((current) => ({ ...current, [name]: value }));
  }
  return (
    <div className="accomplishments-page">
      <h1>Accomplishment Reports</h1>
      <FeedbackNotification
        error={error}
        message={message}
        onDismiss={() => {
          setError("");
          setMessage("");
        }}
      />
      {loading ? (
        <p>Loading reports...</p>
      ) : !selected ? (
        <>
          {!create ? (
            <>
              <button className="ac-primary" onClick={() => setCreate(true)}>
                + New Report
              </button>
              {!reports.length ? (
                <p className="ac-muted">
                  No reports yet. Create your first accomplishment report.
                </p>
              ) : (
                reports.map((r) => (
                  <div className="ac-report-row" key={r.id}>
                    <button
                      className="ac-report-open"
                      onClick={() => void open(r.id)}
                    >
                      <strong>Academic Year {r.academic_year}</strong>
                      <small>
                        Reference: {r.reference_number || "Not assigned"}
                      </small>
                    </button>
                    <div>
                      <strong>Status: </strong>
                      {nice(r.status)}
                      <small>
                        {new Date(r.created_at).toLocaleDateString()}
                      </small>
                    </div>
                    <div>
                      <small>
                        {r.activity_count ?? 0} activities ·{" "}
                        {r.project_count ?? 0} projects
                      </small>
                    </div>
                    {r.academic_year === currentYear &&
                      ["DRAFT", "RETURNED"].includes(r.status) && (
                        <button
                          className="ac-delete"
                          type="button"
                          disabled={busy}
                          title="Delete report"
                          aria-label={`Delete report ${r.academic_year}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this report and all its activities and projects?",
                              )
                            )
                              void run(
                                async () => {
                                  await api(`/reports/${r.id}`, "DELETE");
                                  await loadList();
                                },
                                undefined,
                                "Report deleted successfully.",
                              );
                          }}
                        >
                          <svg
                            width="21"
                            height="21"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      )}
                  </div>
                ))
              )}
            </>
          ) : (
            <form
              className="ac-create"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  async () => {
                    const r = await api<Report>("/reports", "POST", {
                      academic_year: year,
                    });
                    await loadList();
                    await open(r.id);
                    setCreate(false);
                  },
                  undefined,
                  "Report created successfully.",
                );
              }}
            >
              <h2>Create New Report</h2>
              <label>
                Academic Year
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value={currentYear}>{currentYear}</option>
                </select>
              </label>
              <div className="ac-actions">
                <button className="ac-primary" disabled={busy}>
                  Create Report
                </button>
                <button type="button" onClick={() => setCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      ) : !detail ? (
        <p>Loading report...</p>
      ) : (
        <>
          <div className="ac-headline">
            <button
              className="ac-back"
              type="button"
              onClick={() => {
                setSelected(null);
                setDetail(null);
                setAdding(null);
                void loadList();
              }}
              aria-label="Back to reports"
              title="Back to reports"
            >
              <svg
                width="24"
                height="24"
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
            <div>
              <strong>Academic Year {detail.report.academic_year}</strong>
              <p>
                Reference: {detail.report.reference_number || "Not assigned"} ·{" "}
                {nice(detail.report.status)}
              </p>
            </div>
          </div>
          {detail.report.academic_year !== currentYear && (
            <p className="ac-muted" role="status">
              Archived academic year — view and download only. Editing,
              submitting, and deleting are disabled.
            </p>
          )}
          <div className="ac-tabs" role="tablist" aria-label="Report sections">
            <button
              role="tab"
              aria-selected={tab === "activities"}
              className={tab === "activities" ? "active" : ""}
              onClick={() => {
                setTab("activities");
                setAdding(null);
              }}
            >
              Accomplishment/Activities
            </button>
            <button
              role="tab"
              aria-selected={tab === "projects"}
              className={tab === "projects" ? "active" : ""}
              onClick={() => {
                setTab("projects");
                setAdding(null);
              }}
            >
              Tangible Projects
            </button>
            <button
              role="tab"
              aria-selected={tab === "summary"}
              className={tab === "summary" ? "active" : ""}
              onClick={() => {
                setTab("summary");
                setAdding(null);
              }}
            >
              Summary
            </button>
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
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.activities.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.activity_name}</strong>
                        </td>
                        <td>{nice(a.role)}</td>
                        <td>{nice(a.activity_type)}</td>
                        <td>{nice(a.activity_level)}</td>
                        <td>
                          {a.start_date.slice(0, 10)} –{" "}
                          {a.end_date.slice(0, 10)}
                        </td>
                        <td>{a.award_title || "—"}</td>
                        <td
                          className="ac-points-cell"
                          title={(() => {
                            const b = activityBreakdown(a);
                            return `Level: ${fmtPoints(b.level)}${a.role === "INITIATED" ? ` + Type: ${fmtPoints(b.type)}` : ""}${a.award_level ? ` + Award: ${fmtPoints(b.award)}` : ""}`;
                          })()}
                        >
                          {fmtPoints(activityBreakdown(a).total)}
                        </td>
                        <td>
                          <div className="ac-row-actions">
                            <button
                              type="button"
                              className="ac-table-icon ac-table-icon-view"
                              onClick={() => void showPopup(a)}
                              aria-label={`View details for ${a.activity_name}`}
                              title="View details"
                            >
                              <ArActionIcon kind="view" />
                            </button>
                            {!locked && (
                              <button
                                type="button"
                                className="ac-table-icon ac-table-icon-edit"
                                onClick={() => void showPopup(a, "edit")}
                                aria-label={`Edit ${a.activity_name}`}
                                title="Edit"
                              >
                                <ArActionIcon kind="edit" />
                              </button>
                            )}
                            {!locked && (
                              <button
                                type="button"
                                className="ac-table-icon ac-table-icon-delete"
                                disabled={busy}
                                aria-label={`Remove ${a.activity_name}`}
                                title="Remove"
                                onClick={() => {
                                  if (window.confirm("Remove this activity?"))
                                    void run(
                                      async () => {
                                        await api(
                                          `/reports/${selected}/activities/${a.id}`,
                                          "DELETE",
                                        );
                                        setPopup(null);
                                        await loadDetail(selected);
                                      },
                                      undefined,
                                      "Activity removed successfully.",
                                    );
                                }}
                              >
                                <ArActionIcon kind="delete" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ac-points-total">
                      <td colSpan={6}>
                        <strong>Total Activity Points</strong>
                        {unscoredActivities > 0 && (
                          <span className="ac-unscored">
                            {" "}
                            · {unscoredActivities} not yet scored
                          </span>
                        )}
                      </td>
                      <td className="ac-points-cell">
                        <strong>{fmtPoints(activityTotal)}</strong>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="ac-points-note">
                Raw points = activity level + initiated activity type (if
                applicable) + external award level (if provided). This is not
                the final weighted report rating.
              </p>
              {!detail.activities.length && (
                <p className="ac-muted">No activities recorded yet.</p>
              )}
              {!locked && !adding && (
                <button
                  className="ac-primary"
                  onClick={() => setAdding("activity")}
                >
                  + Add Activity
                </button>
              )}
              {adding === "activity" && (
                <form
                  className="ac-form"
                  onSubmit={(e) => void saveActivity(e)}
                >
                  <h3>New Activity</h3>
                  <div className="ac-form-grid ac-activity-layout">
                    <label className="ac-wide">
                      Activity Name *
                      <input
                        required
                        maxLength={250}
                        value={activity.activity_name}
                        onChange={(e) =>
                          select("activity_name", e.target.value)
                        }
                      />
                    </label>
                    <label className="ac-activity-half">
                      Role *
                      <select
                        value={activity.role}
                        onChange={(e) => select("role", e.target.value)}
                      >
                        <option value="INITIATED">Initiated</option>
                        <option value="PARTICIPATED">Participated</option>
                      </select>
                    </label>
                    <label className="ac-activity-half">
                      Type {activity.role === "INITIATED" ? "*" : ""}
                      <select
                        required={activity.role === "INITIATED"}
                        value={activity.activity_type}
                        onChange={(e) =>
                          select("activity_type", e.target.value)
                        }
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {nice(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ac-activity-third">
                      Level *
                      <select
                        value={activity.activity_level}
                        onChange={(e) =>
                          select("activity_level", e.target.value)
                        }
                      >
                        {LEVELS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ac-activity-third">
                      Start Date *
                      <input
                        required
                        type="date"
                        value={activity.start_date}
                        onChange={(e) => select("start_date", e.target.value)}
                      />
                    </label>
                    <label className="ac-activity-third">
                      End Date *
                      <input
                        required
                        type="date"
                        min={activity.start_date || undefined}
                        value={activity.end_date}
                        onChange={(e) => select("end_date", e.target.value)}
                      />
                    </label>
                    <label className="ac-wide">
                      Description
                      <textarea
                        value={activity.description}
                        onChange={(e) => select("description", e.target.value)}
                        rows={3}
                      />
                    </label>
                  </div>
                  <div className="ac-inline-add-row">
                    <button
                      type="button"
                      className="ac-inline-detail-toggle"
                      aria-expanded={addDetailsOpen}
                      onClick={() => setAddDetailsOpen((open) => !open)}
                    >
                      <span aria-hidden="true">
                        {addDetailsOpen ? "−" : "+"}
                      </span>{" "}
                      Additional Details{" "}
                      <span className="ac-detail-optional">(optional)</span>
                    </button>
                    <AttachmentPicker
                      kind="photos"
                      disabled={busy}
                      onFiles={(files) =>
                        setNewPhotos((old) => [...old, ...files])
                      }
                    />
                    <DocumentChoice
                      disabled={busy}
                      onUpload={(files) =>
                        setNewDocuments((old) => [...old, ...files])
                      }
                      onReuse={() => void openLibrary("activity", null)}
                    />
                  </div>
                  {addDetailsOpen && (
                    <div className="ac-optional-fields ac-form-grid">
                      <label>
                        Participants (names/groups)
                        <input
                          value={activity.participants}
                          onChange={(e) =>
                            select("participants", e.target.value)
                          }
                          placeholder="Names or groups"
                        />
                      </label>
                      <label>
                        Award Title (optional)
                        <input
                          value={activity.award_title}
                          onChange={(e) =>
                            select("award_title", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Award Level (optional)
                        <select
                          value={activity.award_level}
                          onChange={(e) =>
                            select("award_level", e.target.value)
                          }
                        >
                          <option value="">None</option>
                          {AWARDS.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Award Placement (optional)
                        <input
                          value={activity.award_placement}
                          onChange={(e) =>
                            select("award_placement", e.target.value)
                          }
                        />
                      </label>
                    </div>
                  )}
                  <section className="ac-inline-selections">
                    <PhotoSelection
                      files={newPhotos}
                      onRemove={(i) =>
                        setNewPhotos((old) => old.filter((_, j) => i !== j))
                      }
                    />
                    <DocumentSelection
                      files={newDocuments}
                      onRemove={(i) =>
                        setNewDocuments((old) => old.filter((_, j) => i !== j))
                      }
                    />
                    <div className="ac-pending-links">
                      {pendingActivityLinks.map((d) => (
                        <div key={libraryKey(d)}>
                          {d.file_name}{" "}
                          <small>Linked from Document Management</small>
                          <button
                            type="button"
                            className="ac-remove-x ac-inline-x"
                            onClick={() =>
                              setPendingActivityLinks((old) =>
                                old.filter(
                                  (x) => libraryKey(x) !== libraryKey(d),
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="ac-actions">
                    <button className="ac-primary" disabled={busy}>
                      {busy ? "Saving…" : "Save Activity"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(null);
                        setNewPhotos([]);
                        setNewDocuments([]);
                        setPendingActivityLinks([]);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
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
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.projects.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.project_name}</strong>
                        </td>
                        <td>{nice(p.impact_level)}</td>
                        <td>{p.beneficiaries || "—"}</td>
                        <td>
                          {p.estimated_cost == null
                            ? "—"
                            : `₱${Number(p.estimated_cost).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </td>
                        <td className="ac-points-cell">
                          {fmtPoints(projectPoints(p))}
                        </td>
                        <td>
                          <div className="ac-row-actions">
                            <button
                              type="button"
                              className="ac-table-icon ac-table-icon-view"
                              onClick={() => void viewProject(p)}
                              aria-label={`View details for ${p.project_name}`}
                              title="View details"
                            >
                              <ArActionIcon kind="view" />
                            </button>
                            {!locked && (
                              <button
                                type="button"
                                className="ac-table-icon ac-table-icon-edit"
                                onClick={() => void viewProject(p, "edit")}
                                aria-label={`Edit ${p.project_name}`}
                                title="Edit"
                              >
                                <ArActionIcon kind="edit" />
                              </button>
                            )}
                            {!locked && (
                              <button
                                className="ac-table-icon ac-table-icon-delete"
                                disabled={busy}
                                aria-label={`Remove ${p.project_name}`}
                                title="Remove"
                                onClick={() => {
                                  if (window.confirm("Remove this project?"))
                                    void run(
                                      async () => {
                                        await api(
                                          `/reports/${selected}/projects/${p.id}`,
                                          "DELETE",
                                        );
                                        await loadDetail(selected);
                                      },
                                      undefined,
                                      "Tangible project removed successfully.",
                                    );
                                }}
                              >
                                <ArActionIcon kind="delete" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ac-points-total">
                      <td colSpan={4}>
                        <strong>Total Tangible Project Points</strong>
                        {unscoredProjects > 0 && (
                          <span className="ac-unscored">
                            {" "}
                            · {unscoredProjects} not yet scored
                          </span>
                        )}
                      </td>
                      <td className="ac-points-cell">
                        <strong>{fmtPoints(projectTotal)}</strong>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="ac-points-note">
                Raw points are based on each project's impact level. Projects
                without an impact evaluation are not included in the subtotal.
              </p>
              {!detail.projects.length && (
                <p className="ac-muted">No tangible projects recorded yet.</p>
              )}
              {!locked && !adding && (
                <button
                  className="ac-primary"
                  onClick={() => setAdding("project")}
                >
                  + Add Tangible Project
                </button>
              )}
              {adding === "project" && (
                <form className="ac-form" onSubmit={(e) => void saveProject(e)}>
                  <h3>New Tangible Project</h3>
                  <div className="ac-form-grid">
                    <label>
                      Project Name *
                      <input
                        required
                        maxLength={250}
                        value={project.project_name}
                        onChange={(e) => proj("project_name", e.target.value)}
                      />
                    </label>
                    <label>
                      Impact Level
                      <select
                        value={project.impact_level}
                        onChange={(e) => proj("impact_level", e.target.value)}
                      >
                        <option value="">Not evaluated</option>
                        {impact.map((i) => (
                          <option key={i} value={i}>
                            {nice(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Beneficiaries
                      <input
                        type="text"
                        value={project.beneficiaries}
                        placeholder="Enter beneficiaries"
                        onChange={(e) => proj("beneficiaries", e.target.value)}
                      />
                    </label>
                    <label>
                      Estimated Cost (₱)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={project.estimated_cost}
                        placeholder="0.00"
                        onChange={(e) => proj("estimated_cost", e.target.value)}
                      />
                    </label>
                    <label className="ac-wide">
                      Description
                      <textarea
                        rows={3}
                        value={project.description}
                        onChange={(e) => proj("description", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="ac-inline-add-row">
                    <AttachmentPicker
                      kind="photos"
                      disabled={busy}
                      onFiles={(files) =>
                        setNewProjectPhotos((old) => [...old, ...files])
                      }
                    />
                    <DocumentChoice
                      disabled={busy}
                      onUpload={(files) =>
                        setNewProjectDocuments((old) => [...old, ...files])
                      }
                      onReuse={() => void openLibrary("project", null)}
                    />
                  </div>
                  <section className="ac-inline-selections">
                    <PhotoSelection
                      files={newProjectPhotos}
                      onRemove={(i) =>
                        setNewProjectPhotos((old) =>
                          old.filter((_, j) => i !== j),
                        )
                      }
                    />
                    <DocumentSelection
                      files={newProjectDocuments}
                      onRemove={(i) =>
                        setNewProjectDocuments((old) =>
                          old.filter((_, j) => i !== j),
                        )
                      }
                    />
                    <div className="ac-pending-links">
                      {pendingProjectLinks.map((d) => (
                        <div key={libraryKey(d)}>
                          {d.file_name}{" "}
                          <small>Linked from Document Management</small>
                          <button
                            type="button"
                            className="ac-remove-x ac-inline-x"
                            onClick={() =>
                              setPendingProjectLinks((old) =>
                                old.filter(
                                  (x) => libraryKey(x) !== libraryKey(d),
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="ac-actions">
                    <button className="ac-primary" disabled={busy}>
                      {busy ? "Saving…" : "Save Project"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(null);
                        setNewProjectPhotos([]);
                        setNewProjectDocuments([]);
                        setPendingProjectLinks([]);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
          {tab === "summary" && (
            <section>
              <h2>Summary</h2>
              <div className="ac-summary-grid">
                <div>
                  <strong>Activities</strong>
                  <p>{detail.activities.length}</p>
                </div>
                <div>
                  <strong>Tangible Projects</strong>
                  <p>{detail.projects.length}</p>
                </div>
                <div>
                  <strong>Total Points</strong>
                  <p>{formatWeighted(weightedSubtotal)}</p>
                </div>
                <div>
                  <strong>Report Status</strong>
                  <p>{nice(detail.report.status)}</p>
                </div>
              </div>
              <h3>Accomplishment Evaluation Summary</h3>
              <div className="ac-table-wrap">
                <table className="ac-table ac-summary-scores">
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
                    {summaryRows.map((row) => (
                      <tr key={row.name}>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td>{row.weight}%</td>
                        <td>{row.count}</td>
                        <td className="ac-points-cell">
                          {fmtPoints(row.points)}
                          {row.pending && (
                            <span className="ac-unscored"> (incomplete)</span>
                          )}
                        </td>
                        <td className="ac-points-cell">
                          {formatWeighted((row.points * row.weight) / 100)}
                          {row.pending && (
                            <span className="ac-unscored"> (incomplete)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ac-points-total">
                      <td>
                        <strong>TOTAL</strong>
                      </td>
                      <td>
                        <strong>100%</strong>
                      </td>
                      <td>
                        <strong>
                          {detail.activities.length + detail.projects.length}
                        </strong>
                      </td>
                      <td className="ac-points-cell">
                        <strong>{fmtPoints(grandRawSubtotal)}</strong>
                      </td>
                      <td className="ac-points-cell">
                        <strong>{formatWeighted(weightedSubtotal)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="ac-points-note">
                Weighted Points = each category’s cumulative raw points × its
                stated weight (40%, 10%, 20%, 30%). This is a proposed
                direct-weighted tally, NOT an officially confirmed MMSU rating
                or a percentage out of 100. The guideline specifies category
                weights but no normalization target. Raw points remain
                cumulative: additional qualifying records increase totals.
                Awards are counted separately. Any unscored entries are excluded
                until evaluated.
              </p>
              {!locked ? (
                <div className="ac-actions">
                  <button
                    className="ac-primary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Submit this report for review? You will no longer be able to edit it.",
                        )
                      )
                        void run(
                          async () => {
                            await api(
                              `/reports/${selected}/submit`,
                              "POST",
                              {},
                            );
                            await loadDetail(selected);
                          },
                          undefined,
                          "Report submitted successfully.",
                        );
                    }}
                  >
                    Submit for Approval
                  </button>
                </div>
              ) : (
                <p className="ac-muted">
                  This report is read-only while submitted or approved. Returned
                  reports can be edited and submitted again.
                </p>
              )}
            </section>
          )}
          {tab === "summary" &&
          (detail.osas_comments?.length ||
            detail.review?.returned_at ||
            detail.review?.approved_at) ? (
            <section className="ac-osas-review-comments">
              <button
                type="button"
                className="ac-ar-comments-toggle"
                aria-expanded={commentsOpen}
                onClick={() => setCommentsOpen((value) => !value)}
                title="Show or hide comments"
              >
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
                  <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-4A8.6 8.6 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z" />
                </svg>
                <strong>Comments</strong>
                <span className="ac-ar-comments-count">
                  ({detail.osas_comments?.length ?? 0})
                </span>
              </button>
              {commentsOpen && (
                <div className="ac-ar-comments-body">
                  {detail.review?.returned_at && (
                    <p className="ac-muted ac-review-audit">
                      ↩ Returned for revision ·{" "}
                      {new Date(detail.review.returned_at).toLocaleString(
                        "en-PH",
                      )}
                    </p>
                  )}
                  {detail.review?.approved_at && (
                    <p className="ac-muted ac-review-audit">
                      ✓ Approved ·{" "}
                      {new Date(detail.review.approved_at).toLocaleString(
                        "en-PH",
                      )}
                    </p>
                  )}
                  {detail.report.created_at && (
                    <p className="ac-muted ac-review-audit">
                      Report created ·{" "}
                      {new Date(detail.report.created_at).toLocaleString(
                        "en-PH",
                      )}
                    </p>
                  )}
                  {(detail.osas_comments ?? []).map((c) => (
                    <div key={c.id} className="ac-osas-review-comment">
                      <strong>{c.sender}</strong>{" "}
                      <small>
                        {new Date(c.created_at).toLocaleString("en-PH")}
                      </small>
                      <p>{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
      {projectView && selected && (
        <div
          className="ac-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setProjectView(null);
          }}
        >
          <div
            className="ac-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              projectView.mode === "view"
                ? "Tangible project report"
                : "Edit tangible project"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ac-modal-header">
              <strong>
                {projectView.mode === "view"
                  ? "Tangible Project Report"
                  : "Edit Tangible Project"}
              </strong>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setProjectView(null)}
              >
                ×
              </button>
            </div>
            {projectView.mode === "view" ? (
              <div className="ac-printable">
                <h2 className="ac-report-title">
                  {projectView.item.project_name}
                </h2>
                <dl className="ac-report-meta">
                  <div>
                    <dt>Impact</dt>
                    <dd>{nice(projectView.item.impact_level)}</dd>
                  </div>
                  <div>
                    <dt>Beneficiaries</dt>
                    <dd>{projectView.item.beneficiaries || "—"}</dd>
                  </div>
                  <div>
                    <dt>Estimated Cost</dt>
                    <dd>
                      {projectView.item.estimated_cost == null
                        ? "—"
                        : `₱${Number(projectView.item.estimated_cost).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </dd>
                  </div>
                </dl>
                {projectPhotos.length ? (
                  <div className="ac-photo-grid">
                    {projectPhotos.map((p) => (
                      <figure key={p.id}>
                        <img
                          alt={p.caption || "Project photo"}
                          src={`${base}/reports/${selected}/projects/${projectView.item.id}/photos/${p.id}`}
                        />
                        {p.caption && <figcaption>{p.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="ac-muted">No photos uploaded yet.</p>
                )}
                <p className="ac-narrative ac-view-description">
                  {projectView.item.description || "No description provided."}
                </p>
                <h3>Supporting Documents</h3>
                {projectDocuments.length ? (
                  <div className="ac-document-list">
                    {projectDocuments.map((d) => (
                      <a
                        key={d.id}
                        href={`${base}/reports/${selected}/projects/${projectView.item.id}/documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {d.file_name}
                      </a>
                    ))}
                  </div>
                ) : !projectLinks.length ? (
                  <p className="ac-muted">No supporting documents yet.</p>
                ) : null}
                <LinkedRows items={projectLinks} editable={false} />
              </div>
            ) : (
              <>
                <form
                  className="ac-form ac-popup-form"
                  onSubmit={(e) => void editProject(e)}
                >
                  <div className="ac-form-grid">
                    <label className="ac-wide">
                      Project Name *
                      <input
                        required
                        maxLength={250}
                        value={project.project_name}
                        onChange={(e) => proj("project_name", e.target.value)}
                      />
                    </label>
                    <label>
                      Impact Level
                      <select
                        value={project.impact_level}
                        onChange={(e) => proj("impact_level", e.target.value)}
                      >
                        <option value="">Not evaluated</option>
                        {impact.map((i) => (
                          <option key={i} value={i}>
                            {nice(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Estimated Cost (₱)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={project.estimated_cost}
                        onChange={(e) => proj("estimated_cost", e.target.value)}
                      />
                    </label>
                    <label className="ac-wide">
                      Beneficiaries
                      <textarea
                        rows={3}
                        value={project.beneficiaries}
                        onChange={(e) => proj("beneficiaries", e.target.value)}
                      />
                    </label>
                    <label className="ac-wide">
                      Description / Narrative
                      <textarea
                        rows={3}
                        value={project.description}
                        onChange={(e) => proj("description", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="ac-inline-add-row">
                    <AttachmentPicker
                      kind="photos"
                      disabled={photoBusy || busy}
                      onFiles={(files) => {
                        void uploadProjectFiles(files, "photos");
                      }}
                    />
                    <DocumentChoice
                      disabled={photoBusy || busy}
                      onUpload={(files) => {
                        void uploadProjectFiles(files, "documents");
                      }}
                      onReuse={() =>
                        void openLibrary("project", projectView.item.id)
                      }
                    />
                  </div>
                  <section className="ac-modal-photos ac-attachment-content">
                    <div className="ac-photo-grid">
                      {projectPhotos.map((p) => (
                        <figure key={p.id}>
                          <img
                            alt="Project"
                            src={`${base}/reports/${selected}/projects/${projectView.item.id}/photos/${p.id}`}
                          />
                          <button
                            type="button"
                            className="ac-remove-x"
                            aria-label="Remove project photo"
                            title="Remove photo"
                            disabled={photoBusy || busy}
                            onClick={() =>
                              void removeProjectFile("photos", p.id)
                            }
                          >
                            ×
                          </button>
                        </figure>
                      ))}
                    </div>
                  </section>
                  <section className="ac-modal-photos ac-attachment-content">
                    <div className="ac-document-list">
                      {projectDocuments.map((d) => (
                        <div key={d.id}>
                          <a
                            href={`${base}/reports/${selected}/projects/${projectView.item.id}/documents/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {d.file_name}
                          </a>
                          <button
                            type="button"
                            className="ac-remove-x ac-inline-x"
                            aria-label={`Remove ${d.file_name}`}
                            disabled={photoBusy || busy}
                            onClick={() =>
                              void removeProjectFile("documents", d.id)
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <LinkedRows
                    items={projectLinks}
                    editable={!locked}
                    onUnlink={(id) =>
                      void unlinkFile("project", projectView.item.id, id)
                    }
                  />
                  <div className="ac-actions ac-bottom-actions">
                    <button className="ac-primary" disabled={busy || photoBusy}>
                      {busy ? "Saving…" : "Save Changes"}
                    </button>
                    <button type="button" onClick={() => setProjectView(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
            <FeedbackNotification
              error={error}
              message={message}
              onDismiss={() => {
                setError("");
                setMessage("");
              }}
            />
            <div className="ac-modal-footer">
              {projectView.mode === "view" && !locked && (
                <button
                  className="ac-primary"
                  type="button"
                  onClick={() =>
                    setProjectView({ ...projectView, mode: "edit" })
                  }
                >
                  Edit Project
                </button>
              )}
              {projectView.mode === "view" && (
                <button
                  type="button"
                  className="ac-view"
                  onClick={() => setProjectView(null)}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {popup && selected && (
        <div
          className="ac-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPopup(null);
          }}
        >
          <div
            className="ac-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              popup.mode === "view" ? "Activity details" : "Edit activity"
            }
          >
            <div className="ac-modal-header">
              <strong>
                {popup.mode === "view" ? "Activity Report" : "Edit Activity"}
              </strong>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPopup(null)}
              >
                ×
              </button>
            </div>
            {popup.mode === "view" ? (
              <div className="ac-printable">
                <h2 className="ac-report-title">{popup.item.activity_name}</h2>
                <dl className="ac-report-meta">
                  <div>
                    <dt>Inclusive Dates</dt>
                    <dd>
                      {popup.item.start_date.slice(0, 10)} –{" "}
                      {popup.item.end_date.slice(0, 10)}
                    </dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{nice(popup.item.role)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{nice(popup.item.activity_type)}</dd>
                  </div>
                  <div>
                    <dt>Level</dt>
                    <dd>{nice(popup.item.activity_level)}</dd>
                  </div>
                  <div>
                    <dt>Participants</dt>
                    <dd>{popup.item.participants || "—"}</dd>
                  </div>
                  {popup.item.award_title && (
                    <div>
                      <dt>Award</dt>
                      <dd>
                        {popup.item.award_title} ·{" "}
                        {nice(popup.item.award_level)} ·{" "}
                        {popup.item.award_placement || "—"}
                      </dd>
                    </div>
                  )}
                </dl>
                {photos.length ? (
                  <div className="ac-photo-grid">
                    {photos.map((p) => (
                      <figure key={p.id}>
                        <img
                          src={`${base}/reports/${selected}/activities/${popup.item.id}/photos/${p.id}`}
                          alt={p.caption || `Activity photo`}
                        />
                        {p.caption && <figcaption>{p.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="ac-muted">No photos uploaded yet.</p>
                )}
                <p className="ac-narrative ac-view-description">
                  {popup.item.description || "No description provided."}
                </p>
                <h3>Supporting Documents</h3>
                {documents.length || activityLinks.length ? (
                  <div className="ac-document-list">
                    {documents.map((d) => (
                      <a
                        key={d.id}
                        href={`${base}/reports/${selected}/activities/${popup.item.id}/documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {d.file_name}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="ac-muted">
                    No supporting documents uploaded yet.
                  </p>
                )}
              </div>
            ) : (
              <form
                className="ac-form ac-popup-form"
                onSubmit={(e) => void editActivity(e)}
              >
                <div className="ac-form-grid ac-activity-layout">
                  <label className="ac-wide">
                    Activity Name *
                    <input
                      required
                      value={activity.activity_name}
                      onChange={(e) => select("activity_name", e.target.value)}
                    />
                  </label>
                  <label className="ac-activity-half">
                    Role *
                    <select
                      value={activity.role}
                      onChange={(e) => select("role", e.target.value)}
                    >
                      <option value="INITIATED">Initiated</option>
                      <option value="PARTICIPATED">Participated</option>
                    </select>
                  </label>
                  <label className="ac-activity-half">
                    Type
                    <select
                      value={activity.activity_type}
                      onChange={(e) => select("activity_type", e.target.value)}
                    >
                      <option value="">None</option>
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {nice(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ac-activity-third">
                    Level *
                    <select
                      value={activity.activity_level}
                      onChange={(e) => select("activity_level", e.target.value)}
                    >
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {nice(l)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="ac-activity-third">
                    Start Date *
                    <input
                      required
                      type="date"
                      value={activity.start_date}
                      onChange={(e) => select("start_date", e.target.value)}
                    />
                  </label>
                  <label className="ac-activity-third">
                    End Date *
                    <input
                      required
                      type="date"
                      min={activity.start_date || undefined}
                      value={activity.end_date}
                      onChange={(e) => select("end_date", e.target.value)}
                    />
                  </label>
                  <label className="ac-wide">
                    Description
                    <textarea
                      rows={3}
                      value={activity.description}
                      onChange={(e) => select("description", e.target.value)}
                    />
                  </label>
                </div>
                <div className="ac-inline-add-row">
                  <button
                    type="button"
                    className="ac-inline-detail-toggle"
                    aria-expanded={editDetailsOpen}
                    onClick={() => setEditDetailsOpen((open) => !open)}
                  >
                    <span aria-hidden="true">
                      {editDetailsOpen ? "−" : "+"}
                    </span>{" "}
                    Additional Details{" "}
                    <span className="ac-detail-optional">(optional)</span>
                  </button>
                  <AttachmentPicker
                    kind="photos"
                    disabled={photoBusy || busy}
                    onFiles={(files) => {
                      void uploadPhotos(files);
                    }}
                  />
                  <DocumentChoice
                    disabled={photoBusy || busy}
                    onUpload={(files) => {
                      void uploadDocuments(files);
                    }}
                    onReuse={() => void openLibrary("activity", popup.item.id)}
                  />
                </div>
                {editDetailsOpen && (
                  <div className="ac-optional-fields ac-form-grid">
                    <label>
                      Participants (names/groups)
                      <input
                        value={activity.participants}
                        onChange={(e) => select("participants", e.target.value)}
                        placeholder="Names or groups"
                      />
                    </label>
                    <label>
                      Award Title
                      <input
                        value={activity.award_title}
                        onChange={(e) => select("award_title", e.target.value)}
                      />
                    </label>
                    <label>
                      Award Level
                      <select
                        value={activity.award_level}
                        onChange={(e) => select("award_level", e.target.value)}
                      >
                        <option value="">None</option>
                        {AWARDS.map((a) => (
                          <option key={a}>{nice(a)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Award Placement
                      <input
                        value={activity.award_placement}
                        onChange={(e) =>
                          select("award_placement", e.target.value)
                        }
                      />
                    </label>
                  </div>
                )}
                <section className="ac-modal-photos ac-attachment-content">
                  <div className="ac-photo-grid">
                    {photos.map((p) => (
                      <figure key={p.id}>
                        <img
                          src={`${base}/reports/${selected}/activities/${popup.item.id}/photos/${p.id}`}
                          alt="Activity"
                        />
                        <button
                          type="button"
                          className="ac-remove-x"
                          title="Remove photo"
                          aria-label="Remove activity photo"
                          disabled={photoBusy}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/reports/${selected}/activities/${popup.item.id}/photos/${p.id}`,
                                "DELETE",
                              );
                              setPhotos(
                                await api<Attachment[]>(
                                  `/reports/${selected}/activities/${popup.item.id}/photos`,
                                ),
                              );
                            })
                          }
                        >
                          ×
                        </button>
                      </figure>
                    ))}
                  </div>
                </section>
                <section className="ac-modal-photos ac-attachment-content">
                  <div className="ac-document-list">
                    {documents.map((d) => (
                      <div key={d.id}>
                        <a
                          href={`${base}/reports/${selected}/activities/${popup.item.id}/documents/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {d.file_name}
                        </a>
                        <button
                          type="button"
                          className="ac-remove-x ac-inline-x"
                          aria-label={`Remove ${d.file_name}`}
                          disabled={photoBusy || busy}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/reports/${selected}/activities/${popup.item.id}/documents/${d.id}`,
                                "DELETE",
                              );
                              setDocuments(
                                await api<Attachment[]>(
                                  `/reports/${selected}/activities/${popup.item.id}/documents`,
                                ),
                              );
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <LinkedRows
                  items={activityLinks}
                  editable={!locked}
                  onUnlink={(id) =>
                    void unlinkFile("activity", popup.item.id, id)
                  }
                />
                <div className="ac-actions ac-bottom-actions">
                  <button className="ac-primary" disabled={busy || photoBusy}>
                    {busy ? "Saving…" : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => setPopup(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            <FeedbackNotification
              error={error}
              message={message}
              onDismiss={() => {
                setError("");
                setMessage("");
              }}
            />
            <div className="ac-modal-footer">
              {popup.mode === "view" && !locked && (
                <button
                  className="ac-primary"
                  type="button"
                  onClick={() => void showPopup(popup.item, "edit")}
                >
                  Edit Activity
                </button>
              )}
              {popup.mode === "view" && (
                <button
                  type="button"
                  className="ac-view"
                  onClick={() => setPopup(null)}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {picker && (
        <div
          className="ac-modal-overlay ac-library-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPicker(null);
          }}
        >
          <section
            className="ac-library-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Reuse documents"
          >
            <div className="ac-library-head">
              <div>
                <h3>Reuse Documents</h3>
                <p>
                  Choose files from Document Management ·{" "}
                  {detail?.report.academic_year}
                </p>
              </div>
              <button
                type="button"
                className="ac-view"
                onClick={() => setPicker(null)}
                aria-label="Close document picker"
              >
                ×
              </button>
            </div>
            <input
              className="ac-library-search"
              aria-label="Search existing documents"
              placeholder="Search by document or activity..."
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
            />
            <div className="ac-library-items">
              {library
                .filter((d) =>
                  `${d.file_name} ${d.activity_title} ${d.document_type} ${d.resolution_number || ""}`
                    .toLowerCase()
                    .includes(librarySearch.toLowerCase()),
                )
                .map((d) => {
                  const key = libraryKey(d);
                  const already =
                    (picker.kind === "activity"
                      ? activityLinks
                      : projectLinks
                    ).some((l) => libraryKey(l) === key) ||
                    (picker.kind === "activity"
                      ? pendingActivityLinks
                      : pendingProjectLinks
                    ).some((l) => libraryKey(l) === key);
                  return (
                    <label className="ac-library-row" key={key}>
                      <input
                        type="checkbox"
                        checked={chosenLibrary.includes(key) || already}
                        disabled={already}
                        onChange={(e) =>
                          setChosenLibrary((old) =>
                            e.target.checked
                              ? [...old, key]
                              : old.filter((x) => x !== key),
                          )
                        }
                      />
                      <span>
                        <strong>{d.file_name}</strong>
                        <small>
                          {d.source_kind === "activity"
                            ? `Resolution No. ${d.resolution_number} · ${d.activity_title}`
                            : `Repository · ${d.activity_title}`}{" "}
                          · {d.document_type.replaceAll("_", " ")}
                        </small>
                      </span>
                      {already && <small>Linked</small>}
                    </label>
                  );
                })}
              {!library.length && (
                <p className="ac-muted">
                  No Document Management files found for this academic year.
                </p>
              )}
            </div>
            <div className="ac-library-actions">
              <span>{chosenLibrary.length} selected</span>
              <button
                type="button"
                className="ac-view"
                onClick={() => setPicker(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ac-primary"
                disabled={busy || !chosenLibrary.length}
                onClick={() => void confirmLibrary()}
              >
                Link Selected
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
