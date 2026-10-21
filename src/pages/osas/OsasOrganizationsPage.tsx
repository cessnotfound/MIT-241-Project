import { useEffect, useMemo, useState } from "react";
import { osasGet, type OrgRecord } from "./osasTypes";

type DisplayMode = "tiles" | "list";
type OrgWithPhoto = OrgRecord & { has_profile_photo?: boolean };
type StructureMember = {
  id: string;
  full_name: string;
  position?: string;
  department?: string;
};
type OrgStructure = {
  academic_year?: string | null;
  officers: StructureMember[];
  advisers: StructureMember[];
};

function OrgAvatar({
  org,
  small = false,
  large = false,
}: {
  org: OrgWithPhoto;
  small?: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = large
    ? "osas-org-modal-avatar"
    : `osas-org-avatar${small ? " osas-org-avatar-small" : ""}`;
  return (
    <span className={className} aria-hidden="true">
      {org.has_profile_photo && !failed ? (
        <img
          className="osas-org-avatar-image"
          src={`/api/osas/organizations/${encodeURIComponent(org.id)}/photo`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        initials(org.organization_name)
      )}
    </span>
  );
}

function RenewalStatus({ status }: { status?: string | null }) {
  const renewed = (status || "").toUpperCase() === "RENEWED";
  return (
    <span
      className={`osas-org-renewal-status ${renewed ? "is-renewed" : "is-not-renewed"}`}
    >
      {renewed ? "RENEWED" : "NOT RENEWED"}
    </span>
  );
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
      : (words[0] || "ORG").slice(0, 2)
  ).toUpperCase();
}

export default function OsasOrganizationsPage() {
  const [rows, setRows] = useState<OrgWithPhoto[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("all");
  const [mode, setMode] = useState<DisplayMode>("list");
  const [selected, setSelected] = useState<OrgWithPhoto | null>(null);
  const [structure, setStructure] = useState<OrgStructure | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void osasGet<{ organizations: OrgWithPhoto[] }>(
      `/api/osas/organizations?fresh=${Date.now()}`,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setRows(result.organizations);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load organizations",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void osasGet<{ organizations: OrgWithPhoto[] }>(
        `/api/osas/organizations?fresh=${Date.now()}`,
      )
        .then((result) => {
          setRows(result.organizations);
          setSelected((current) =>
            current
              ? result.organizations.find((org) => org.id === current.id) ||
                null
              : null,
          );
        })
        .catch(() => {
          /* Preserve the last loaded directory if offline. */
        });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    // Each organization has its own, academic-year-scoped organizational structure.
    void osasGet<OrgStructure>(
      `/api/osas/organizations/${encodeURIComponent(selected.id)}/structure`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setStructure(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setStructureError(
            reason instanceof Error
              ? reason.message
              : "Unable to load organizational structure",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setStructureLoading(false);
      });
    return () => controller.abort();
  }, [selected]);

  function openProfile(org: OrgWithPhoto) {
    setStructure(null);
    setStructureError("");
    setStructureLoading(true);
    setSelected(org);
  }

  function returnToDirectory() {
    setSelected(null);
    setStructure(null);
    setStructureError("");
  }

  const colleges = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((org) => org.college?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort(),
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter((org) => {
        const matchesCollege =
          college === "all" || (org.college || "").trim() === college;
        const matchesSearch =
          `${org.organization_name} ${org.college || ""} ${org.username || ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());
        return matchesCollege && matchesSearch;
      }),
    [rows, college, search],
  );

  if (selected)
    return (
      <div className="osas-page osas-organizations-page">
        <button
          type="button"
          className="osas-org-return"
          onClick={returnToDirectory}
          aria-label="Return to Organizations"
          title="Return to Organizations"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <section className="osas-org-profile">
          <header className="osas-org-profile-header">
            <OrgAvatar org={selected} large />
            <div className="osas-org-profile-identity">
              <h1>{selected.organization_name}</h1>
              <p>@{selected.username || "Not assigned"}</p>
              <p>{selected.college || "College not assigned"}</p>
              <RenewalStatus status={selected.recognition_status} />
            </div>
          </header>
          <div className="osas-org-profile-content">
            <section className="osas-org-profile-section">
              <h2>Organization Information</h2>
              <dl className="osas-org-modal-details">
                <dt>Academic Year</dt>
                <dd>{selected.academic_year || "Not assigned"}</dd>
                <dt>Office Order Number</dt>
                <dd>{selected.office_order_number || "Not assigned"}</dd>
                <dt>Account Username</dt>
                <dd>{selected.username || "Not assigned"}</dd>
              </dl>
            </section>
            <section className="osas-org-profile-section">
              <h2>Description</h2>
              <p className="osas-org-modal-description">
                {selected.description || "No description provided."}
              </p>
            </section>
            <section className="osas-org-profile-section">
              <h2>
                Elected Officers{" "}
                <span className="osas-org-section-year">
                  Academic Year{" "}
                  {structure?.academic_year ||
                    selected.academic_year ||
                    "Not assigned"}
                </span>
              </h2>
              {structureLoading ? (
                <p className="osas-muted">Loading officers...</p>
              ) : structureError ? (
                <p role="alert" className="osas-error">
                  {structureError}
                </p>
              ) : structure?.officers.length ? (
                <div className="osas-org-people-list">
                  {structure.officers.map((person) => (
                    <div className="osas-org-person" key={person.id}>
                      <strong>{person.full_name}</strong>
                      <span>{person.position || "Position not assigned"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="osas-muted">
                  No elected officers recorded for this academic year yet.
                </p>
              )}
            </section>
            <section className="osas-org-profile-section">
              <h2>
                Advisers{" "}
                <span className="osas-org-section-year">
                  Academic Year{" "}
                  {structure?.academic_year ||
                    selected.academic_year ||
                    "Not assigned"}
                </span>
              </h2>
              {structureLoading ? (
                <p className="osas-muted">Loading advisers...</p>
              ) : structureError ? (
                <p role="alert" className="osas-error">
                  {structureError}
                </p>
              ) : structure?.advisers.length ? (
                <div className="osas-org-people-list">
                  {structure.advisers.map((person) => (
                    <div className="osas-org-person" key={person.id}>
                      <strong>{person.full_name}</strong>
                      <span>
                        {person.department || "Department not assigned"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="osas-muted">
                  No advisers recorded for this academic year yet.
                </p>
              )}
            </section>
          </div>
        </section>
      </div>
    );

  return (
    <div className="osas-page osas-organizations-page">
      <div className="osas-section-heading">
        <h1>Organizations</h1>
        <span className="osas-muted">{rows.length} registered</span>
      </div>
      {error && (
        <p role="alert" className="osas-error">
          {error}
        </p>
      )}

      <div className="osas-org-toolbar">
        <input
          className="osas-search osas-org-search"
          aria-label="Search organizations"
          placeholder="Search organizations or colleges..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="osas-org-college-label" htmlFor="osas-college-filter">
          College
          <select
            id="osas-college-filter"
            className="osas-org-select"
            value={college}
            onChange={(event) => setCollege(event.target.value)}
          >
            <option value="all">All Colleges</option>
            {colleges.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div
          className="osas-org-view-switch"
          role="group"
          aria-label="Organization display view"
        >
          <button
            type="button"
            className={mode === "tiles" ? "is-active" : ""}
            aria-pressed={mode === "tiles"}
            onClick={() => setMode("tiles")}
            title="Tile view"
          >
            ▦ <span>Tile View</span>
          </button>
          <button
            type="button"
            className={mode === "list" ? "is-active" : ""}
            aria-pressed={mode === "list"}
            onClick={() => setMode("list")}
            title="List view"
          >
            ☷ <span>List View</span>
          </button>
        </div>
      </div>

      {loading ? (
        <p className="osas-muted">Loading organizations...</p>
      ) : (
        <>
          <p className="osas-muted osas-org-result-count">
            Showing {filtered.length} of {rows.length} organizations
          </p>
          {mode === "tiles" ? (
            <div className="osas-org-tile-grid">
              {filtered.map((org) => (
                <button
                  type="button"
                  className="osas-org-tile"
                  key={org.id}
                  onClick={() => openProfile(org)}
                  aria-label={`View profile of ${org.organization_name}`}
                >
                  <span className="osas-org-tile-header">
                    <OrgAvatar org={org} />
                    <span className="osas-org-tile-identity">
                      <strong>{org.organization_name}</strong>
                      <small>@{org.username || "Not assigned"}</small>
                      <small>{org.college || "College not assigned"}</small>
                    </span>
                  </span>
                  <RenewalStatus status={org.recognition_status} />
                  <span className="osas-org-tile-description">
                    {org.description || "No description provided."}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="osas-org-list">
              {filtered.map((org) => (
                <button
                  type="button"
                  className="osas-org-list-row"
                  key={org.id}
                  onClick={() => openProfile(org)}
                  aria-label={`View profile of ${org.organization_name}`}
                >
                  <OrgAvatar org={org} small />
                  <span className="osas-org-list-text">
                    <strong>{org.organization_name}</strong>
                    <small>
                      @{org.username || "Not assigned"} ·{" "}
                      {org.college || "College not assigned"}
                    </small>
                  </span>
                  <RenewalStatus status={org.recognition_status} />
                  <span className="osas-org-list-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          )}
          {!filtered.length && (
            <p className="osas-org-empty">
              No organizations match your search or selected college.
            </p>
          )}
        </>
      )}
    </div>
  );
}
