import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { closeTicket, getAllTickets, markTicketRead, reopenTicket } from "../api";

const TICKET_STATUS_FILTERS = [
  { value: "all", label: "Toate tichetele" },
  { value: "open", label: "Deschise" },
  { value: "closed", label: "\u00CEnchise" },
];

const TICKET_STATUS_FILTER_STORAGE_KEY = "fishro.dashboardTickets.statusFilter";
const TICKET_LIST_REFRESH_MS = 5000;
const TICKET_STATUS_FILTER_VALUES = new Set(
  TICKET_STATUS_FILTERS.map((item) => item.value)
);

function getInitialStatusFilter() {
  try {
    const saved = sessionStorage.getItem(TICKET_STATUS_FILTER_STORAGE_KEY);
    return TICKET_STATUS_FILTER_VALUES.has(saved) ? saved : "open";
  } catch {
    return "open";
  }
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

export default function DashboardTicketsPage({ me, onTicketsChanged }) {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closingId, setClosingId] = useState(null);
  const [hoveredTicketId, setHoveredTicketId] = useState(null);
  const [hoveredCloseTicketId, setHoveredCloseTicketId] = useState(null);
  const [hoveredReadTicketId, setHoveredReadTicketId] = useState(null);
  const [hoveredModalAction, setHoveredModalAction] = useState("");
  const [searchTicketNumber, setSearchTicketNumber] = useState("");
  const [statusFilter, setStatusFilter] = useState(getInitialStatusFilter);
  const [pendingTicketAction, setPendingTicketAction] = useState(null);

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");
      const data = await getAllTickets();
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

  useEffect(() => {
    if (!me) return;
    loadTickets();
  }, [me, loadTickets]);

  useEffect(() => {
    if (!me || (me.role !== "moderator" && me.role !== "admin")) return undefined;

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
    try {
      sessionStorage.setItem(TICKET_STATUS_FILTER_STORAGE_KEY, statusFilter);
    } catch {
      // Ignore storage failures; the filter still works for the current render.
    }
  }, [statusFilter]);

  function requestCloseTicket(ticket, event) {
    event.stopPropagation();
    if (ticket.status === "closed") return;
    setPendingTicketAction({ type: "close", ticket });
  }

  function requestReopenTicket(ticket, event) {
    event.stopPropagation();
    if (ticket.status !== "closed") return;
    setPendingTicketAction({ type: "reopen", ticket });
  }

  function requestMarkRead(ticket, event) {
    event.stopPropagation();
    setPendingTicketAction({ type: "read", ticket });
  }

  async function confirmTicketAction() {
    if (!pendingTicketAction) return;

    const { ticket, type } = pendingTicketAction;

    try {
      setClosingId(ticket.id);
      if (type === "read") {
        await markTicketRead(ticket.id);
      } else if (type === "reopen") {
        await reopenTicket(ticket.id);
      } else {
        await closeTicket(ticket.id);
      }
      setPendingTicketAction(null);
      await loadTickets();
    } catch (e) {
      setError(e.message || "Nu am putut actualiza tichetul.");
    } finally {
      setClosingId(null);
    }
  }

  const filteredTickets = useMemo(() => {
    const q = searchTicketNumber.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesSearch =
        !q || (ticket.ticket_number || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" || (ticket.status || "open") === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [tickets, searchTicketNumber, statusFilter]);

  const emptyTicketsMessage = useMemo(() => {
    if (statusFilter === "open") return "Nu există tichete deschise.";
    if (statusFilter === "closed") return "Nu există tichete închise.";
    return "Nu există tichete pentru acest filtru.";
  }, [statusFilter]);

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

  if (!me || (me.role !== "moderator" && me.role !== "admin")) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p>Nu ai acces la această pagină.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.filtersRow}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
            aria-label="Filtreaza dupa status"
          >
            {TICKET_STATUS_FILTERS.map((status) => (
              <option key={status.value} value={status.value} style={styles.option}>
                {status.label}
              </option>
            ))}
          </select>

          <div style={styles.searchBox}>
          <input
            type="text"
            placeholder="Caută după numărul tichetului..."
            value={searchTicketNumber}
            onChange={(e) => setSearchTicketNumber(e.target.value)}
            style={styles.searchInput}
          />

          <span style={styles.searchIcon} aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M21 21l-4.35-4.35m1.6-4.15a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          </div>
        </div>

        {loading && <p>Loading...</p>}
        {!loading && error && <p style={styles.err}>{error}</p>}
        {!loading && !error && filteredTickets.length === 0 && (
          <p style={styles.muted}>{emptyTicketsMessage}</p>
        )}

        <div style={styles.list}>
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              style={getTicketCardStyle(ticket)}
              onMouseEnter={() => setHoveredTicketId(ticket.id)}
              onMouseLeave={() => setHoveredTicketId(null)}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
            >
              <div style={styles.ticketInfo}>
                <div style={styles.ticketTopLine}>
                  <div style={styles.ticketPrimary}>
                    {ticket.username}, {ticket.category}, {formatDate(ticket.created_at)}
                  </div>
                  {ticket.has_unread && (
                    <span style={styles.newBadge}>
                      {ticket.unread_kind === "ticket" ? "Tichet nou" : "Mesaj nou"}
                    </span>
                  )}
                  <span style={ticket.status === "closed" ? styles.closed : styles.open}>
                    {ticket.status === "closed" ? "\u00CEnchis" : "Deschis"}
                  </span>
                </div>

                <div style={styles.ticketSecondary}>
                  {ticket.ticket_number} • Ultimul mesaj: {formatDate(ticket.last_message_at)}
                </div>

                <div style={styles.ticketAssigned}>
                  <strong>Responsabil:</strong>{" "}
                  {ticket.assigned_to_username || "Nealocat"}
                </div>
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  style={{
                    ...styles.markReadBtn,
                    ...(hoveredReadTicketId === ticket.id
                      ? styles.markReadBtnHover
                      : {}),
                  }}
                  onMouseEnter={() => setHoveredReadTicketId(ticket.id)}
                  onMouseLeave={() => setHoveredReadTicketId(null)}
                  onClick={(event) => requestMarkRead(ticket, event)}
                  disabled={closingId === ticket.id}
                >
                  Marchează ca citit
                </button>

                <button
                  type="button"
                  style={{
                    ...(ticket.status === "closed"
                      ? styles.reopenBtn
                      : styles.closeBtn),
                    ...(hoveredCloseTicketId === ticket.id
                      ? ticket.status === "closed"
                        ? styles.reopenBtnHover
                        : styles.closeBtnHover
                      : {}),
                  }}
                  onMouseEnter={() => setHoveredCloseTicketId(ticket.id)}
                  onMouseLeave={() => setHoveredCloseTicketId(null)}
                  onClick={(event) =>
                    ticket.status === "closed"
                      ? requestReopenTicket(ticket, event)
                      : requestCloseTicket(ticket, event)
                  }
                  disabled={closingId === ticket.id}
                >
                  {ticket.status === "closed"
                    ? closingId === ticket.id
                      ? "Se redeschide..."
                      : "Redeschide tichet"
                    : closingId === ticket.id
                    ? "Se închide..."
                    : "Închide"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pendingTicketAction && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>
              {pendingTicketAction.type === "read"
                ? "Confirmare marcare ca citit"
                : pendingTicketAction.type === "reopen"
                ? "Confirmare redeschidere tichet"
                : "Confirmare închidere tichet"}
            </h3>
            <p style={styles.modalText}>
              {pendingTicketAction.type === "read"
                ? "Sigur vrei să marchezi ca citit tichetul"
                : pendingTicketAction.type === "reopen"
                ? "Sigur vrei să redeschizi tichetul"
                : "Sigur vrei să închizi tichetul"}{" "}
              <strong>{pendingTicketAction.ticket.ticket_number}</strong>?
            </p>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={{
                  ...styles.modalSecondaryBtn,
                  ...(hoveredModalAction === "cancel"
                    ? styles.modalSecondaryBtnHover
                    : {}),
                }}
                onMouseEnter={() => setHoveredModalAction("cancel")}
                onMouseLeave={() => setHoveredModalAction("")}
                onClick={() => setPendingTicketAction(null)}
                disabled={closingId === pendingTicketAction.ticket.id}
              >
                Nu
              </button>
              <button
                type="button"
                style={{
                  ...(pendingTicketAction.type === "close"
                    ? styles.modalPrimaryBtn
                    : styles.modalBluePrimaryBtn),
                  ...(hoveredModalAction === "confirm"
                    ? pendingTicketAction.type === "close"
                      ? styles.modalPrimaryBtnHover
                      : styles.modalBluePrimaryBtnHover
                    : {}),
                }}
                onMouseEnter={() => setHoveredModalAction("confirm")}
                onMouseLeave={() => setHoveredModalAction("")}
                onClick={confirmTicketAction}
                disabled={closingId === pendingTicketAction.ticket.id}
              >
                {closingId === pendingTicketAction.ticket.id
                  ? pendingTicketAction.type === "read"
                    ? "Se marchează..."
                    : pendingTicketAction.type === "reopen"
                    ? "Se redeschide..."
                    : "Se închide..."
                  : "Da"}
              </button>
            </div>
          </div>
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
    border: "1px solid rgba(96,165,250,0.18)",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.35), 0 0 18px rgba(59,130,246,0.08)",
  },
  filtersRow: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: 12,
    alignItems: "center",
    marginBottom: 24,
  },
  filterSelect: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(124,58,237,0.14)), rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    appearance: "auto",
    fontWeight: 700,
  },
  searchBox: {
    position: "relative",
    width: "100%",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 42px 12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
  },
  searchIcon: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    opacity: 0.7,
    pointerEvents: "none",
    fontSize: 15,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  muted: {
    opacity: 0.72,
  },
  err: {
    color: "salmon",
  },
  list: {
    display: "grid",
    gap: 12,
    marginTop: 18,
  },
  ticketRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(124,58,237,0.06)), rgba(255,255,255,0.03)",
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.05) inset",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  ticketRowUnread: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(96,165,250,0.28)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(124,58,237,0.06)), rgba(239,68,68,0.08)",
    cursor: "pointer",
    boxShadow:
      "0 0 0 1px rgba(239,68,68,0.18) inset, 0 0 0 2px rgba(124,58,237,0.04) inset",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  ticketRowHover: {
    transform: "scale(1.02)",
    boxShadow:
      "0 10px 28px rgba(0,0,0,0.6), 0 0 20px rgba(120,190,255,0.28)",
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
  ticketPrimary: {
    fontWeight: 700,
  },
  ticketSecondary: {
    opacity: 0.74,
    fontSize: 14,
  },
  ticketAssigned: {
    fontSize: 14,
    opacity: 0.9,
  },
  newBadge: {
    background: "#ef4444",
    color: "white",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  open: {
    color: "#4ade80",
    fontWeight: 700,
  },
  closed: {
    color: "#f87171",
    fontWeight: 700,
  },
  markReadBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.35)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.22), rgba(124,58,237,0.22))",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    whiteSpace: "nowrap",
    transition:
      "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease, filter 0.2s ease",
  },
  markReadBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    borderColor: "rgba(96,165,250,0.6)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  closeBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.35)",
    background: "rgba(248,113,113,0.15)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    transition:
      "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
  },
  closeBtnHover: {
    transform: "translateY(-1px)",
    borderColor: "rgba(248,113,113,0.65)",
    background:
      "linear-gradient(135deg, rgba(220,38,38,0.92), rgba(153,27,27,0.9))",
    boxShadow: "0 12px 24px rgba(127,29,29,0.32)",
  },
  reopenBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.35)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.22), rgba(124,58,237,0.22))",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    transition:
      "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease, filter 0.2s ease",
  },
  reopenBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    borderColor: "rgba(96,165,250,0.6)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  disabledBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.65)",
    cursor: "not-allowed",
    fontWeight: 700,
  },
  option: {
    backgroundColor: "#232323",
    color: "white",
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
    width: "min(460px, 100%)",
    padding: 22,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#1e1e1e",
    color: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
  },
  modalTitle: {
    margin: "0 0 10px",
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
  modalSecondaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "rgba(59,130,246,0.08)",
    color: "white",
    outline: "none",
    fontWeight: 800,
    cursor: "pointer",
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  modalSecondaryBtnHover: {
    background: "rgba(59,130,246,0.14)",
    transform: "scale(1.03)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  modalPrimaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(220,38,38,0.9), rgba(153,27,27,0.88))",
    color: "white",
    outline: "none",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 0 18px rgba(248,113,113,0.18)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  modalPrimaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow: "0 0 18px rgba(248,113,113,0.24), 0 0 26px rgba(153,27,27,0.18)",
  },
  modalBluePrimaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    outline: "none",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  modalBluePrimaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
};
