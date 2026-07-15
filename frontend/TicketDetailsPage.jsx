import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  assignTicket,
  getAssignableTicketUsers,
  getTicketById,
  sendTicketMessage,
} from "../api";

const TICKET_REFRESH_MS = 5000;

function parseChatDate(value) {
  if (!value) return null;

  const normalized =
    typeof value === "string" &&
    !value.endsWith("Z") &&
    !/[+-]\d{2}:\d{2}$/.test(value)
      ? `${value}Z`
      : value;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function getChatDayKey(value) {
  const date = parseChatDate(value);
  if (!date) return "unknown";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatChatDay(value) {
  const date = parseChatDate(value);
  if (!date) return "Data indisponibila";

  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatChatTime(value) {
  const date = parseChatDate(value);
  if (!date) return "";

  return date.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "Data indisponibilă";

  const normalized =
    typeof value === "string" &&
    !value.endsWith("Z") &&
    !/[+-]\d{2}:\d{2}$/.test(value)
      ? `${value}Z`
      : value;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Data indisponibilă";

  return date.toLocaleString();
}

function areMessagesDifferent(currentTicket, nextTicket) {
  if (!currentTicket && nextTicket) return true;
  if (!currentTicket || !nextTicket) return false;

  const currentMessages = currentTicket.messages || [];
  const nextMessages = nextTicket.messages || [];

  if (currentMessages.length !== nextMessages.length) return true;
  if (currentTicket.status !== nextTicket.status) return true;
  if (currentTicket.last_message_at !== nextTicket.last_message_at) return true;
  if (currentTicket.assigned_to_user_id !== nextTicket.assigned_to_user_id) return true;

  for (let i = 0; i < currentMessages.length; i += 1) {
    const a = currentMessages[i];
    const b = nextMessages[i];

    if (
      a.id !== b.id ||
      a.message !== b.message ||
      a.sender_username !== b.sender_username ||
      a.sender_profile_image_url !== b.sender_profile_image_url ||
      a.created_at !== b.created_at
    ) {
      return true;
    }
  }

  return false;
}

export default function TicketDetailsPage({ me, onTicketsChanged }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState("");
  const [savingResponsible, setSavingResponsible] = useState(false);
  const [isResponsibleDirty, setIsResponsibleDirty] = useState(false);
  const [hoveredAction, setHoveredAction] = useState("");

  const isMountedRef = useRef(true);
  const isResponsibleDirtyRef = useRef(false);
  const savingResponsibleRef = useRef(false);

  const isStaff = me && (me.role === "moderator" || me.role === "admin");
  const isClosed = ticket?.status === "closed";

  function renderAvatar(messageItem, isOwnMessage) {
    const imageUrl =
      messageItem.sender_profile_image_url ||
      (isOwnMessage ? me?.profile_image_url : "");
    const username = messageItem.sender_username || "?";
    const fallbackText = username.trim().slice(0, 1).toUpperCase() || "?";

    return (
      <div style={styles.messageAvatar} aria-hidden="true">
        {imageUrl ? (
          <img src={imageUrl} alt="" style={styles.messageAvatarImage} />
        ) : (
          <span style={styles.messageAvatarFallback}>{fallbackText}</span>
        )}
      </div>
    );
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    isResponsibleDirtyRef.current = isResponsibleDirty;
  }, [isResponsibleDirty]);

  useEffect(() => {
    savingResponsibleRef.current = savingResponsible;
  }, [savingResponsible]);

  async function loadTicket({ silent = false } = {}) {
    try {
      if (!silent && isMountedRef.current) {
        setLoading(true);
      }

      const data = await getTicketById(id);

      if (!isMountedRef.current) return;

      setTicket((prev) => {
        if (!prev) return data;
        return areMessagesDifferent(prev, data) ? data : prev;
      });

      if (!isResponsibleDirtyRef.current && !savingResponsibleRef.current) {
        setSelectedResponsibleId(
          data.assigned_to_user_id ? String(data.assigned_to_user_id) : ""
        );
      }

      await onTicketsChanged?.();
      if (isMountedRef.current) {
        setError("");
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e.message || "Eroare la încărcarea tichetului.");
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!id) return;
    loadTicket({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!isStaff) return;

    let cancelled = false;

    async function run() {
      try {
        const data = await getAssignableTicketUsers();
        if (!cancelled && isMountedRef.current) {
          setAssignableUsers(data);
        }
      } catch {
        if (!cancelled && isMountedRef.current) {
          setAssignableUsers([]);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  useEffect(() => {
    if (!id || isResponsibleDirty || savingResponsible) return undefined;

    function refreshTicketIfVisible() {
      if (document.hidden) return;
      loadTicket({ silent: true });
    }

    const intervalId = setInterval(refreshTicketIfVisible, TICKET_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshTicketIfVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshTicketIfVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isResponsibleDirty, savingResponsible]);

  async function handleSendMessage(event) {
    event.preventDefault();

    const trimmed = message.trim();
    if (!trimmed || !ticket || isClosed) return;

    try {
      setSending(true);
      setError("");
      await sendTicketMessage(ticket.id, { message: trimmed });
      setMessage("");
      await loadTicket({ silent: true });
    } catch (e) {
      setError(e.message || "Nu am putut trimite mesajul.");
    } finally {
      setSending(false);
    }
  }

  async function handleAssignResponsible() {
    if (!ticket || !isStaff || isClosed) return;

    try {
      setSavingResponsible(true);
      setError("");

      const assignedValue = selectedResponsibleId
        ? Number(selectedResponsibleId)
        : null;

      const updated = await assignTicket(ticket.id, assignedValue);

      if (!isMountedRef.current) return;

      setTicket(updated);
      setSelectedResponsibleId(
        updated.assigned_to_user_id ? String(updated.assigned_to_user_id) : ""
      );
      setIsResponsibleDirty(false);
    } catch (e) {
      if (isMountedRef.current) {
        setError(e.message || "Nu am putut actualiza responsabilul.");
      }
    } finally {
      if (isMountedRef.current) {
        setSavingResponsible(false);
      }
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Detalii tichet</h2>
          <p style={styles.err}>{error}</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Detalii tichet</h2>
          <p>Tichetul nu a fost găsit.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: "0 0 8px 0" }}>
              Numar tichet: {ticket.ticket_number}
            </h2>
            <div style={styles.meta}>
              <div>
                <strong>Deschis de:</strong> {ticket.username}
              </div>
              <div>
                <strong>Categorie:</strong> {ticket.category}
              </div>
              <div>
                <strong>Creat la:</strong> {formatDate(ticket.created_at)}
              </div>
              <div>
                <strong>Status:</strong>{" "}
                <span style={isClosed ? styles.closed : styles.open}>
                  {isClosed ? "Închis" : "Deschis"}
                </span>
              </div>

              {isStaff && (
                <div style={styles.responsibleWrap}>
                  <strong>Responsabil:</strong>

                  <div style={styles.responsibleControls}>
                    <select
                      value={selectedResponsibleId}
                      onChange={(e) => {
                        setSelectedResponsibleId(e.target.value);
                        setIsResponsibleDirty(true);
                      }}
                      style={styles.select}
                      disabled={savingResponsible || isClosed}
                    >
                      <option value="" style={styles.option}>
                        Nealocat
                      </option>
                      {assignableUsers.map((user) => (
                        <option key={user.id} value={user.id} style={styles.option}>
                          {user.username} ({user.role})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      style={{
                        ...styles.primaryActionBtn,
                        ...(hoveredAction === "assign" &&
                        !(savingResponsible || !isResponsibleDirty || isClosed)
                          ? styles.primaryActionBtnHover
                          : {}),
                        ...(savingResponsible || !isResponsibleDirty || isClosed
                          ? styles.primaryActionBtnDisabled
                          : {}),
                      }}
                      onMouseEnter={() => setHoveredAction("assign")}
                      onMouseLeave={() => setHoveredAction("")}
                      onClick={handleAssignResponsible}
                      disabled={savingResponsible || !isResponsibleDirty || isClosed}
                    >
                      {savingResponsible ? "Se salvează..." : "Salvează"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p style={styles.err}>{error}</p>}

        <div style={styles.messagesWrap}>
          {ticket.messages?.length ? (
            ticket.messages.map((item, index) => {
              const isOwnMessage = Number(item.sender_id) === Number(me?.id);
              const currentDayKey = getChatDayKey(item.created_at);
              const previousDayKey =
                index > 0
                  ? getChatDayKey(ticket.messages[index - 1]?.created_at)
                  : null;
              const shouldShowDay = index === 0 || currentDayKey !== previousDayKey;

              return (
                <div key={item.id} style={styles.messageGroup}>
                  {shouldShowDay && (
                    <div style={styles.chatDaySeparator}>
                      {formatChatDay(item.created_at)}
                    </div>
                  )}
                  <div
                    style={{
                      ...styles.messageRow,
                      ...(isOwnMessage ? styles.messageRowOwn : styles.messageRowOther),
                    }}
                  >
                    {!isOwnMessage && renderAvatar(item, isOwnMessage)}
                    <div
                      style={{
                        ...styles.messageBubble,
                        ...(isOwnMessage
                          ? styles.messageBubbleOwn
                          : styles.messageBubbleOther),
                      }}
                    >
                      <div
                        style={{
                          ...styles.messageTail,
                          ...(isOwnMessage
                            ? styles.messageTailOwn
                            : styles.messageTailOther),
                        }}
                      />
                      <div style={styles.messageMeta}>
                        <span>{item.sender_username}</span>
                      </div>
                      <div style={styles.messageText}>{item.message}</div>
                      <div style={styles.messageTime}>
                        {formatChatTime(item.created_at)}
                      </div>
                    </div>
                    {isOwnMessage && renderAvatar(item, isOwnMessage)}
                  </div>
                </div>
              );
            })
          ) : (
            <p style={styles.muted}>Nu există mesaje în acest tichet.</p>
          )}
        </div>

        {isClosed ? (
          <div style={styles.closedBox}>
            {isStaff
              ? "Tichetul este închis. Nu se mai pot trimite mesaje."
              : "Acest tichet a fost închis. Nu mai poți scrie în el."}
          </div>
        ) : (
          <form onSubmit={handleSendMessage} style={styles.form}>
            <label htmlFor="ticket-message" style={styles.label}>
              Mesaj nou
            </label>
            <textarea
              id="ticket-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Scrie aici mesajul tău..."
              rows={5}
              style={styles.textarea}
              disabled={sending}
            />
            <div style={styles.actions}>
              <button
                type="submit"
                style={{
                  ...styles.primaryActionBtn,
                  ...(hoveredAction === "send" && !sending && message.trim()
                    ? styles.primaryActionBtnHover
                    : {}),
                  ...(sending || !message.trim()
                    ? styles.primaryActionBtnDisabled
                    : {}),
                }}
                onMouseEnter={() => setHoveredAction("send")}
                onMouseLeave={() => setHoveredAction("")}
                disabled={sending || !message.trim()}
              >
                {sending ? "Se trimite..." : "Trimite"}
              </button>
            </div>
          </form>
        )}

        <div style={styles.backActions}>
          <button
            type="button"
            style={{
              ...styles.primaryActionBtn,
              ...(hoveredAction === "back" ? styles.primaryActionBtnHover : {}),
            }}
            onMouseEnter={() => setHoveredAction("back")}
            onMouseLeave={() => setHoveredAction("")}
            onClick={() =>
              navigate(isStaff ? "/dashboard/tickets" : "/account?section=tickets")
            }
          >
            Înapoi la cont
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 24,
  },
  card: {
    background:
      "linear-gradient(90deg, transparent, #3b82f6, #a855f7, transparent) top / 100% 2px no-repeat, #1e1e1e",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(96,165,250,0.18)",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.35), 0 0 18px rgba(59,130,246,0.08)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  meta: {
    display: "grid",
    gap: 8,
    opacity: 0.9,
  },
  responsibleWrap: {
    display: "grid",
    gap: 8,
    marginTop: 6,
  },
  responsibleControls: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#232323",
    color: "white",
    outline: "none",
    minWidth: 220,
    appearance: "auto",
  },
  option: {
    backgroundColor: "#232323",
    color: "white",
  },
  primaryActionBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    outline: "none",
    cursor: "pointer",
    fontWeight: 900,
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  primaryActionBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  primaryActionBtnDisabled: {
    cursor: "not-allowed",
    filter: "saturate(0.55) brightness(0.72)",
    boxShadow: "none",
    opacity: 0.74,
  },
  messagesWrap: {
    display: "grid",
    gap: 12,
    marginTop: 18,
    marginBottom: 22,
  },
  messageGroup: {
    display: "grid",
    gap: 12,
  },
  chatDaySeparator: {
    justifySelf: "center",
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(96,165,250,0.18)",
    background: "rgba(15,23,42,0.76)",
    color: "rgba(226,232,240,0.86)",
    fontSize: 13,
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
    width: "100%",
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  messageAvatar: {
    width: 38,
    height: 38,
    flex: "0 0 38px",
    borderRadius: "50%",
    overflow: "hidden",
    border: "1px solid rgba(96,165,250,0.34)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(124,58,237,0.18))",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 12px rgba(59,130,246,0.12)",
  },
  messageAvatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  messageAvatarFallback: {
    color: "#dbeafe",
    fontWeight: 900,
    fontSize: 15,
  },
  messageBubble: {
    position: "relative",
    maxWidth: "min(680px, 72%)",
    minWidth: 118,
    padding: "12px 14px 24px",
    borderRadius: 16,
    border: "1px solid rgba(96,165,250,0.22)",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.05) inset",
  },
  messageBubbleOwn: {
    background: "rgba(43,58,137,0.96)",
    borderTopRightRadius: 6,
  },
  messageBubbleOther: {
    background: "rgba(32,62,58,0.96)",
    borderTopLeftRadius: 6,
  },
  messageTail: {
    position: "absolute",
    bottom: 13,
    width: 0,
    height: 0,
    borderTop: "6px solid transparent",
    borderBottom: "6px solid transparent",
    zIndex: 0,
  },
  messageTailOwn: {
    right: -9,
    borderLeft: "10px solid rgba(43,58,137,0.96)",
  },
  messageTailOther: {
    left: -9,
    borderRight: "10px solid rgba(32,62,58,0.96)",
  },
  messageMeta: {
    display: "flex",
    fontWeight: 800,
    marginBottom: 8,
    opacity: 0.86,
    fontSize: 13,
  },
  messageText: {
    position: "relative",
    zIndex: 1,
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    paddingRight: 32,
  },
  messageTime: {
    position: "absolute",
    right: 12,
    bottom: 7,
    zIndex: 1,
    color: "rgba(226,232,240,0.66)",
    fontSize: 11,
    fontWeight: 800,
  },
  form: {
    display: "grid",
    gap: 10,
  },
  label: {
    fontWeight: 700,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    padding: 12,
    outline: "none",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  backActions: {
    display: "flex",
    justifyContent: "flex-start",
    marginTop: 16,
  },
  closedBox: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(248,113,113,0.25)",
    background: "rgba(248,113,113,0.12)",
    color: "white",
  },
  open: {
    color: "#4ade80",
    fontWeight: 700,
  },
  closed: {
    color: "#f87171",
    fontWeight: 700,
  },
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.72,
  },
};
