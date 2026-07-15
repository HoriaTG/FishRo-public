import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllOrders, updateOrderStatus } from "../api";

const ORDER_STATUSES = [
  { value: "trimisa", label: "Trimisă" },
  { value: "confirmata", label: "Confirmată" },
  { value: "in_tranzit", label: "În tranzit" },
  { value: "livrata", label: "Livrată" },
  { value: "anulata", label: "Anulată" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Toate statusurile" },
  ...ORDER_STATUSES,
];

const FINAL_ORDER_STATUSES = new Set(["anulata", "livrata"]);

function formatOrderDate(value) {
  if (!value) return "Data indisponibilă";

  let normalized = value;

  if (
    typeof value === "string" &&
    !value.endsWith("Z") &&
    !/[+-]\d{2}:\d{2}$/.test(value)
  ) {
    normalized = `${value}Z`;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return "Data indisponibilă";
  }

  return date.toLocaleString();
}

function getStatusLabel(status) {
  return (
    ORDER_STATUSES.find((item) => item.value === status)?.label || status || "-"
  );
}

function getPaymentLabel(paymentMethod) {
  if (paymentMethod === "card") return "Card online";
  if (paymentMethod === "ramburs") return "Ramburs";
  return paymentMethod || "-";
}

function getStatusStyle(status) {
  switch (status) {
    case "trimisa":
      return styles.statusTrimisa;
    case "confirmata":
      return styles.statusConfirmata;
    case "in_tranzit":
      return styles.statusInTranzit;
    case "livrata":
      return styles.statusLivrata;
    case "anulata":
      return styles.statusAnulata;
    default:
      return styles.statusDefault;
  }
}

export default function OrdersHistoryPage({ me }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [searchOrderNumber, setSearchOrderNumber] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hoveredOrderId, setHoveredOrderId] = useState(null);
  const [hoveredModalAction, setHoveredModalAction] = useState("");
  const [savingStatusId, setSavingStatusId] = useState(null);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);

  const isStaff = !!me && (me.role === "moderator" || me.role === "admin");

  useEffect(() => {
    if (!isStaff) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setError("");
        const data = await getAllOrders();
        if (!cancelled) {
          setOrders(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Eroare la încărcarea comenzilor.");
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [isStaff, navigate]);

  const filteredOrders = useMemo(() => {
    const q = searchOrderNumber.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !q || (order.order_number || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" || (order.status || "trimisa") === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchOrderNumber, statusFilter]);

  function getCardStyle(orderId) {
    const isHovered = hoveredOrderId === orderId;

    if (isHovered) {
      return {
        ...styles.card,
        ...styles.cardHover,
      };
    }

    return styles.card;
  }

  function requestStatusChange(order, nextStatus) {
    if (!nextStatus || nextStatus === order.status) return;

    setPendingStatusChange({
      orderId: order.id,
      from: order.status,
      to: nextStatus,
    });
  }

  async function confirmStatusChange() {
    if (!pendingStatusChange) return;

    try {
      setSavingStatusId(pendingStatusChange.orderId);
      setError("");

      const updated = await updateOrderStatus(
        pendingStatusChange.orderId,
        pendingStatusChange.to
      );

      setOrders((prev) =>
        prev.map((order) =>
          order.id === pendingStatusChange.orderId ? updated : order
        )
      );
      setPendingStatusChange(null);
    } catch (e) {
      setError(e.message || "Nu am putut actualiza statusul comenzii.");
    } finally {
      setSavingStatusId(null);
    }
  }

  if (!isStaff) return null;

  return (
    <div style={styles.page}>
      <div style={styles.filtersRow}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.filterSelect}
          aria-label="Filtreaza dupa status"
        >
          {STATUS_FILTER_OPTIONS.map((status) => (
            <option key={status.value} value={status.value} style={styles.option}>
              {status.label}
            </option>
          ))}
        </select>

        <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Caută după numărul comenzii..."
          value={searchOrderNumber}
          onChange={(e) => setSearchOrderNumber(e.target.value)}
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

      {error && <p style={styles.err}>{error}</p>}
      {!error && filteredOrders.length === 0 && (
        <p style={styles.muted}>Nu există comenzi pentru acest filtru.</p>
      )}

      <div style={styles.list}>
        {filteredOrders.map((order) => {
          const isFinalStatus = FINAL_ORDER_STATUSES.has(order.status);
          const needsConfirmation = (order.status || "trimisa") === "trimisa";

          return (
            <div
              key={order.id}
              style={getCardStyle(order.id)}
              onMouseEnter={() => setHoveredOrderId(order.id)}
              onMouseLeave={() => setHoveredOrderId(null)}
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <div style={styles.topRow}>
                <div style={styles.orderTitleGroup}>
                  <strong>{order.order_number}</strong>
                  {needsConfirmation && (
                    <span style={styles.confirmationBadge}>
                      <span style={styles.confirmationDot} aria-hidden="true" />
                      {"Necesit\u0103 confirmare"}
                    </span>
                  )}
                </div>
                <span style={styles.total}>{order.total.toFixed(2)} lei</span>
              </div>

              <div style={styles.meta}>
                <div>
                  <strong>User:</strong> {order.user?.username || "-"}
                </div>
              <div>
                <strong>Email:</strong> {order.user?.email || "-"}
              </div>
              <div>
                <strong>Data:</strong> {formatOrderDate(order.created_at)}
              </div>
            </div>

            <div style={styles.contactGrid}>
              <div>
                <strong>Client:</strong> {`${order.first_name || ""} ${
                  order.last_name || ""
                }`.trim() || "-"}
              </div>
              <div>
                <strong>Email contact:</strong> {order.email || "-"}
              </div>
              <div>
                <strong>Telefon:</strong> {order.phone || "-"}
              </div>
              <div>
                <strong>Metodă plată:</strong> {getPaymentLabel(order.payment_method)}
              </div>
              <div style={styles.contactAddress}>
                <strong>Adresă:</strong> {order.address || "-"}
              </div>
            </div>

              <div style={styles.statusRow} onClick={(e) => e.stopPropagation()}>
                <span style={{ ...styles.statusBadge, ...getStatusStyle(order.status) }}>
                  {getStatusLabel(order.status)}
                </span>

                {isFinalStatus ? (
                  <span style={styles.finalStatusText}>Status final</span>
                ) : (
                  <select
                    value={order.status || "trimisa"}
                    onChange={(e) => requestStatusChange(order, e.target.value)}
                    style={styles.statusSelect}
                    disabled={savingStatusId === order.id}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status.value} value={status.value} style={styles.option}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={styles.itemsWrap}>
                {order.items.map((item) => (
                  <div key={item.id} style={styles.itemRow}>
                    <span>
                      {item.product_name} ({item.product_code}) × {item.quantity}
                    </span>
                    <strong>{item.line_total.toFixed(2)} lei</strong>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {pendingStatusChange && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <button
              type="button"
              style={{
                ...styles.closeBtn,
                ...(hoveredModalAction === "close" ? styles.closeBtnHover : {}),
              }}
              onClick={() => setPendingStatusChange(null)}
              onMouseEnter={() => setHoveredModalAction("close")}
              onMouseLeave={() => setHoveredModalAction("")}
              disabled={savingStatusId === pendingStatusChange.orderId}
              aria-label="Inchide confirmarea"
            >
              <span
                style={
                  hoveredModalAction === "close"
                    ? styles.closeIconHover
                    : styles.closeIcon
                }
              >
                X
              </span>
            </button>
            <h3 style={styles.modalTitle}>Confirmare schimbare status</h3>
            <p style={styles.modalText}>
              Sigur dorești să schimbi statusul comenzii din{" "}
              <strong>{getStatusLabel(pendingStatusChange.from)}</strong> în{" "}
              <strong>{getStatusLabel(pendingStatusChange.to)}</strong>?
            </p>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={{
                  ...styles.modalSecondaryBtn,
                  ...(hoveredModalAction === "cancel" &&
                  savingStatusId !== pendingStatusChange.orderId
                    ? styles.modalSecondaryBtnHover
                    : {}),
                  ...(savingStatusId === pendingStatusChange.orderId
                    ? styles.modalBtnDisabled
                    : {}),
                }}
                onClick={() => setPendingStatusChange(null)}
                onMouseEnter={() => setHoveredModalAction("cancel")}
                onMouseLeave={() => setHoveredModalAction("")}
                disabled={savingStatusId === pendingStatusChange.orderId}
              >
                Renunță
              </button>
              <button
                type="button"
                style={{
                  ...styles.modalPrimaryBtn,
                  ...(hoveredModalAction === "confirm" &&
                  savingStatusId !== pendingStatusChange.orderId
                    ? styles.modalPrimaryBtnHover
                    : {}),
                  ...(savingStatusId === pendingStatusChange.orderId
                    ? styles.modalBtnDisabled
                    : {}),
                }}
                onClick={confirmStatusChange}
                onMouseEnter={() => setHoveredModalAction("confirm")}
                onMouseLeave={() => setHoveredModalAction("")}
                disabled={savingStatusId === pendingStatusChange.orderId}
              >
                {savingStatusId === pendingStatusChange.orderId
                  ? "Se salvează..."
                  : "Confirmă"}
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
  filtersRow: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: 12,
    alignItems: "center",
    marginBottom: 34,
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
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.75,
  },
  list: {
    display: "grid",
    gap: 18,
  },
  card: {
    background: "#1e1e1e",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 16,
    cursor: "pointer",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  },
  cardHover: {
    transform: "scale(1.02)",
    boxShadow:
      "0 10px 28px rgba(0,0,0,0.6), 0 0 20px rgba(120,190,255,0.28)",
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  orderTitleGroup: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  },
  confirmationBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(248,113,113,0.38)",
    background:
      "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(245,158,11,0.14))",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 800,
    boxShadow: "0 0 18px rgba(239,68,68,0.18)",
    whiteSpace: "nowrap",
  },
  confirmationDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    boxShadow: "0 0 0 4px rgba(239,68,68,0.18)",
    flex: "0 0 auto",
  },
  total: {
    color: "#4ade80",
    fontWeight: 800,
  },
  meta: {
    display: "grid",
    gap: 6,
    marginBottom: 12,
    opacity: 0.9,
  },
  contactGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.88)",
  },
  contactAddress: {
    gridColumn: "1 / -1",
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  statusBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
  },
  statusTrimisa: {
    background: "rgba(59,130,246,0.18)",
    color: "#93c5fd",
    border: "1px solid rgba(59,130,246,0.28)",
  },
  statusConfirmata: {
    background: "rgba(168,85,247,0.18)",
    color: "#d8b4fe",
    border: "1px solid rgba(168,85,247,0.28)",
  },
  statusInTranzit: {
    background: "rgba(245,158,11,0.18)",
    color: "#fcd34d",
    border: "1px solid rgba(245,158,11,0.28)",
  },
  statusLivrata: {
    background: "rgba(34,197,94,0.18)",
    color: "#86efac",
    border: "1px solid rgba(34,197,94,0.28)",
  },
  statusAnulata: {
    background: "rgba(239,68,68,0.18)",
    color: "#fca5a5",
    border: "1px solid rgba(239,68,68,0.28)",
  },
  statusDefault: {
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  statusSelect: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#232323",
    color: "white",
    outline: "none",
    minWidth: 170,
    appearance: "auto",
  },
  finalStatusText: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: 700,
  },
  option: {
    backgroundColor: "#232323",
    color: "white",
  },
  itemsWrap: {
    display: "grid",
    gap: 8,
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    borderTop: "1px solid rgba(255,255,255,0.08)",
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
    width: "min(460px, 100%)",
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
  modalSecondaryBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.28)",
    background: "rgba(239,68,68,0.14)",
    color: "#fff1f2",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 0 14px rgba(239,68,68,0.1)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  modalSecondaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    borderColor: "rgba(248,113,113,0.52)",
    background: "rgba(239,68,68,0.22)",
    boxShadow: "0 0 18px rgba(239,68,68,0.2)",
  },
  modalPrimaryBtn: {
    padding: "12px 14px",
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
  modalPrimaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 20px rgba(59,130,246,0.26), 0 0 30px rgba(168,85,247,0.18)",
  },
  modalBtnDisabled: {
    opacity: 0.62,
    cursor: "not-allowed",
    boxShadow: "none",
    transform: "none",
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
};
