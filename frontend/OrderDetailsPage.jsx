import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOrderById } from "../api";

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
  switch (status) {
    case "trimisa":
      return "Trimisă";
    case "confirmata":
      return "Confirmată";
    case "in_tranzit":
      return "În tranzit";
    case "livrata":
      return "Livrată";
    case "anulata":
      return "Anulată";
    default:
      return status || "-";
  }
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
    default:
      return styles.statusDefault;
  }
}

export default function OrderDetailsPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");
        const data = await getOrderById(id);
        if (!cancelled) {
          setOrder(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Eroare la încărcarea comenzii.");
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.err}>{error}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.page}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Detalii comandă</h2>

        <div style={styles.metaGrid}>
          <div><strong>Număr comandă:</strong> {order.order_number}</div>
          <div><strong>Username:</strong> {order.user?.username || "-"}</div>
          <div><strong>Email:</strong> {order.user?.email || "-"}</div>
          <div>
            <strong>Data comandării:</strong> {formatOrderDate(order.created_at)}
          </div>
          <div><strong>Total:</strong> {order.total.toFixed(2)} lei</div>
          <div>
            <strong>Status:</strong>{" "}
            <span style={{ ...styles.statusBadge, ...getStatusStyle(order.status) }}>
              {getStatusLabel(order.status)}
            </span>
          </div>
        </div>

        <h3 style={{ marginTop: 24 }}>Produse comandate</h3>

        <div style={styles.itemsWrap}>
          {order.items.map((item) => (
            <div key={item.id} style={styles.itemRow}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {item.product_name}
                </div>
                <div style={{ opacity: 0.75 }}>
                  Cod: {item.product_code}
                </div>
                <div style={{ opacity: 0.85 }}>
                  Preț unitar: {item.unit_price.toFixed(2)} lei
                </div>
                <div style={{ opacity: 0.85 }}>
                  Cantitate: {item.quantity}
                </div>
              </div>

              <div style={styles.lineTotal}>
                {item.line_total.toFixed(2)} lei
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: 24,
  },
  card: {
    background: "#1e1e1e",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  },
  err: {
    color: "salmon",
  },
  metaGrid: {
    display: "grid",
    gap: 10,
    opacity: 0.95,
  },
  statusBadge: {
    display: "inline-block",
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
  itemsWrap: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: 14,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  lineTotal: {
    color: "#4ade80",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
};