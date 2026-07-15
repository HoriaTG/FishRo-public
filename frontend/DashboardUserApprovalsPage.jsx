import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPendingUserApprovals, updateUserApproval } from "../api";
import "./DashboardUserApprovalsPage.css";

export default function DashboardUserApprovalsPage({ me, onApprovalsChanged }) {
  const navigate = useNavigate();
  const isAdmin = me?.role === "admin";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      const data = await getPendingUserApprovals();
      setUsers(data);
    } catch (err) {
      setError(err.message || "Cererile nu au putut fi încărcate.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me && !isAdmin) {
      navigate("/", { replace: true });
      return;
    }
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers, me, navigate]);

  async function handleDecision(user, action) {
    if (processingId) return;
    setProcessingId(user.id);
    setError("");
    setMessage("");

    try {
      await updateUserApproval(user.id, action);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setMessage(
        action === "approve"
          ? `Contul lui ${user.username} a fost aprobat.`
          : `Contul lui ${user.username} a fost respins.`
      );
      await onApprovalsChanged?.();
    } catch (err) {
      setError(err.message || "Cererea nu a putut fi procesată.");
    } finally {
      setProcessingId(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <main className="user-approvals-page">
      <header className="user-approvals-header">
        <div>
          <p>ADMINISTRARE CONTURI</p>
          <h1>Aprobă utilizatori</h1>
          <span>Verifică solicitările noi înainte ca utilizatorii să se poată autentifica.</span>
        </div>
        <div className="user-approvals-count">
          <strong>{users.length}</strong>
          <span>{users.length === 1 ? "cerere" : "cereri"}</span>
        </div>
      </header>

      {message && <div className="user-approvals-feedback success">{message}</div>}
      {error && <div className="user-approvals-feedback error">{error}</div>}

      <section className="user-approvals-card">
        {loading && <p className="user-approvals-empty">Se încarcă solicitările...</p>}
        {!loading && users.length === 0 && (
          <p className="user-approvals-empty">Nu există conturi care așteaptă aprobare.</p>
        )}

        {!loading && users.length > 0 && (
          <div className="user-approvals-list">
            {users.map((user) => (
              <article key={user.id} className="user-approval-row">
                <div className="user-approval-avatar" aria-hidden="true">
                  {user.username?.slice(0, 1).toUpperCase()}
                </div>
                <div className="user-approval-identity">
                  <strong>{user.username}</strong>
                  <span>{user.email}</span>
                </div>
                <div className="user-approval-actions">
                  <button
                    type="button"
                    className="user-approval-btn reject"
                    onClick={() => handleDecision(user, "reject")}
                    disabled={processingId === user.id}
                    aria-label={`Respinge contul ${user.username}`}
                    title="Respinge contul"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    className="user-approval-btn approve"
                    onClick={() => handleDecision(user, "approve")}
                    disabled={processingId === user.id}
                    aria-label={`Aprobă contul ${user.username}`}
                    title="Aprobă contul"
                  >
                    ✓
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
