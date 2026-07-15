import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboardUsers,
  sendAllUsersNotification,
  sendUserNotification,
  updateUserBan,
  updateUserRole,
} from "../api";

const BAN_OPTIONS = [
  { value: "2m", label: "Ban 2 minute (test)" },
  { value: "1h", label: "Ban 1 oră" },
  { value: "12h", label: "Ban 12 ore" },
  { value: "24h", label: "Ban 24 de ore" },
  { value: "permanent", label: "Ban permanent" },
  { value: "none", label: "Scoate banul" },
];

const ROLE_LABELS = {
  admin: "Admin",
  moderator: "Moderator",
  user: "User",
};

const ROLE_ORDER = {
  admin: 0,
  moderator: 1,
  user: 2,
};

const PRESENCE_FILTER_OPTIONS = [
  { value: "all", label: "Toate starile" },
  { value: "online", label: "Activ" },
  { value: "idle", label: "Inactiv" },
  { value: "offline", label: "Offline" },
];

function parseBackendDate(value) {
  if (!value) return null;
  if (typeof value !== "string") return new Date(value);

  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

function formatRemaining(value, now) {
  const banUntil = parseBackendDate(value);
  const diff = Math.max(0, (banUntil?.getTime() || 0) - now);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function formatBan(user, now) {
  if (user.ban_permanent) return "Ban permanent";
  if (user.ban_until) {
    const banUntil = parseBackendDate(user.ban_until);
    return `Ban până la ${banUntil.toLocaleString()} · Timp rămas: ${formatRemaining(
      user.ban_until,
      now
    )}`;
  }
  return "Activ";
}

function getPresenceStatus(user) {
  if (user.presence_status) return user.presence_status;
  return user.is_online ? "online" : "offline";
}

function getPresenceLabel(status) {
  if (status === "online") return "online";
  if (status === "idle") return "inactiv";
  return "offline";
}

export default function DashboardUsersPage({ me }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [presenceFilter, setPresenceFilter] = useState("all");
  const [usernameQuery, setUsernameQuery] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);
  const [notificationTarget, setNotificationTarget] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationFeedback, setNotificationFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [notificationSending, setNotificationSending] = useState(false);
  const [hoveredAction, setHoveredAction] = useState("");
  const [hoveredModalClose, setHoveredModalClose] = useState(false);
  const [now, setNow] = useState(Date.now());

  const isStaff = me && (me.role === "admin" || me.role === "moderator");
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (!isStaff) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;

    async function run({ silent = false } = {}) {
      try {
        if (!silent) setLoading(true);
        setError("");
        const data = await getDashboardUsers();
        if (!cancelled) {
          setNow(Date.now());
          setUsers(data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Nu am putut încărca utilizatorii.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) run({ silent: true });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isStaff, navigate]);

  useEffect(() => {
    const hasTemporaryBans = users.some((user) => user.ban_until && !user.ban_permanent);
    if (!hasTemporaryBans) return undefined;

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [users]);

  const filteredUsers = useMemo(() => {
    const byName = usernameQuery.trim().toLowerCase();
    const byEmail = emailQuery.trim().toLowerCase();

    return users
      .filter((user) => {
        const matchesName = !byName || user.username.toLowerCase().includes(byName);
        const matchesEmail = !byEmail || user.email.toLowerCase().includes(byEmail);
        const matchesPresence =
          presenceFilter === "all" || getPresenceStatus(user) === presenceFilter;
        return matchesPresence && matchesName && matchesEmail;
      })
      .sort(
        (a, b) =>
          (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99) ||
          a.username.localeCompare(b.username)
      );
  }, [users, presenceFilter, usernameQuery, emailQuery]);

  function canBan(user) {
    if (user.role === "admin") return false;
    if (me.role === "moderator") return user.role === "user";
    return true;
  }

  function canChangeRole(user) {
    return isAdmin && user.role !== "admin";
  }

  function canSendNotification(user) {
    return isAdmin && user.role === "user";
  }

  function getConfirmText() {
    if (!pendingAction) return "";
    const { type, user, value } = pendingAction;

    if (type === "role") {
      return value === "moderator"
        ? `Sigur vrei să adaugi rolul de moderator pentru ${user.username}?`
        : `Sigur vrei să elimini rolul de moderator pentru ${user.username}?`;
    }

    const label = BAN_OPTIONS.find((item) => item.value === value)?.label || value;
    return value === "none"
      ? `Sigur vrei să scoți banul pentru ${user.username}?`
      : `Sigur vrei să aplici ${label.toLowerCase()} pentru ${user.username}?`;
  }

  function openNotificationModal(user) {
    setNotificationTarget(user);
    setNotificationMessage("");
    setNotificationFeedback("");
    setHoveredModalClose(false);
  }

  function openAllUsersNotificationModal() {
    setNotificationTarget({ id: "all", username: "toti utilizatorii", isAllUsers: true });
    setNotificationMessage("");
    setNotificationFeedback("");
    setHoveredModalClose(false);
  }

  function closeNotificationModal() {
    if (notificationSending) return;
    setNotificationTarget(null);
    setNotificationMessage("");
    setNotificationFeedback("");
    setHoveredModalClose(false);
  }

  async function submitUserNotification(event) {
    event.preventDefault();
    if (!notificationTarget) return;

    const cleanMessage = notificationMessage.trim();
    if (!cleanMessage) {
      setNotificationFeedback("Scrie un mesaj inainte de trimitere.");
      return;
    }

    try {
      setNotificationSending(true);
      setNotificationFeedback("");
      setError("");
      if (notificationTarget.isAllUsers) {
        const result = await sendAllUsersNotification(cleanMessage);
        setNotificationFeedback(
          `Notificarea a fost trimisa catre ${result.sent || 0} utilizatori.`
        );
      } else {
        await sendUserNotification(notificationTarget.id, cleanMessage);
        setNotificationFeedback("Notificarea a fost trimisa.");
      }
      setNotificationMessage("");
    } catch (err) {
      setNotificationFeedback(err.message || "Nu am putut trimite notificarea.");
    } finally {
      setNotificationSending(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;

    try {
      setSaving(true);
      setError("");

      const updated =
        pendingAction.type === "role"
          ? await updateUserRole(pendingAction.user.id, pendingAction.value)
          : await updateUserBan(pendingAction.user.id, {
              banType: pendingAction.value,
              reason: "Încălcarea regulilor / spam",
            });

      setNow(Date.now());
      setUsers((prev) =>
        prev.map((user) => (user.id === updated.id ? updated : user))
      );
      setPendingAction(null);
    } catch (err) {
      setError(err.message || "Nu am putut salva modificarea.");
    } finally {
      setSaving(false);
    }
  }

  if (!isStaff) return null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.filters}>
          <select
            value={presenceFilter}
            onChange={(event) => setPresenceFilter(event.target.value)}
            style={styles.filterSelect}
            aria-label="Filtreaza dupa stare"
          >
            {PRESENCE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} style={styles.option}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={usernameQuery}
            onChange={(event) => setUsernameQuery(event.target.value)}
            placeholder="Caută după username..."
            style={styles.input}
          />
          <input
            value={emailQuery}
            onChange={(event) => setEmailQuery(event.target.value)}
            placeholder="Caută după email..."
            style={styles.input}
          />
          {isAdmin && (
            <div style={styles.broadcastWrap}>
              <button
                type="button"
                style={{
                  ...styles.iconBtn,
                  ...(hoveredAction === "notify-all" ? styles.iconBtnHover : {}),
                }}
                onClick={openAllUsersNotificationModal}
                onMouseEnter={() => setHoveredAction("notify-all")}
                onMouseLeave={() => setHoveredAction("")}
                aria-label="Trimite notificare catre toti utilizatorii"
                title="Trimite notificare la toti"
              >
                <span style={styles.bellIcon}>{"\u{1F514}"}</span>
              </button>
              {hoveredAction === "notify-all" && (
                <span style={styles.broadcastTooltip}>Trimite notificare la toti</span>
              )}
            </div>
          )}
        </div>

        {loading && <p>Loading...</p>}
        {error && <p style={styles.err}>{error}</p>}
        {!loading && !error && filteredUsers.length === 0 && (
          <p style={styles.muted}>Nu există utilizatori pentru acest filtru.</p>
        )}

        <div style={styles.list}>
          {filteredUsers.map((user) => (
            <div key={user.id} style={styles.userRow}>
              <div style={styles.userInfo}>
                <div style={styles.userTitle}>
                  <strong>{user.username}</strong>
                  <span style={styles.roleBadge}>{ROLE_LABELS[user.role] || user.role}</span>
                  <span
                    style={{
                      ...styles.statusDot,
                      ...(getPresenceStatus(user) === "online"
                        ? styles.statusDotOnline
                        : getPresenceStatus(user) === "idle"
                          ? styles.statusDotIdle
                          : styles.statusDotOffline),
                    }}
                    title={getPresenceLabel(getPresenceStatus(user))}
                    aria-label={getPresenceLabel(getPresenceStatus(user))}
                  />
                </div>
                <span style={styles.email}>{user.email}</span>
                <span style={user.ban_permanent || user.ban_until ? styles.banned : styles.active}>
                  {formatBan(user, now)}
                </span>
              </div>

              <div style={styles.actions}>
                {canSendNotification(user) && (
                  <button
                    type="button"
                    style={{
                      ...styles.iconBtn,
                      ...(hoveredAction === `notify-${user.id}` ? styles.iconBtnHover : {}),
                    }}
                    onClick={() => openNotificationModal(user)}
                    onMouseEnter={() => setHoveredAction(`notify-${user.id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                    aria-label={`Trimite notificare catre ${user.username}`}
                    title="Trimite notificare"
                  >
                    <span style={styles.bellIcon}>{"\u{1F514}"}</span>
                  </button>
                )}

                {canBan(user) && (
                  <select
                    defaultValue=""
                    style={styles.select}
                    onChange={(event) => {
                      if (!event.target.value) return;
                      setPendingAction({
                        type: "ban",
                        user,
                        value: event.target.value,
                      });
                      event.target.value = "";
                    }}
                  >
                    <option value="" style={styles.option}>
                      Suspendare
                    </option>
                    {BAN_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value} style={styles.option}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                )}

                {canChangeRole(user) && (
                  <button
                    type="button"
                    style={{
                      ...styles.primaryBtn,
                      ...(hoveredAction === `role-${user.id}` ? styles.primaryBtnHover : {}),
                    }}
                    onClick={() =>
                      setPendingAction({
                        type: "role",
                        user,
                        value: user.role === "moderator" ? "user" : "moderator",
                      })
                    }
                    onMouseEnter={() => setHoveredAction(`role-${user.id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                  >
                    {user.role === "moderator"
                      ? "Scoate moderator"
                      : "Fă moderator"}
                  </button>
                )}

                {user.role !== "admin" && (
                  <button
                    type="button"
                    style={{
                      ...styles.iconBtn,
                      ...(hoveredAction === `logs-${user.id}` ? styles.iconBtnHover : {}),
                    }}
                    onClick={() => navigate(`/dashboard/users/${user.id}/logs`)}
                    onMouseEnter={() => setHoveredAction(`logs-${user.id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                    aria-label={`Vezi logurile pentru ${user.username}`}
                    title={`Log ${user.username}`}
                  >
                    <span style={styles.gearIcon}>{"\u2699"}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pendingAction && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <button
              type="button"
              style={{
                ...styles.closeBtn,
                ...(hoveredAction === "confirm-close" ? styles.closeBtnHover : {}),
              }}
              onClick={() => setPendingAction(null)}
              onMouseEnter={() => setHoveredAction("confirm-close")}
              onMouseLeave={() => setHoveredAction("")}
              disabled={saving}
              aria-label="Inchide confirmarea"
            >
              <span
                style={
                  hoveredAction === "confirm-close"
                    ? styles.closeIconHover
                    : styles.closeIcon
                }
              >
                X
              </span>
            </button>
            <h3 style={styles.modalTitle}>Confirmare</h3>
            <p style={styles.modalText}>{getConfirmText()}</p>
            <div style={styles.modalActions}>
              <button
                type="button"
                style={{
                  ...styles.secondaryBtn,
                  ...styles.dangerSecondaryBtn,
                  ...(hoveredAction === "confirm-no" && !saving
                    ? styles.dangerSecondaryBtnHover
                    : {}),
                  ...(saving ? styles.disabledBtn : {}),
                }}
                onClick={() => setPendingAction(null)}
                onMouseEnter={() => setHoveredAction("confirm-no")}
                onMouseLeave={() => setHoveredAction("")}
                disabled={saving}
              >
                Nu
              </button>
              <button
                type="button"
                style={{
                  ...styles.primaryBtn,
                  ...(hoveredAction === "confirm-yes" && !saving
                    ? styles.primaryBtnHover
                    : {}),
                  ...(saving ? styles.disabledBtn : {}),
                }}
                onClick={confirmAction}
                onMouseEnter={() => setHoveredAction("confirm-yes")}
                onMouseLeave={() => setHoveredAction("")}
                disabled={saving}
              >
                {saving ? "Se salvează..." : "Da"}
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationTarget && (
        <div style={styles.modalOverlay}>
          <form style={styles.modal} onSubmit={submitUserNotification}>
            <button
              type="button"
              style={{
                ...styles.closeBtn,
                ...(hoveredModalClose ? styles.closeBtnHover : {}),
              }}
              onClick={closeNotificationModal}
              onMouseEnter={() => setHoveredModalClose(true)}
              onMouseLeave={() => setHoveredModalClose(false)}
              disabled={notificationSending}
              aria-label="Inchide fereastra"
            >
              <span
                style={hoveredModalClose ? styles.closeIconHover : styles.closeIcon}
              >
                X
              </span>
            </button>

            <h3 style={styles.modalTitle}>
              {notificationTarget.isAllUsers
                ? "Trimite notificare catre toti utilizatorii"
                : `Trimite notificare catre ${notificationTarget.username}`}
            </h3>
            <textarea
              value={notificationMessage}
              onChange={(event) => setNotificationMessage(event.target.value)}
              placeholder={
                notificationTarget.isAllUsers
                  ? "Scrie mesajul pentru toti utilizatorii..."
                  : "Scrie mesajul notificarii..."
              }
              style={styles.textarea}
              maxLength={1000}
              disabled={notificationSending}
              autoFocus
            />
            <div style={styles.messageMeta}>
              <span>{notificationMessage.trim().length}/1000</span>
            </div>
            {notificationFeedback && (
              <p
                style={{
                  ...styles.feedback,
                  ...(notificationFeedback.includes("trimisa")
                    ? styles.feedbackSuccess
                    : styles.feedbackError),
                }}
              >
                {notificationFeedback}
              </p>
            )}
            <button
              type="submit"
              style={{
                ...styles.primaryBtn,
                ...styles.fullWidthBtn,
                ...(hoveredAction === "notification-submit" &&
                !notificationSending &&
                notificationMessage.trim()
                  ? styles.primaryBtnHover
                  : {}),
                ...(notificationSending || !notificationMessage.trim()
                  ? styles.disabledBtn
                  : {}),
              }}
              disabled={notificationSending || !notificationMessage.trim()}
              onMouseEnter={() => setHoveredAction("notification-submit")}
              onMouseLeave={() => setHoveredAction("")}
            >
              {notificationSending ? "Se trimite..." : "Trimite"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 24,
  },
  card: {
    background:
      "linear-gradient(90deg, transparent, #3b82f6, #a855f7, transparent) top / 100% 2px no-repeat, #1e1e1e",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "220px minmax(160px, 1fr) minmax(160px, 1fr) 58px",
    gap: 10,
    marginBottom: 20,
  },
  broadcastWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  broadcastTooltip: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    zIndex: 5,
    padding: "7px 9px",
    borderRadius: 6,
    border: "1px solid rgba(96,165,250,0.24)",
    background: "#241b35",
    color: "#e9d5ff",
    fontSize: 13,
    whiteSpace: "nowrap",
    boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
  },
  filterSelect: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(124,58,237,0.12)), rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    fontWeight: 800,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },
  userInfo: {
    display: "grid",
    gap: 6,
  },
  userTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  roleBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(96,165,250,0.25)",
    background: "rgba(59,130,246,0.12)",
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: 800,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    display: "inline-block",
    flex: "0 0 auto",
    boxShadow: "0 0 0 3px rgba(255,255,255,0.04)",
  },
  statusDotOnline: {
    background: "#22c55e",
    border: "1px solid rgba(187,247,208,0.72)",
    boxShadow: "0 0 0 3px rgba(34,197,94,0.12), 0 0 14px rgba(34,197,94,0.32)",
  },
  statusDotIdle: {
    background: "#facc15",
    border: "1px solid rgba(254,240,138,0.72)",
    boxShadow: "0 0 0 3px rgba(250,204,21,0.12), 0 0 14px rgba(250,204,21,0.3)",
  },
  statusDotOffline: {
    background: "#ef4444",
    border: "1px solid rgba(254,202,202,0.68)",
    boxShadow: "0 0 0 3px rgba(239,68,68,0.1), 0 0 12px rgba(239,68,68,0.24)",
  },
  email: {
    color: "rgba(255,255,255,0.72)",
  },
  active: {
    color: "#4ade80",
    fontWeight: 800,
  },
  banned: {
    color: "#f87171",
    fontWeight: 800,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(124,58,237,0.14)), rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    fontWeight: 800,
  },
  option: {
    backgroundColor: "#232323",
    color: "white",
  },
  primaryBtn: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.2), 0 0 26px rgba(168,85,247,0.12)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  primaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 20px rgba(59,130,246,0.26), 0 0 30px rgba(168,85,247,0.18)",
  },
  iconBtn: {
    width: 46,
    minWidth: 46,
    height: 44,
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 12,
    border: "1px solid rgba(96,165,250,0.22)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.55))",
    color: "#f8fafc",
    cursor: "pointer",
    boxSizing: "border-box",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(59,130,246,0.08)",
    transition:
      "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
  },
  iconBtnHover: {
    transform: "scale(1.02)",
    borderColor: "rgba(96,165,250,0.48)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)",
  },
  bellIcon: {
    fontSize: 19,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  gearIcon: {
    fontSize: 18,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtn: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerSecondaryBtn: {
    border: "1px solid rgba(248,113,113,0.28)",
    background: "rgba(239,68,68,0.14)",
    color: "#fff1f2",
    boxShadow: "0 0 14px rgba(239,68,68,0.1)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  dangerSecondaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    borderColor: "rgba(248,113,113,0.52)",
    background: "rgba(239,68,68,0.22)",
    boxShadow: "0 0 18px rgba(239,68,68,0.2)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(2px)",
  },
  modal: {
    position: "relative",
    width: "min(480px, 100%)",
    padding: 22,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#1e1e1e",
    color: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
  },
  modalTitle: {
    margin: "0 42px 10px 0",
  },
  modalText: {
    margin: "0 0 18px",
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.86)",
  },
  modalActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.42)",
    background: "linear-gradient(135deg, rgba(220,38,38,0.92), rgba(153,27,27,0.9))",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 15,
    lineHeight: 1,
    boxShadow: "0 0 16px rgba(239,68,68,0.24)",
    transition:
      "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  closeBtnHover: {
    borderColor: "rgba(248,113,113,0.68)",
    transform: "translateY(-1px)",
    boxShadow: "0 0 20px rgba(239,68,68,0.32)",
  },
  closeIcon: {
    display: "inline-block",
    transform: "scale(1)",
    transition: "transform 0.16s ease",
  },
  closeIconHover: {
    display: "inline-block",
    transform: "scale(1.12)",
    transition: "transform 0.16s ease",
  },
  textarea: {
    width: "100%",
    minHeight: 140,
    resize: "vertical",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    lineHeight: 1.5,
    marginBottom: 8,
  },
  messageMeta: {
    display: "flex",
    justifyContent: "flex-end",
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    marginBottom: 12,
  },
  feedback: {
    margin: "0 0 12px",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 800,
  },
  feedbackSuccess: {
    color: "#bbf7d0",
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.28)",
  },
  feedbackError: {
    color: "#fecaca",
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.28)",
  },
  fullWidthBtn: {
    width: "100%",
  },
  disabledBtn: {
    opacity: 0.62,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.72,
  },
};
