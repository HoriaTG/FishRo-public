import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createTicket,
  getMyTickets,
  getTicketCreateAvailability,
} from "../api";
import "./MyTicketsPage.css";

const TICKET_LIST_REFRESH_MS = 5000;
const TICKETS_PER_PAGE = 3;

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

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, totalSeconds || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function MyTicketsPage({ me, onTicketsChanged, embedded = false }) {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [category, setCategory] = useState("alta");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [ticketAvailability, setTicketAvailability] = useState({
    can_create: true,
    remaining_seconds: 0,
    next_allowed_at: null,
  });
  const [hoveredTicketId, setHoveredTicketId] = useState(null);
  const [hoveredPagerControl, setHoveredPagerControl] = useState("");
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketPageJumpOpen, setTicketPageJumpOpen] = useState(false);
  const [ticketPageJumpValue, setTicketPageJumpValue] = useState("");
  const [ticketPageJumpIndex, setTicketPageJumpIndex] = useState(0);
  const ticketPageJumpRef = useRef(null);

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");
      const data = await getMyTickets();
      setTickets(data);
      await onTicketsChanged?.();
    } catch (e) {
      if (!silent) {
      setError(e.message || "Eroare la încărcarea tichetelor.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [onTicketsChanged]);

  const loadTicketAvailability = useCallback(async () => {
    try {
      const data = await getTicketCreateAvailability();
      setTicketAvailability({
        can_create: !!data.can_create,
        remaining_seconds: data.remaining_seconds || 0,
        next_allowed_at: data.next_allowed_at || null,
      });
    } catch {
      setTicketAvailability({
        can_create: true,
        remaining_seconds: 0,
        next_allowed_at: null,
      });
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    loadTickets();
    loadTicketAvailability();
  }, [me, loadTickets, loadTicketAvailability]);

  useEffect(() => {
    if (!me) return undefined;

    function refreshTicketsIfVisible() {
      if (document.hidden) return;
      loadTickets({ silent: true });
    }

    const intervalId = window.setInterval(refreshTicketsIfVisible, TICKET_LIST_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshTicketsIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshTicketsIfVisible);
    };
  }, [me, loadTickets]);

  useEffect(() => {
    if (ticketAvailability.can_create || ticketAvailability.remaining_seconds <= 0) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setTicketAvailability((prev) => {
        const nextRemaining = Math.max(0, (prev.remaining_seconds || 0) - 1);

        return {
          ...prev,
          remaining_seconds: nextRemaining,
          can_create: nextRemaining <= 0,
        };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [ticketAvailability.can_create, ticketAvailability.remaining_seconds]);

  useEffect(() => {
    if (ticketAvailability.can_create) return undefined;

    const intervalId = setInterval(() => {
      loadTicketAvailability();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [ticketAvailability.can_create, loadTicketAvailability]);

  const totalTicketPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE));
  const visibleTickets = useMemo(() => {
    const start = (ticketPage - 1) * TICKETS_PER_PAGE;
    return tickets.slice(start, start + TICKETS_PER_PAGE);
  }, [ticketPage, tickets]);

  useEffect(() => {
    setTicketPage((current) => Math.min(Math.max(1, current), totalTicketPages));
  }, [totalTicketPages]);

  useEffect(() => {
    if (!ticketPageJumpOpen) return undefined;

    function handlePointerDown(event) {
      if (ticketPageJumpRef.current?.contains(event.target)) return;
      setTicketPageJumpOpen(false);
      setTicketPageJumpValue("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [ticketPageJumpOpen]);

  function getTicketPageItems() {
    if (totalTicketPages <= 4) {
      return Array.from({ length: totalTicketPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalTicketPages, ticketPage]);

    if (ticketPage <= 2) {
      pages.add(2);
    } else if (ticketPage >= totalTicketPages - 1) {
      pages.add(totalTicketPages - 1);
    } else {
      pages.add(ticketPage - 1);
      pages.add(ticketPage + 1);
    }

    const sorted = Array.from(pages).sort((a, b) => a - b);
    const result = [];

    sorted.forEach((page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) {
        result.push(`ellipsis-${index}`);
      }
      result.push(page);
    });

    return result;
  }

  function goToTicketPage(page) {
    setTicketPage(Math.min(Math.max(1, page), totalTicketPages));
    setTicketPageJumpOpen(false);
    setTicketPageJumpValue("");
  }

  function submitTicketPageJump() {
    const trimmed = ticketPageJumpValue.trim();
    if (!/^-?\d+$/.test(trimmed)) return;

    goToTicketPage(Number(trimmed));
  }

  async function handleCreateTicket(event) {
    event.preventDefault();

    const trimmed = message.trim();
    if (!trimmed || !ticketAvailability.can_create) return;

    try {
      setCreating(true);
      setError("");
      await createTicket({ category, message: trimmed });
      setMessage("");
      setCategory("alta");

      await Promise.all([loadTickets(), loadTicketAvailability()]);
    } catch (e) {
      setError(e.message || "Nu am putut crea tichetul.");
      await loadTicketAvailability();
    } finally {
      setCreating(false);
    }
  }

  function getTicketCardStyle(ticket) {
    const isHovered = hoveredTicketId === ticket.id;

    if (ticket.has_unread) {
      return isHovered
        ? { ...styles.ticketRowUnread, ...styles.ticketRowHover }
        : styles.ticketRowUnread;
    }

    return isHovered
      ? { ...styles.ticketRow, ...styles.ticketRowHover }
      : styles.ticketRow;
  }

  if (!me) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Istoric tichete</h2>
          <p>Trebuie să fii autentificat.</p>
        </div>
      </div>
    );
  }

  const canCreateTicket = ticketAvailability.can_create;

  return (
    <div style={embedded ? styles.embeddedPage : styles.page}>
      <div style={styles.grid}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Deschide tichet</h2>

          {error && <p style={styles.err}>{error}</p>}

          {!canCreateTicket && (
            <div style={styles.cooldownBox}>
              Poți deschide un nou tichet peste{" "}
              <strong>{formatCountdown(ticketAvailability.remaining_seconds)}</strong>
            </div>
          )}

          <form onSubmit={handleCreateTicket} style={styles.form}>
            <label htmlFor="ticket-category" style={styles.label}>
              Categorie
            </label>
            <select
              id="ticket-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={styles.select}
              disabled={!canCreateTicket || creating}
            >
              <option value="alta" style={styles.option}>Altă problemă</option>
              <option value="comanda" style={styles.option}>Comandă</option>
              <option value="produs" style={styles.option}>Produs</option>
              <option value="plata" style={styles.option}>Plată</option>
              <option value="livrare" style={styles.option}>Livrare</option>
            </select>

            <label htmlFor="ticket-message" style={styles.label}>
              Mesaj
            </label>
            <textarea
              id="ticket-message"
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descrie neregula observată sau problema"
              style={styles.textarea}
              disabled={!canCreateTicket || creating}
            />

            {canCreateTicket && (
              <button
                type="submit"
                className="my-tickets-primary-btn"
                disabled={creating || !message.trim()}
              >
                {creating ? "Se trimite..." : "Deschide tichet"}
              </button>
            )}
          </form>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Istoric tichete</h2>

          {loading && <p>Loading...</p>}
          {!loading && tickets.length === 0 && (
            <p style={styles.muted}>Nu ai încă tichete.</p>
          )}

          <div style={styles.list}>
            {visibleTickets.map((ticket) => (
              <div
                key={ticket.id}
                style={getTicketCardStyle(ticket)}
                onMouseEnter={() => setHoveredTicketId(ticket.id)}
                onMouseLeave={() => setHoveredTicketId(null)}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
              >
                <div style={styles.ticketInfo}>
                  <div style={styles.ticketTopLine}>
                    <span style={styles.ticketNumber}>{ticket.ticket_number}</span>
                    {ticket.has_unread && <span style={styles.newBadge}>Mesaj nou</span>}
                  </div>

                  <div style={styles.ticketPrimary}>
                    {ticket.username}, {ticket.category}, {formatDate(ticket.created_at)}
                  </div>

                  <div style={styles.ticketSecondary}>
                    Ultimul mesaj: {formatDate(ticket.last_message_at)}
                  </div>
                </div>

                <div>
                  <span style={ticket.status === "closed" ? styles.closed : styles.open}>
                    {ticket.status === "closed" ? "Închis" : "Deschis"}
                  </span>
                </div>
              </div>
            ))}

            {Array.from({
              length: Math.max(0, TICKETS_PER_PAGE - visibleTickets.length),
            }).map((_, index) => (
              <div
                key={`ticket-placeholder-${index}`}
                style={{ ...styles.ticketRow, ...styles.ticketRowPlaceholder }}
                aria-hidden="true"
              >
                <div style={styles.ticketInfo}>
                  <div style={styles.ticketTopLine}>
                    <span style={styles.ticketNumber}>TCK-000000000000000000</span>
                  </div>

                  <div style={styles.ticketPrimary}>
                    user, produs, 1/1/2026, 12:00:00 AM
                  </div>

                  <div style={styles.ticketSecondary}>
                    Ultimul mesaj: 1/1/2026, 12:00:00 AM
                  </div>
                </div>

                <div>
                  <span style={styles.closed}>Închis</span>
                </div>
              </div>
            ))}
          </div>

          {!loading && tickets.length > TICKETS_PER_PAGE && (
            <div style={styles.pagination} aria-label="Paginare tichete">
              <button
                type="button"
                style={{
                  ...styles.paginationBtn,
                  ...(hoveredPagerControl === "prev" && ticketPage > 1
                    ? styles.paginationBtnHover
                    : {}),
                  ...(ticketPage <= 1 ? styles.paginationBtnDisabled : {}),
                }}
                onClick={() => goToTicketPage(ticketPage - 1)}
                onMouseEnter={() => setHoveredPagerControl("prev")}
                onMouseLeave={() => setHoveredPagerControl("")}
                disabled={ticketPage <= 1}
              >
                Pagina anterioară
              </button>

              <div
                ref={ticketPageJumpRef}
                style={{
                  ...styles.paginationPages,
                  ...(ticketPageJumpOpen ? styles.paginationPagesWithJump : {}),
                }}
              >
                {getTicketPageItems().map((item, index) =>
                  typeof item === "number" ? (
                    <button
                      key={item}
                      type="button"
                      style={{
                        ...styles.paginationNumber,
                        ...(item === ticketPage ? styles.paginationNumberActive : {}),
                      }}
                      onClick={() => goToTicketPage(item)}
                      aria-current={item === ticketPage ? "page" : undefined}
                    >
                      {item}
                    </button>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      style={styles.paginationNumber}
                      onClick={() => {
                        setTicketPageJumpOpen(true);
                        setTicketPageJumpValue("");
                        setTicketPageJumpIndex(index);
                      }}
                    >
                      ...
                    </button>
                  )
                )}
                {ticketPageJumpOpen && (
                  <div
                    style={{
                      ...styles.paginationJumpInline,
                      left: ticketPageJumpIndex * 44 + 19,
                    }}
                  >
                    <input
                      value={ticketPageJumpValue}
                      onChange={(event) => setTicketPageJumpValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitTicketPageJump();
                        }
                        if (event.key === "Escape") {
                          setTicketPageJumpOpen(false);
                          setTicketPageJumpValue("");
                        }
                      }}
                      style={styles.paginationJumpInput}
                      inputMode="numeric"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                style={{
                  ...styles.paginationBtn,
                  ...(hoveredPagerControl === "next" && ticketPage < totalTicketPages
                    ? styles.paginationBtnHover
                    : {}),
                  ...(ticketPage >= totalTicketPages ? styles.paginationBtnDisabled : {}),
                }}
                onClick={() => goToTicketPage(ticketPage + 1)}
                onMouseEnter={() => setHoveredPagerControl("next")}
                onMouseLeave={() => setHoveredPagerControl("")}
                disabled={ticketPage >= totalTicketPages}
              >
                Pagina următoare
              </button>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const controlBase = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  padding: 12,
  outline: "none",
};

const styles = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: 24,
  },
  embeddedPage: {
    maxWidth: "none",
    margin: 0,
    padding: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1.6fr",
    gap: 20,
    alignItems: "stretch",
  },
  card: {
    background: "#1e1e1e",
    borderRadius: 18,
    padding: 20,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    height: "100%",
    boxSizing: "border-box",
  },
  cooldownBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(245,158,11,0.28)",
    background: "rgba(245,158,11,0.12)",
    color: "#fde68a",
  },
  form: {
    display: "grid",
    gap: 12,
  },
  label: {
    fontWeight: 700,
  },
  select: {
    ...controlBase,
    appearance: "auto",
  },
  option: {
    color: "white",
    backgroundColor: "#232323",
  },
  textarea: {
    ...controlBase,
    resize: "vertical",
    minHeight: 170,
  },
  list: {
    display: "grid",
    gap: 12,
    marginTop: 18,
    alignContent: "start",
  },
  ticketRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    cursor: "pointer",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  ticketRowUnread: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.08)",
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(239,68,68,0.12) inset",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  ticketRowHover: {
    transform: "scale(1.02)",
    boxShadow:
      "0 10px 28px rgba(0,0,0,0.6), 0 0 20px rgba(120,190,255,0.28)",
  },
  ticketRowPlaceholder: {
    visibility: "hidden",
    pointerEvents: "none",
  },
  ticketInfo: {
    display: "grid",
    gap: 6,
  },
  ticketTopLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  ticketNumber: {
    fontWeight: 800,
    fontSize: 15,
  },
  newBadge: {
    background: "#ef4444",
    color: "white",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700,
  },
  ticketPrimary: {
    fontWeight: 700,
    opacity: 0.95,
  },
  ticketSecondary: {
    opacity: 0.74,
    fontSize: 14,
  },
  open: {
    color: "#4ade80",
    fontWeight: 700,
  },
  closed: {
    color: "#f87171",
    fontWeight: 700,
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 16,
    minHeight: 86,
  },
  paginationPages: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
    paddingBottom: 48,
  },
  paginationPagesWithJump: {
  },
  paginationBtn: {
    minHeight: 38,
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.22)",
    outline: "none",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.55))",
    color: "#f8fafc",
    cursor: "pointer",
    fontWeight: 800,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(59,130,246,0.08)",
    transition:
      "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
  },
  paginationBtnHover: {
    transform: "translateY(-1px)",
    borderColor: "rgba(96,165,250,0.48)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(124,58,237,0.14))",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)",
  },
  paginationBtnDisabled: {
    cursor: "not-allowed",
    opacity: 0.48,
  },
  paginationNumber: {
    width: 38,
    height: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.22)",
    outline: "none",
    background: "rgba(255,255,255,0.04)",
    color: "#f8fafc",
    cursor: "pointer",
    fontWeight: 900,
  },
  paginationNumberActive: {
    borderColor: "rgba(96,165,250,0.6)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    boxShadow:
      "0 0 14px rgba(59,130,246,0.24), 0 0 22px rgba(168,85,247,0.16)",
  },
  paginationJumpInline: {
    position: "absolute",
    top: 46,
    width: 110,
    display: "flex",
    justifyContent: "center",
    transform: "translateX(-50%)",
  },
  paginationJumpInput: {
    width: 110,
    minHeight: 38,
    boxSizing: "border-box",
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.28)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    outline: "none",
    textAlign: "center",
    fontWeight: 800,
  },
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.72,
  },
  sectionTitle: {
  marginTop: 0,
  marginBottom: 20,
  textAlign: "center",
},
};

