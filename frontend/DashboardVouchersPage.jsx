import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cancelVoucher, createVoucher, getVouchers } from "../api";

const USAGE_TYPES = [
  { value: "single_use", label: "Utilizare unica" },
  { value: "unlimited", label: "Utilizare nelimitata" },
];

const DISCOUNT_TYPES = [
  { value: "fixed", label: "Fix" },
  { value: "percent", label: "Procentual" },
];

const PERCENT_VALUES = [10, 20, 30, 40, 50];

function parseBackendDate(value) {
  if (!value) return null;
  if (typeof value !== "string") return new Date(value);
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

function formatDate(value) {
  const date = parseBackendDate(value);
  if (!date) return "-";
  return date.toLocaleString();
}

function formatAmount(value) {
  return `${Number(value || 0).toFixed(2)} lei`;
}

function formatVoucherValue(voucher) {
  if (voucher?.discount_type === "percent") {
    return `${Number(voucher.amount || 0).toFixed(0)}%`;
  }
  return formatAmount(voucher?.amount);
}

function getTodayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUsageLabel(value) {
  return USAGE_TYPES.find((item) => item.value === value)?.label || value || "-";
}

export default function DashboardVouchersPage({ me }) {
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState([]);
  const [discountType, setDiscountType] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [percentAmount, setPercentAmount] = useState("10");
  const [expiresOn, setExpiresOn] = useState(getTodayInputValue());
  const [usageType, setUsageType] = useState("single_use");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingCreate, setPendingCreate] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [hoveredAction, setHoveredAction] = useState("");
  const [hoveredCreate, setHoveredCreate] = useState(false);

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (!isAdmin) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");
        const data = await getVouchers();
        if (!cancelled) setVouchers(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Nu am putut incarca voucherele.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (!success) return undefined;
    const timeoutId = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [success]);

  const sortedVouchers = useMemo(() => vouchers, [vouchers]);

  function handleCreateVoucher(event) {
    event.preventDefault();

    const parsedAmount = discountType === "percent" ? Number(percentAmount) : Number(amount);
    const today = getTodayInputValue();

    if (!parsedAmount || parsedAmount <= 0) {
      setError("Introdu o valoare valida pentru voucher.");
      return;
    }

    if (discountType === "percent" && !PERCENT_VALUES.includes(parsedAmount)) {
      setError("Alege un procent valid pentru voucher.");
      return;
    }

    if (!expiresOn || expiresOn < today) {
      setError("Alege o data de expirare valida.");
      return;
    }

    setError("");
    setSuccess("");
    setPendingCreate({
      amount: parsedAmount,
      discountType,
      expiresOn,
      usageType,
    });
  }

  async function confirmCreateVoucher() {
    if (!pendingCreate) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const voucher = await createVoucher({
        amount: pendingCreate.amount,
        discountType: pendingCreate.discountType,
        expiresOn: pendingCreate.expiresOn,
        usageType: pendingCreate.usageType,
      });
      setVouchers((prev) => [voucher, ...prev]);
      setAmount("");
      setPercentAmount("10");
      setDiscountType("fixed");
      setExpiresOn(getTodayInputValue());
      setUsageType("single_use");
      setPendingCreate(null);
      setSuccess(`Voucherul ${voucher.code} a fost generat.`);
    } catch (err) {
      setError(err.message || "Nu am putut genera voucherul.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancelVoucher() {
    if (!pendingCancel) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const updated = await cancelVoucher(pendingCancel.id);
      setVouchers((prev) =>
        prev.map((voucher) => (voucher.id === updated.id ? updated : voucher))
      );
      setPendingCancel(null);
      setSuccess(`Voucherul ${updated.code} a fost anulat.`);
    } catch (err) {
      setError(err.message || "Nu am putut anula voucherul.");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Vouchere</h2>
            <p style={styles.subtitle}>Genereaza si urmareste voucherele emise.</p>
          </div>
          <button
            type="button"
            style={{
              ...styles.secondaryBackBtn,
              ...(hoveredAction === "back" ? styles.secondaryBackBtnHover : {}),
            }}
            onClick={() => navigate("/")}
            onMouseEnter={() => setHoveredAction("back")}
            onMouseLeave={() => setHoveredAction("")}
          >
            Intoarce-te inapoi
          </button>
        </div>

        <form style={styles.form} onSubmit={handleCreateVoucher}>
          <label style={styles.label}>
            Tip reducere
            <select
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value)}
              style={styles.select}
              disabled={saving}
            >
              {DISCOUNT_TYPES.map((item) => (
                <option key={item.value} value={item.value} style={styles.option}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Valoare
            {discountType === "percent" ? (
              <select
                value={percentAmount}
                onChange={(event) => setPercentAmount(event.target.value)}
                style={styles.select}
                disabled={saving}
              >
                {PERCENT_VALUES.map((value) => (
                  <option key={value} value={value} style={styles.option}>
                    {value}%
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                min="1"
                step="0.01"
                placeholder="Ex: 50"
                style={styles.input}
                disabled={saving}
              />
            )}
          </label>

          <label style={styles.label}>
            Data expirarii
            <input
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
              type="date"
              min={getTodayInputValue()}
              style={styles.input}
              disabled={saving}
            />
          </label>

          <label style={styles.label}>
            Tip voucher
            <select
              value={usageType}
              onChange={(event) => setUsageType(event.target.value)}
              style={styles.select}
              disabled={saving}
            >
              {USAGE_TYPES.map((item) => (
                <option key={item.value} value={item.value} style={styles.option}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            style={{
              ...styles.primaryBtn,
              ...(hoveredCreate && !saving ? styles.primaryBtnHover : {}),
              ...(saving ? styles.disabledBtn : {}),
            }}
            disabled={saving}
            onMouseEnter={() => setHoveredCreate(true)}
            onMouseLeave={() => setHoveredCreate(false)}
          >
            {saving ? "Se genereaza..." : "Genereaza voucher"}
          </button>
        </form>

        {error && <p style={styles.err}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}

        <div style={styles.historyHeader}>
          <h3 style={styles.sectionTitle}>Istoric vouchere</h3>
          <span style={styles.countBadge}>{sortedVouchers.length}</span>
        </div>

        {loading && <p>Loading...</p>}
        {!loading && !error && sortedVouchers.length === 0 && (
          <p style={styles.muted}>Nu exista vouchere emise momentan.</p>
        )}

        {!loading && sortedVouchers.length > 0 && (
          <div style={styles.list}>
            {sortedVouchers.map((voucher) => {
              const isUnlimited = voucher.usage_type === "unlimited";
              return (
                <div
                  key={voucher.id}
                  style={{
                    ...styles.voucherRow,
                    ...(voucher.is_valid ? styles.voucherValid : styles.voucherInvalid),
                  }}
                >
                  <div style={styles.voucherMain}>
                    <strong
                      style={{
                        ...styles.code,
                        ...(voucher.is_valid ? styles.codeValid : {}),
                      }}
                    >
                      {voucher.code}
                    </strong>
                    <span style={styles.meta}>{getUsageLabel(voucher.usage_type)}</span>
                  </div>
                  <div style={styles.detail}>
                    <span>Valoare</span>
                    <strong style={styles.detailStrong}>{formatVoucherValue(voucher)}</strong>
                  </div>
                  <div style={styles.detail}>
                    <span>Emis</span>
                    <strong style={styles.detailStrong}>{formatDate(voucher.created_at)}</strong>
                  </div>
                  <div style={styles.detail}>
                    <span>Expira</span>
                    <strong style={styles.detailStrong}>{formatDate(voucher.expires_at)}</strong>
                  </div>
                  <div style={styles.detail}>
                    <span>Status</span>
                    <strong style={styles.detailStrong}>{voucher.status}</strong>
                  </div>
                  <div style={styles.detail}>
                    <span>Utilizari</span>
                    <strong style={styles.detailStrong}>
                      {isUnlimited ? voucher.usage_count : "-"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    style={{
                      ...styles.cancelIconBtn,
                      ...(hoveredAction === `cancel-${voucher.id}`
                        ? styles.cancelIconBtnHover
                        : {}),
                      ...(!voucher.is_valid ? styles.cancelIconBtnDisabled : {}),
                    }}
                    onClick={() => voucher.is_valid && setPendingCancel(voucher)}
                    onMouseEnter={() => setHoveredAction(`cancel-${voucher.id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                    disabled={!voucher.is_valid}
                    title="anuleaza voucher"
                    aria-label={`Anuleaza voucher ${voucher.code}`}
                  >
                    {"\u21A9"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {pendingCreate && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <button
                type="button"
                style={{
                  ...styles.closeBtn,
                  ...(hoveredAction === "create-close" ? styles.closeBtnHover : {}),
                }}
                onClick={() => setPendingCreate(null)}
                onMouseEnter={() => setHoveredAction("create-close")}
                onMouseLeave={() => setHoveredAction("")}
                disabled={saving}
                aria-label="Inchide confirmarea"
              >
                <span
                  style={
                    hoveredAction === "create-close"
                      ? styles.closeIconHover
                      : styles.closeIcon
                  }
                >
                  X
                </span>
              </button>
              <h3 style={styles.modalTitle}>Confirmare voucher</h3>
              <p style={styles.modalText}>
                Generezi un voucher{" "}
                <strong>
                  {pendingCreate.discountType === "percent" ? "procentual" : "fix"}
                </strong>{" "}
                de{" "}
                <strong>
                  {pendingCreate.discountType === "percent"
                    ? `${Number(pendingCreate.amount).toFixed(0)}%`
                    : formatAmount(pendingCreate.amount)}
                </strong>
                ,
                valabil pana la <strong>{pendingCreate.expiresOn} 23:59:59</strong>, cu tipul{" "}
                <strong>{getUsageLabel(pendingCreate.usageType)}</strong>?
              </p>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={{
                    ...styles.modalSecondaryBtn,
                    ...(hoveredAction === "create-cancel" && !saving
                      ? styles.modalSecondaryBtnHover
                      : {}),
                    ...(saving ? styles.disabledBtn : {}),
                  }}
                  onClick={() => setPendingCreate(null)}
                  onMouseEnter={() => setHoveredAction("create-cancel")}
                  onMouseLeave={() => setHoveredAction("")}
                  disabled={saving}
                >
                  Renunta
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.modalPrimaryBtn,
                    ...(hoveredAction === "create-confirm" && !saving
                      ? styles.modalPrimaryBtnHover
                      : {}),
                    ...(saving ? styles.disabledBtn : {}),
                  }}
                  onClick={confirmCreateVoucher}
                  onMouseEnter={() => setHoveredAction("create-confirm")}
                  onMouseLeave={() => setHoveredAction("")}
                  disabled={saving}
                >
                  {saving ? "Se genereaza..." : "Confirma"}
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingCancel && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <button
                type="button"
                style={{
                  ...styles.closeBtn,
                  ...(hoveredAction === "cancel-close" ? styles.closeBtnHover : {}),
                }}
                onClick={() => setPendingCancel(null)}
                onMouseEnter={() => setHoveredAction("cancel-close")}
                onMouseLeave={() => setHoveredAction("")}
                disabled={saving}
                aria-label="Inchide confirmarea"
              >
                <span
                  style={
                    hoveredAction === "cancel-close"
                      ? styles.closeIconHover
                      : styles.closeIcon
                  }
                >
                  X
                </span>
              </button>
              <h3 style={styles.modalTitle}>Anuleaza voucher</h3>
              <p style={styles.modalText}>
                Sigur vrei sa anulezi voucherul <strong>{pendingCancel.code}</strong>?
              </p>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={{
                    ...styles.modalSecondaryBtn,
                    ...(hoveredAction === "cancel-no" && !saving
                      ? styles.modalSecondaryBtnHover
                      : {}),
                    ...(saving ? styles.disabledBtn : {}),
                  }}
                  onClick={() => setPendingCancel(null)}
                  onMouseEnter={() => setHoveredAction("cancel-no")}
                  onMouseLeave={() => setHoveredAction("")}
                  disabled={saving}
                >
                  Nu
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.modalPrimaryBtn,
                    ...(hoveredAction === "cancel-yes" && !saving
                      ? styles.modalPrimaryBtnHover
                      : {}),
                    ...(saving ? styles.disabledBtn : {}),
                  }}
                  onClick={confirmCancelVoucher}
                  onMouseEnter={() => setHoveredAction("cancel-yes")}
                  onMouseLeave={() => setHoveredAction("")}
                  disabled={saving}
                >
                  {saving ? "Se anuleaza..." : "Da"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: 24,
  },
  card: {
    background:
      "linear-gradient(90deg, transparent, #3b82f6, #a855f7, transparent) top / 100% 2px no-repeat, #1e1e1e",
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
  form: {
    display: "grid",
    gridTemplateColumns:
      "minmax(130px, 0.8fr) minmax(130px, 0.75fr) minmax(150px, 0.9fr) minmax(170px, 1fr) auto",
    gap: 12,
    alignItems: "end",
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    marginBottom: 16,
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.78)",
    fontWeight: 800,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(124,58,237,0.12)), rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    fontWeight: 800,
  },
  option: {
    backgroundColor: "#232323",
    color: "white",
  },
  primaryBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
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
  secondaryBackBtn: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.24)",
    background: "rgba(59,130,246,0.08)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  secondaryBackBtnHover: {
    background: "rgba(59,130,246,0.14)",
    transform: "scale(1.02)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  disabledBtn: {
    opacity: 0.62,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
  },
  countBadge: {
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid rgba(96,165,250,0.25)",
    color: "#bfdbfe",
    fontWeight: 900,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  voucherRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(210px, 1.05fr) minmax(86px, 0.45fr) minmax(160px, 0.78fr) minmax(160px, 0.78fr) minmax(86px, 0.45fr) minmax(72px, 0.32fr) 46px",
    gap: 10,
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
  },
  voucherValid: {
    border: "1px solid rgba(34,197,94,0.34)",
    boxShadow: "0 0 0 1px rgba(34,197,94,0.06) inset",
  },
  voucherInvalid: {
    border: "1px solid rgba(239,68,68,0.34)",
    boxShadow: "0 0 0 1px rgba(239,68,68,0.06) inset",
  },
  voucherMain: {
    display: "grid",
    gap: 5,
  },
  code: {
    letterSpacing: 0.4,
    color: "white",
  },
  codeValid: {
    color: "#86efac",
  },
  meta: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    fontWeight: 800,
  },
  detail: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
  },
  detailStrong: {
    overflowWrap: "anywhere",
  },
  cancelIconBtn: {
    width: 42,
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    justifySelf: "end",
    padding: 0,
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.32)",
    background: "rgba(239,68,68,0.12)",
    color: "#fecaca",
    fontSize: 22,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 0 14px rgba(239,68,68,0.1)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  cancelIconBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.04)",
    borderColor: "rgba(248,113,113,0.58)",
    boxShadow: "0 0 18px rgba(239,68,68,0.22)",
  },
  cancelIconBtnDisabled: {
    opacity: 0.42,
    cursor: "not-allowed",
    filter: "saturate(0.4)",
    boxShadow: "none",
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
    width: "min(520px, 100%)",
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
  err: {
    color: "salmon",
  },
  success: {
    color: "#86efac",
    fontWeight: 900,
  },
  muted: {
    opacity: 0.72,
  },
};
