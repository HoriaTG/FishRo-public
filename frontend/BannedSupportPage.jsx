import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createBannedSupportTicket,
  getBannedSupportStatus,
  getBannedSupportTicket,
  sendBannedSupportMessage,
} from "../api";

const SUPPORT_TICKET_REFRESH_MS = 5000;

function formatDate(value) {
  if (!value) return "-";
  const normalized =
    typeof value === "string" && !/Z$|[+-]\d{2}:\d{2}$/.test(value)
      ? `${value}Z`
      : value;
  return new Date(normalized).toLocaleString();
}

export default function BannedSupportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const banToken = searchParams.get("token") || "";
  const [ticket, setTicket] = useState(null);
  const [canCreate, setCanCreate] = useState(true);
  const [nextAllowedAt, setNextAllowedAt] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isBackHovered, setIsBackHovered] = useState(false);
  const [hoveredPrimary, setHoveredPrimary] = useState("");
  const isClosed = ticket?.status === "closed";

  async function loadStatus() {
    if (!banToken) {
      setError("Link invalid.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      const data = await getBannedSupportStatus(banToken);
      setTicket(data.ticket || null);
      setCanCreate(Boolean(data.can_create));
      setNextAllowedAt(data.next_allowed_at || null);
    } catch (err) {
      setError(err.message || "Nu am putut încărca pagina de suport.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banToken]);

  useEffect(() => {
    if (!ticket?.id) return undefined;

    async function refreshTicketIfVisible() {
      if (document.hidden) return;

      try {
        const updated = await getBannedSupportTicket(ticket.id, banToken);
        setTicket(updated);
      } catch {
        // Pastreaza conversatia existenta daca refresh-ul silentios esueaza.
      }
    }

    const intervalId = window.setInterval(
      refreshTicketIfVisible,
      SUPPORT_TICKET_REFRESH_MS
    );
    document.addEventListener("visibilitychange", refreshTicketIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshTicketIfVisible);
    };
  }, [ticket?.id, banToken]);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    try {
      setSending(true);
      setError("");
      const created = await createBannedSupportTicket({
        banToken,
        message: trimmed,
      });
      setTicket(created);
      setMessage("");
    } catch (err) {
      setError(err.message || "Nu am putut deschide tichetul.");
    } finally {
      setSending(false);
    }
  }

  async function handleReply(event) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || !ticket || isClosed) return;

    try {
      setSending(true);
      setError("");
      const updated = await sendBannedSupportMessage(ticket.id, {
        banToken,
        message: trimmed,
      });
      setTicket(updated);
      setMessage("");
    } catch (err) {
      setError(err.message || "Nu am putut trimite mesajul.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Suport cont suspendat</h2>

        {loading && <p>Loading...</p>}
        {error && <p style={styles.err}>{error}</p>}

        {!loading && !ticket && (
          <form onSubmit={handleCreate} style={styles.form}>
            <label style={styles.label}>
              Mesaj
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                style={styles.textarea}
                disabled={!canCreate || sending}
                placeholder="Scrie mesajul tău către echipa de suport..."
              />
            </label>

            {!canCreate && nextAllowedAt && (
              <p style={styles.muted}>
                Poți deschide un nou tichet după {formatDate(nextAllowedAt)}.
              </p>
            )}

            <button
              type="submit"
              style={{
                ...styles.primaryBtn,
                ...(hoveredPrimary === "create" &&
                canCreate &&
                !sending &&
                message.trim()
                  ? styles.primaryBtnHover
                  : {}),
                ...(!canCreate || sending || !message.trim()
                  ? styles.disabledBtn
                  : {}),
              }}
              disabled={!canCreate || sending || !message.trim()}
              onMouseEnter={() => setHoveredPrimary("create")}
              onMouseLeave={() => setHoveredPrimary("")}
            >
              {sending ? "Se deschide..." : "Deschide tichet"}
            </button>
          </form>
        )}

        {ticket && (
          <div style={styles.ticketWrap}>
            <div style={styles.ticketHeader}>
              <strong>{ticket.ticket_number}</strong>
              <span style={isClosed ? styles.closed : styles.open}>
                {isClosed ? "Închis" : "Deschis"}
              </span>
            </div>

            <div style={styles.messages}>
              {ticket.messages.map((item) => (
                <div key={item.id} style={styles.messageRow}>
                  <div style={styles.messageMeta}>
                    {formatDate(item.created_at)}, {item.sender_username}:
                  </div>
                  <div style={styles.messageText}>{item.message}</div>
                </div>
              ))}
            </div>

            {isClosed ? (
              <div style={styles.closedBox}>
                Tichetul este închis. Nu se mai pot trimite mesaje.
              </div>
            ) : (
              <form onSubmit={handleReply} style={styles.form}>
                <label style={styles.label}>
                  Mesaj nou
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={5}
                    style={styles.textarea}
                    disabled={sending}
                    placeholder="Scrie răspunsul tău..."
                  />
                </label>

                <button
                  type="submit"
                  style={{
                    ...styles.primaryBtn,
                    ...(hoveredPrimary === "reply" && !sending && message.trim()
                      ? styles.primaryBtnHover
                      : {}),
                    ...(sending || !message.trim() ? styles.disabledBtn : {}),
                  }}
                  disabled={sending || !message.trim()}
                  onMouseEnter={() => setHoveredPrimary("reply")}
                  onMouseLeave={() => setHoveredPrimary("")}
                >
                  {sending ? "Se trimite..." : "Trimite"}
                </button>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          style={{
            ...styles.secondaryBtn,
            ...(isBackHovered ? styles.secondaryBtnHover : {}),
          }}
          onClick={() => navigate("/")}
          onMouseEnter={() => setIsBackHovered(true)}
          onMouseLeave={() => setIsBackHovered(false)}
        >
          Înapoi la site
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 980,
    margin: "0 auto",
    padding: 24,
  },
  card: {
    display: "grid",
    gap: 18,
    background: "#1e1e1e",
    borderRadius: 16,
    padding: 22,
    border: "1px solid rgba(96,165,250,0.18)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  },
  title: {
    margin: 0,
  },
  form: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 8,
    fontWeight: 800,
  },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
  },
  option: {
    backgroundColor: "#232323",
    color: "white",
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
  primaryBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  primaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  secondaryBtn: {
    justifySelf: "start",
    padding: "12px 18px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  secondaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  disabledBtn: {
    cursor: "not-allowed",
    filter: "saturate(0.55) brightness(0.72)",
    boxShadow: "none",
    opacity: 0.74,
  },
  ticketWrap: {
    display: "grid",
    gap: 14,
  },
  ticketHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  messages: {
    display: "grid",
    gap: 12,
  },
  messageRow: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },
  messageMeta: {
    fontWeight: 800,
    marginBottom: 8,
  },
  messageText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
  },
  open: {
    color: "#4ade80",
    fontWeight: 900,
  },
  closed: {
    color: "#f87171",
    fontWeight: 900,
  },
  closedBox: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(248,113,113,0.25)",
    background: "rgba(248,113,113,0.12)",
  },
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.72,
  },
};
