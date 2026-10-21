import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/FeedbackNotification.css";
import FeedbackNotification from "../../components/FeedbackNotification";

type Organization = {
  username: string;
  organization_id: string;
  organization_name: string;
  college: string | null;
  description: string | null;
  current_academic_year: string;
  office_order_number: string | null;
  recognition_status: string | null;
};

type ApiResult = {
  error?: string;
  username?: string;
  description?: string;
};

export default function OrganizationProfilePage() {
  const navigate = useNavigate();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Clear feedback after a short delay; new actions reset the timer.
  useEffect(() => {
    if (!error && !message) return;
    const timer = window.setTimeout(() => {
      setError("");
      setMessage("");
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const [description, setDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernamePassword, setUsernamePassword] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const response = await fetch("/api/me", {
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load organization profile.");
        }

        const data: Organization = await response.json();

        if (!controller.signal.aborted) {
          setOrganization(data);
          setDescription(data.description ?? "");
          setNewUsername(data.username);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Loading failed.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [navigate]);

  async function saveDescription() {
    setSavingDescription(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/organization/description", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      const data: ApiResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save description.");
      }

      const saved = data.description ?? description.trim();

      setOrganization((previous) =>
        previous ? { ...previous, description: saved } : previous,
      );

      setDescription(saved);
      setEditingDescription(false);
      setMessage("Description updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save description.",
      );
    } finally {
      setSavingDescription(false);
    }
  }

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const username = newUsername.trim().toLowerCase();

    if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(username)) {
      setError(
        "Username must be 3–50 characters with lowercase letters, numbers, or hyphens.",
      );
      return;
    }

    if (username === organization?.username) {
      setError("This is already your current username.");
      return;
    }

    setSavingUsername(true);

    try {
      const response = await fetch("/api/organization/username", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          currentPassword: usernamePassword,
        }),
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      const data: ApiResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update username.");
      }

      const saved = data.username ?? username;

      setOrganization((previous) =>
        previous ? { ...previous, username: saved } : previous,
      );

      setNewUsername(saved);
      setUsernamePassword("");
      setEditingUsername(false);
      setMessage("Username updated successfully.");

      window.dispatchEvent(
        new CustomEvent("organization-username-updated", {
          detail: { username: saved },
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update username.",
      );
    } finally {
      setSavingUsername(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (
      newPassword.length < 12 ||
      new TextEncoder().encode(newPassword).length > 72
    ) {
      setError(
        "Password must have at least 12 characters and no more than 72 UTF-8 bytes.",
      );
      return;
    }

    setSavingPassword(true);

    try {
      const response = await fetch("/api/organization/change-password", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data: ApiResult = await response.json();

      if (
        response.status === 401 &&
        data.error !== "Current password is incorrect"
      ) {
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Unable to change password.");
      }

      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to change password.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <p>Loading organization profile...</p>;
  }

  if (!organization) {
    return <p role="alert">{error || "Organization not found."}</p>;
  }

  const normalizedStatus = (organization.recognition_status || "NOT RENEWED")
    .trim()
    .toUpperCase();
  const active =
    normalizedStatus === "ACTIVE" || normalizedStatus === "RENEWED";

  return (
    <div className="org-profile-page">
      <FeedbackNotification
        error={error}
        message={message}
        onDismiss={() => {
          setError("");
          setMessage("");
        }}
      />
      <h1>Organization Profile</h1>

      <div className="org-profile-card">
        {/* ORGANIZATION INFORMATION */}
        <section className="org-profile-section">
          <h3>Organization Information</h3>

          <div className="org-profile-detail">
            <strong>Organization Name</strong>
            <span>{organization.organization_name}</span>
          </div>

          <div className="org-profile-detail">
            <strong>College</strong>
            <span>{organization.college || "Not assigned"}</span>
          </div>

          <div className="org-profile-detail">
            <strong>Academic Year</strong>
            <span>
              {organization.current_academic_year?.replace("-", "–") ||
                "Not assigned"}
            </span>
          </div>

          <div className="org-profile-detail">
            <strong>Office Order Number</strong>
            <span>{organization.office_order_number || "Not assigned"}</span>
          </div>

          <div className="org-profile-detail">
            <strong>Status</strong>
            <span
              className={
                active
                  ? "recognition-badge active"
                  : "recognition-badge inactive"
              }
            >
              {active ? "RENEWED" : normalizedStatus}
            </span>
          </div>
        </section>

        {/* ORGANIZATION DESCRIPTION */}
        <section className="org-profile-section">
          <h3>Organization Description</h3>

          {editingDescription ? (
            <div className="org-description-editor">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={3000}
                disabled={savingDescription}
              />

              <div className="org-profile-actions">
                <button
                  type="button"
                  disabled={savingDescription}
                  onClick={() => void saveDescription()}
                >
                  {savingDescription ? "Saving..." : "Save Description"}
                </button>

                <button
                  type="button"
                  className="org-button-secondary"
                  disabled={savingDescription}
                  onClick={() => {
                    setDescription(organization.description ?? "");
                    setEditingDescription(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p>
                {organization.description ||
                  "No organization description available."}
              </p>

              <button type="button" onClick={() => setEditingDescription(true)}>
                Edit Description
              </button>
            </>
          )}
        </section>

        {/* ACCOUNT INFORMATION */}
        <section className="org-profile-section">
          <h3>Account Information</h3>

          <div className="org-profile-detail">
            <strong>Username</strong>
            <span>{organization.username}</span>
          </div>

          {!editingUsername ? (
            <button
              type="button"
              onClick={() => {
                setNewUsername(organization.username);
                setUsernamePassword("");
                setEditingUsername(true);
                setError("");
                setMessage("");
              }}
            >
              Edit Username
            </button>
          ) : (
            <form
              className="org-password-form"
              onSubmit={(event) => void saveUsername(event)}
            >
              <label htmlFor="profile-new-username">New Username</label>
              <input
                id="profile-new-username"
                type="text"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                minLength={3}
                maxLength={50}
                autoComplete="off"
                required
                disabled={savingUsername}
              />

              <label htmlFor="profile-username-password">
                Current Password
              </label>
              <input
                id="profile-username-password"
                type="password"
                value={usernamePassword}
                onChange={(event) => setUsernamePassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={savingUsername}
              />

              <div className="org-profile-actions">
                <button type="submit" disabled={savingUsername}>
                  {savingUsername ? "Saving..." : "Save Username"}
                </button>
                <button
                  type="button"
                  className="org-button-secondary"
                  disabled={savingUsername}
                  onClick={() => {
                    setEditingUsername(false);
                    setUsernamePassword("");
                    setNewUsername(organization.username);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 22 }}>
            {!changingPassword ? (
              <button
                type="button"
                onClick={() => {
                  setChangingPassword(true);
                  setError("");
                  setMessage("");
                }}
              >
                Change Password
              </button>
            ) : (
              <form
                className="org-password-form"
                onSubmit={(event) => void changePassword(event)}
              >
                <label htmlFor="profile-current-password">
                  Current Password
                </label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />

                <label htmlFor="profile-new-password">New Password</label>
                <input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />

                <label htmlFor="profile-confirm-password">
                  Confirm New Password
                </label>
                <input
                  id="profile-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />

                <div className="org-profile-actions">
                  <button type="submit" disabled={savingPassword}>
                    {savingPassword ? "Updating..." : "Update Password"}
                  </button>

                  <button
                    type="button"
                    className="org-button-secondary"
                    disabled={savingPassword}
                    onClick={() => {
                      setChangingPassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
