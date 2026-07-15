import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { registerUser } from "../api";

export default function RegisterPage({ isModal = false, backgroundLocation }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isRegisterHovered, setIsRegisterHovered] = useState(false);
  const [isApprovalHovered, setIsApprovalHovered] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const returnLocation = backgroundLocation || location.state?.backgroundLocation;

  function getReturnPath() {
    if (!returnLocation) return "/";

    return `${returnLocation.pathname || "/"}${returnLocation.search || ""}${
      returnLocation.hash || ""
    }`;
  }

  function closeRegister() {
    navigate(getReturnPath(), { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMsg("");
    setIsSubmitting(true);

    try {
      await registerUser({ username, email, password });
      setUsername("");
      setEmail("");
      setPassword("");
      setApprovalModalOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOverlayClick(e) {
    if (isModal && e.target === e.currentTarget) {
      closeRegister();
    }
  }

  return (
    <div
      style={isModal ? styles.overlay : styles.page}
      onMouseDown={handleOverlayClick}
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? "true" : undefined}
      aria-labelledby="register-title"
    >
      <div style={styles.card}>
        {isModal && (
          <button
            type="button"
            style={{
              ...styles.closeBtn,
              ...(isCloseHovered ? styles.closeBtnHover : {}),
            }}
            onClick={closeRegister}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
            aria-label="Închide register"
          >
            <span style={isCloseHovered ? styles.closeIconHover : styles.closeIcon}>
              X
            </span>
          </button>
        )}

        <div style={styles.header}>
          <h2 id="register-title" style={styles.title}>
            Creează cont
          </h2>
          <p style={styles.subtitle}>
            Înregistrează-te pentru comenzi rapide, tichete și istoricul tău FishRo.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Nume utilizator
            <input
              style={styles.input}
              placeholder="user_fishro"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

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
            Parolă
            <input
              style={styles.input}
              placeholder="Parolă"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          <button
            style={{
              ...styles.btn,
              ...(!isSubmitting && isRegisterHovered ? styles.btnHover : {}),
            }}
            type="submit"
            disabled={isSubmitting}
            onMouseEnter={() => setIsRegisterHovered(true)}
            onMouseLeave={() => setIsRegisterHovered(false)}
          >
            {isSubmitting ? "Se creează..." : "Register"}
          </button>

          {msg && <p style={styles.ok}>{msg}</p>}
          {error && <p style={styles.err}>{error}</p>}
        </form>
      </div>

      {approvalModalOpen && (
        <div style={styles.approvalOverlay} role="dialog" aria-modal="true">
          <div style={styles.approvalModal}>
            <div style={styles.approvalIcon}>✓</div>
            <h2 style={styles.approvalTitle}>Cererea a fost înregistrată</h2>
            <p style={styles.approvalText}>
              Contul tău urmează să fie analizat și aprobat de administrator. Vei putea
              să te autentifici după aprobare.
            </p>
            <button
              type="button"
              style={{
                ...styles.btn,
                ...(isApprovalHovered ? styles.btnHover : {}),
              }}
              onClick={() => {
                setApprovalModalOpen(false);
                navigate(getReturnPath(), { replace: true });
              }}
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
  ok: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(74,222,128,0.35)",
    background: "rgba(34,197,94,0.12)",
    color: "#86efac",
  },
  err: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "#fca5a5",
  },
  approvalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10020,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.64)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  approvalModal: {
    width: "min(500px, 100%)",
    display: "grid",
    justifyItems: "center",
    gap: 14,
    padding: "30px 28px",
    boxSizing: "border-box",
    border: "1px solid rgba(96,165,250,0.3)",
    borderRadius: 17,
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.97), rgba(24,31,45,0.95))",
    color: "white",
    textAlign: "center",
    boxShadow:
      "0 24px 60px rgba(0,0,0,0.58), 0 0 30px rgba(59,130,246,0.16)",
  },
  approvalIcon: {
    display: "grid",
    width: 52,
    height: 52,
    placeItems: "center",
    border: "1px solid rgba(96,165,250,0.42)",
    borderRadius: 999,
    background: "rgba(59,130,246,0.14)",
    color: "#93c5fd",
    fontSize: 24,
    fontWeight: 900,
  },
  approvalTitle: {
    margin: 0,
    fontSize: 25,
  },
  approvalText: {
    margin: 0,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 1.6,
  },
};
