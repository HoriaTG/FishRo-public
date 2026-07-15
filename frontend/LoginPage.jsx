import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AccountApprovalError,
  AccountBannedError,
  loginUser,
  saveToken,
} from "../api";

function parseBackendDate(value) {
  if (!value) return null;
  if (typeof value !== "string") return new Date(value);

  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

export default function LoginPage({ onLoggedIn, isModal = false, backgroundLocation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [hoveredBanAction, setHoveredBanAction] = useState("");
  const [isApprovalHovered, setIsApprovalHovered] = useState(false);
  const [banInfo, setBanInfo] = useState(null);
  const [approvalInfo, setApprovalInfo] = useState(null);
  const [now, setNow] = useState(Date.now());

  const navigate = useNavigate();
  const location = useLocation();
  const returnLocation = backgroundLocation || location.state?.backgroundLocation;

  function getReturnPath() {
    if (!returnLocation) return "/";

    return `${returnLocation.pathname || "/"}${returnLocation.search || ""}${
      returnLocation.hash || ""
    }`;
  }

  function closeLogin() {
    navigate(getReturnPath(), { replace: true });
  }

  useEffect(() => {
    if (!banInfo || banInfo.ban_permanent) return undefined;

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [banInfo]);

  const banRemaining = useMemo(() => {
    if (!banInfo?.ban_until || banInfo.ban_permanent) return "";

    const banUntil = parseBackendDate(banInfo.ban_until);
    const diff = Math.max(0, (banUntil?.getTime() || 0) - now);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }, [banInfo, now]);

  function closeBanModal() {
    setBanInfo(null);
  }

  function openBannedSupportPage() {
    if (!banInfo?.ban_token) return;
    navigate(`/banned-support?token=${encodeURIComponent(banInfo.ban_token)}`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data = await loginUser({ email, password });
      saveToken(data.access_token);
      setEmail("");
      setPassword("");

      if (onLoggedIn) {
        await onLoggedIn();
      }

      navigate(getReturnPath(), { replace: true });
    } catch (err) {
      if (err instanceof AccountBannedError) {
        setBanInfo(err.detail);
      } else if (err instanceof AccountApprovalError) {
        setApprovalInfo(err.detail);
      } else {
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOverlayClick(e) {
    if (isModal && e.target === e.currentTarget) {
      closeLogin();
    }
  }

  return (
    <div
      style={isModal ? styles.overlay : styles.page}
      onMouseDown={handleOverlayClick}
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? "true" : undefined}
      aria-labelledby="login-title"
    >
      <div style={styles.card}>
        {isModal && (
          <button
            type="button"
            style={{
              ...styles.closeBtn,
              ...(isCloseHovered ? styles.closeBtnHover : {}),
            }}
            onClick={closeLogin}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
            aria-label="Închide login"
          >
            <span style={isCloseHovered ? styles.closeIconHover : styles.closeIcon}>
              X
            </span>
          </button>
        )}

        <div style={styles.header}>
          <p style={styles.eyebrow}>Bine ai revenit</p>
          <h2 id="login-title" style={styles.title}>
            Intră în cont
          </h2>
          <p style={styles.subtitle}>
            Autentifică-te pentru comenzi, tichete și istoricul tău FishRo.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              placeholder="email@exemplu.ro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label style={styles.label}>
            Parola
            <input
              style={styles.input}
              placeholder="Parola"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button
            style={{
              ...styles.btn,
              ...(!isSubmitting && isLoginHovered ? styles.btnHover : {}),
            }}
            type="submit"
            disabled={isSubmitting}
            onMouseEnter={() => setIsLoginHovered(true)}
            onMouseLeave={() => setIsLoginHovered(false)}
          >
              {isSubmitting ? "Se conectează..." : "Login"}
          </button>

          {error && <p style={styles.err}>{error}</p>}
        </form>
      </div>

      {banInfo && (
        <div style={styles.banOverlay}>
          <div style={styles.banModal}>
            <button
              type="button"
              style={{
                ...styles.closeBtn,
                ...(hoveredBanAction === "close" ? styles.closeBtnHover : {}),
              }}
              onClick={closeBanModal}
              onMouseEnter={() => setHoveredBanAction("close")}
              onMouseLeave={() => setHoveredBanAction("")}
              aria-label="Închide alerta"
            >
              <span
                style={
                  hoveredBanAction === "close"
                    ? styles.closeIconHover
                    : styles.closeIcon
                }
              >
                X
              </span>
            </button>

            <h3 style={styles.banTitle}>
              {banInfo.ban_permanent
                ? "Contul dvs a fost suspendat"
                : "Contul dvs a fost suspendat temporar"}
            </h3>

            {!banInfo.ban_permanent && (
              <p style={styles.banTimer}>
                Durata: <strong>{banRemaining}</strong>
              </p>
            )}

            <p style={styles.banText}>
              Pentru a afla motivul, contactați echipa noastră de asistență.
            </p>

            <div style={styles.banActions}>
              <button
                type="button"
                style={{
                  ...styles.btn,
                  flex: 1,
                  ...(hoveredBanAction === "support" ? styles.btnHover : {}),
                }}
                onClick={openBannedSupportPage}
                onMouseEnter={() => setHoveredBanAction("support")}
                onMouseLeave={() => setHoveredBanAction("")}
              >
                {banInfo.support_ticket_id ? "Vezi status tichet" : "Deschide un tichet"}
              </button>
              <button
                type="button"
                style={{
                  ...styles.secondaryBtn,
                  ...(hoveredBanAction === "ok" ? styles.secondaryBtnHover : {}),
                }}
                onClick={closeBanModal}
                onMouseEnter={() => setHoveredBanAction("ok")}
                onMouseLeave={() => setHoveredBanAction("")}
              >
                <span aria-hidden="true" style={styles.secondaryBtnIcon}>×</span>
                Închide
              </button>
            </div>
          </div>
        </div>
      )}

      {approvalInfo && (
        <div style={styles.banOverlay}>
          <div
            style={{
              ...styles.banModal,
              borderColor:
                approvalInfo.code === "account_rejected"
                  ? "rgba(248,113,113,0.3)"
                  : "rgba(96,165,250,0.3)",
            }}
          >
            <h3 style={styles.banTitle}>
              {approvalInfo.code === "account_rejected"
                ? "Cererea contului a fost respinsă"
                : "Contul este în analiză"}
            </h3>
            <p style={styles.banText}>{approvalInfo.message}</p>
            <button
              type="button"
              style={{
                ...styles.btn,
                ...(isApprovalHovered ? styles.btnHover : {}),
              }}
              onClick={() => setApprovalInfo(null)}
              onMouseEnter={() => setIsApprovalHovered(true)}
              onMouseLeave={() => setIsApprovalHovered(false)}
            >
              Am înțeles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "calc(100vh - 68px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.22)",
    backdropFilter: "blur(2px)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.58)",
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
  },
  card: {
    position: "relative",
    width: "min(430px, 100%)",
    display: "grid",
    gap: 18,
    padding: "28px 26px",
    borderRadius: 16,
    border: "1px solid rgba(96,165,250,0.22)",
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.92), rgba(24,31,45,0.9))",
    color: "white",
    boxShadow:
      "0 22px 55px rgba(0,0,0,0.52), 0 0 28px rgba(59,130,246,0.16)",
    boxSizing: "border-box",
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
  header: {
    display: "grid",
    gap: 6,
    paddingRight: 28,
  },
  eyebrow: {
    margin: 0,
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.5,
  },
  form: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 7,
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    boxSizing: "border-box",
  },
  btn: {
    marginTop: 4,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.3)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  },
  btnHover: {
    transform: "translateY(-2px)",
    boxShadow:
      "0 0 22px rgba(59,130,246,0.34), 0 0 34px rgba(168,85,247,0.22)",
  },
  err: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "#fca5a5",
  },
  banOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10020,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.62)",
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
  },
  banModal: {
    position: "relative",
    width: "min(520px, 100%)",
    display: "grid",
    gap: 14,
    padding: "28px 26px",
    borderRadius: 16,
    border: "1px solid rgba(248,113,113,0.28)",
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(24,31,45,0.94))",
    color: "white",
    boxShadow:
      "0 22px 55px rgba(0,0,0,0.56), 0 0 28px rgba(239,68,68,0.14)",
  },
  banTitle: {
    margin: "0 34px 0 0",
    fontSize: 25,
    lineHeight: 1.15,
  },
  banTimer: {
    margin: 0,
    color: "#fecaca",
    fontWeight: 800,
  },
  banText: {
    margin: 0,
    color: "rgba(255,255,255,0.76)",
    lineHeight: 1.55,
  },
  banMessage: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.22)",
    background: "rgba(59,130,246,0.1)",
    color: "rgba(255,255,255,0.86)",
  },
  banActions: {
    display: "flex",
    alignItems: "stretch",
    gap: 10,
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 112,
    padding: "11px 15px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.24)",
    background: "rgba(239,68,68,0.07)",
    color: "#fecaca",
    fontWeight: 900,
    cursor: "pointer",
    outline: "none",
    transition:
      "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
  },
  secondaryBtnHover: {
    transform: "translateY(-1px)",
    borderColor: "rgba(248,113,113,0.48)",
    background: "rgba(239,68,68,0.14)",
    boxShadow: "0 0 18px rgba(239,68,68,0.13)",
  },
  secondaryBtnIcon: {
    fontSize: 21,
    lineHeight: 1,
  },
};
