import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDashboardUsers, getUserLoginLogs } from "../api";

function parseBackendDate(value) {
  if (!value) return null;
  if (typeof value !== "string") return new Date(value);

  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

function formatDate(value) {
  const date = parseBackendDate(value);
  if (!date) return "-";
  return date.toLocaleDateString();
}

function formatTime(value) {
  const date = parseBackendDate(value);
  if (!date) return "-";
  return date.toLocaleTimeString();
}

export default function DashboardUserLogsPage({ me }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredBack, setHoveredBack] = useState(false);

  const isStaff = me && (me.role === "admin" || me.role === "moderator");
  const targetUser = useMemo(
    () => users.find((user) => Number(user.id) === Number(userId)),
    [users, userId]
  );
  const titleName = targetUser?.username || `user ${userId}`;

  useEffect(() => {
    if (!isStaff) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");
        const [usersData, logsData] = await Promise.all([
          getDashboardUsers(),
          getUserLoginLogs(userId),
        ]);
        if (!cancelled) {
          setUsers(usersData);
          setLogs(logsData);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Nu am putut incarca logurile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [isStaff, navigate, userId]);

  if (!isStaff) return null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Log {titleName}</h2>
            <p style={styles.subtitle}>Conectari salvate pentru acest utilizator.</p>
          </div>
          <button
            type="button"
            style={{
              ...styles.primaryBtn,
              ...(hoveredBack ? styles.primaryBtnHover : {}),
            }}
            onClick={() => navigate("/dashboard/users")}
            onMouseEnter={() => setHoveredBack(true)}
            onMouseLeave={() => setHoveredBack(false)}
          >
            Inapoi
          </button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p style={styles.err}>{error}</p>}
        {!loading && !error && logs.length === 0 && (
          <p style={styles.muted}>Nu exista loguri de conectare pentru acest user.</p>
        )}

        {!loading && !error && logs.length > 0 && (
          <div style={styles.table}>
            <div style={{ ...styles.row, ...styles.headRow }}>
              <span>IP conectare</span>
              <span>Data conectarii</span>
              <span>Ora conectarii</span>
            </div>
            {logs.map((log) => (
              <div key={log.id} style={styles.row}>
                <span style={styles.ip}>{log.ip_address}</span>
                <span>{formatDate(log.created_at)}</span>
                <span>{formatTime(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
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
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
  },
  subtitle: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.68)",
  },
  table: {
    display: "grid",
    gap: 10,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 1fr",
    gap: 12,
    alignItems: "center",
    padding: "13px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },
  headRow: {
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(124,58,237,0.12)), rgba(255,255,255,0.04)",
    color: "#bfdbfe",
    fontWeight: 900,
  },
  ip: {
    fontWeight: 900,
    overflowWrap: "anywhere",
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
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.72,
  },
};
