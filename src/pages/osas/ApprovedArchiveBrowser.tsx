import { useEffect, useMemo, useState } from "react";
import "../../styles/ApprovedArchiveBrowser.css";

export type ApprovedEntry = {
  id: string;
  organization_name: string;
  college: string;
  academic_year: string;
  reference_number: string;
  approved_at: string;
  organization_id?: string;
};
type Organization = { id: string; organization_name: string; college: string };
type Props = {
  records: ApprovedEntry[];
  onOpen: (id: string) => void;
  label: string;
  search?: string;
  college?: string;
  academicYear?: string;
};

export default function ApprovedArchiveBrowser({
  records,
  onOpen,
  label,
  search = "",
  college = "All Colleges",
  academicYear = "All Academic Years",
}: Props) {
  const [directory, setDirectory] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [organization, setOrganization] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/api/osas/organizations", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`Unable to load organizations (${response.status})`);
        const data = await response.json();
        if (!Array.isArray(data.organizations))
          throw new Error("Unexpected organization directory response");
        setDirectory(data.organizations);
        setError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load organizations",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  const organizations = useMemo(
    () =>
      directory
        .filter(
          (o) =>
            (college === "All Colleges" || o.college === college) &&
            (o.organization_name + " " + o.college)
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        )
        .sort((a, b) => a.organization_name.localeCompare(b.organization_name)),
    [directory, college, search],
  );
  const chosen = records.filter(
    (r) =>
      String(r.organization_id || "") === organization ||
      (!r.organization_id &&
        r.organization_name ===
          directory.find((o) => String(o.id) === organization)
            ?.organization_name),
  );
  const visibleRecords = chosen.filter(
    (r) =>
      academicYear === "All Academic Years" ||
      academicYear === "Current Academic Year" ||
      r.academic_year === academicYear,
  );
  const years = Array.from(new Set(visibleRecords.map((r) => r.academic_year)))
    .sort()
    .reverse();
  const org = directory.find((o) => String(o.id) === organization);
  return (
    <div className="approved-browser">
      {organization && (
        <button
          type="button"
          className="approved-browser-back"
          onClick={() => {
            if (year) setYear(null);
            else setOrganization(null);
          }}
          aria-label="Go back"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5m7 7-7-7 7-7" />
          </svg>
        </button>
      )}
      <h2>
        {!organization
          ? "Organizations"
          : !year
            ? org?.organization_name
            : `Academic Year ${year}`}
      </h2>
      <p className="approved-browser-help">
        {!organization
          ? `Select an organization to view its approved ${label}.`
          : !year
            ? "Select an academic year to view approved records."
            : `Approved ${label} for ${year}.`}
      </p>
      {error && (
        <p role="alert" className="approved-browser-error">
          {error}
        </p>
      )}
      {!organization
        ? organizations.map((o) => {
            const count = records.filter(
              (r) =>
                String(r.organization_id || "") === String(o.id) ||
                (!r.organization_id &&
                  r.organization_name === o.organization_name),
            ).length;
            return (
              <button
                type="button"
                className="approved-browser-row"
                key={o.id}
                onClick={() => {
                  setOrganization(String(o.id));
                  setYear(null);
                }}
              >
                <span className="approved-browser-org">
                  <span className="approved-browser-avatar">
                    <img
                      src={`/api/osas/organizations/${encodeURIComponent(o.id)}/photo`}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </span>
                  <span>
                    <strong>{o.organization_name}</strong>
                    <small>
                      {o.college} · {count} approved{" "}
                      {count === 1 ? "report" : "reports"}
                    </small>
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            );
          })
        : !year
          ? years.map((y) => (
              <button
                type="button"
                key={y}
                className="approved-browser-row"
                onClick={() => setYear(y)}
              >
                <span>
                  <strong>Academic Year {y}</strong>
                  <small>
                    {visibleRecords.filter((r) => r.academic_year === y).length}{" "}
                    approved record(s)
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))
          : visibleRecords
              .filter((r) => r.academic_year === year)
              .map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="approved-browser-row"
                  onClick={() => onOpen(r.id)}
                >
                  <span>
                    <strong>{r.reference_number || `Approved ${label}`}</strong>
                    <small>
                      Approved{" "}
                      {r.approved_at
                        ? new Date(r.approved_at).toLocaleDateString("en-PH")
                        : "—"}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
      {!loading && !error && !organization && !organizations.length && (
        <p className="approved-browser-empty">No matching organizations.</p>
      )}
      {loading && !organization && (
        <p className="approved-browser-empty">Loading organizations...</p>
      )}
      {organization && !year && !years.length && (
        <p className="approved-browser-empty">
          No approved {label} yet for this organization.
        </p>
      )}
    </div>
  );
}
