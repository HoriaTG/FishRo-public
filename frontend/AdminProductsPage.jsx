import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProducts, updateProduct, deleteProduct } from "../api";
import "./AdminProductsPage.css";

const CATEGORIES = [
  "undita",
  "lanseta",
  "mulineta",
  "carlig",
  "plumb",
  "nailon",
  "echipamente",
  "momeli",
  "diverse",
  "nada",
  "plute",
];

const PROMOTION_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

function AdminProductsPage({ me }) {
  const navigate = useNavigate();
  const isAdmin = !!me && me.role === "admin";

  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [productListOpen, setProductListOpen] = useState(false);
  const productListRef = useRef(null);
  const [form, setForm] = useState({
    name: "",
    category: CATEGORIES[0],
    price: "",
    quantity: "",
    promotion: 0,
    description: "",
    tech_details: "",
    video_url: "",
  });

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshLocked, setRefreshLocked] = useState(false);
  const messageTimerRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const refreshInFlightRef = useRef(false);

  function showSuccessMessage(message) {
    window.clearTimeout(messageTimerRef.current);
    setMsg(message);
    messageTimerRef.current = window.setTimeout(() => setMsg(""), 2000);
  }

  useEffect(() => {
    if (!isAdmin) navigate("/", { replace: true });
  }, [isAdmin, navigate]);

  async function load({ keepMsg = true } = {}) {
    setErr("");
    if (!keepMsg) setMsg("");
    try {
      const data = await getProducts();
      setProducts(data);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => load({ keepMsg: true }), 0);
    return () => clearTimeout(t);
  }, [isAdmin]);

  useEffect(() => {
    function closeProductList(e) {
      if (!productListRef.current?.contains(e.target)) {
        setProductListOpen(false);
      }
    }

    document.addEventListener("mousedown", closeProductList);
    return () => document.removeEventListener("mousedown", closeProductList);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(messageTimerRef.current);
      window.clearTimeout(refreshTimerRef.current);
    },
    []
  );

  const selected = useMemo(
    () => products.find((p) => String(p.id) === String(selectedId)),
    [products, selectedId]
  );

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function selectProduct(id) {
    setSelectedId(id);
    setProductListOpen(false);

    const p = products.find((product) => String(product.id) === String(id));
    if (!p) return;

    setForm({
      name: p.name ?? "",
      category: p.category ?? CATEGORIES[0],
      price: p.price ?? "",
      quantity: p.quantity ?? "",
      promotion: p.promotion ?? 0,
      description: p.description ?? "",
      tech_details: p.tech_details ?? "",
      video_url: p.video_url ?? "",
    });

    setMsg("");
    setErr("");
  }

  async function onSave(e) {
    e.preventDefault();
    if (!selected) return;

    setErr("");
    setMsg("");

    if (!CATEGORIES.includes(form.category)) {
      setErr("Categoria selectată este invalidă.");
      return;
    }

    if (!PROMOTION_OPTIONS.includes(Number(form.promotion))) {
      setErr("Promoția selectată este invalidă.");
      return;
    }

    if (form.tech_details?.trim()) {
      try {
        JSON.parse(form.tech_details);
      } catch {
        setErr('tech_details nu este JSON valid. Ex: [["Lungime","2.7 m"]]');
        return;
      }
    }

    const patch = {
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      quantity: Number(form.quantity),
      promotion: Number(form.promotion),
      description: form.description?.trim() || null,
      tech_details: form.tech_details?.trim() || null,
      video_url: form.video_url?.trim() || null,
    };

    try {
      await updateProduct(selected.id, patch);
      await load({ keepMsg: true });
      showSuccessMessage("Produsul a fost editat cu succes ✅");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onDelete() {
    if (!selected) return;

    const ok = window.confirm(`Ștergi produsul: ${selected.code} - ${selected.name} ?`);
    if (!ok) return;

    setErr("");
    setMsg("");

    try {
      await deleteProduct(selected.id);

      setSelectedId("");
      setForm({
        name: "",
        category: CATEGORIES[0],
        price: "",
        quantity: "",
        promotion: 0,
        description: "",
        tech_details: "",
        video_url: "",
      });

      await load({ keepMsg: true });
      showSuccessMessage("Produs șters cu succes ✅");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleRefreshProducts() {
    if (refreshInFlightRef.current || refreshLocked) return;

    refreshInFlightRef.current = true;
    setRefreshBusy(true);
    setRefreshLocked(true);
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => setRefreshLocked(false), 2000);

    const refreshed = await load({ keepMsg: false });
    refreshInFlightRef.current = false;
    setRefreshBusy(false);

    if (refreshed) {
      showSuccessMessage("Lista produselor a fost actualizată ✅");
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="admin-products-page">
      <div className="admin-products-header">
        <div>
          <p>ADMINISTRARE CATALOG</p>
          <h1>Editare produse</h1>
          <span>Selectează un produs și actualizează informațiile din catalog.</span>
        </div>
      </div>

      <div className="admin-products-layout">
        <aside className="admin-products-card admin-products-sidebar">
          <h3>Produse</h3>

          <div ref={productListRef} className="admin-product-dropdown">
            <button
              type="button"
              className={`admin-product-dropdown-trigger ${productListOpen ? "open" : ""}`}
              aria-haspopup="listbox"
              aria-expanded={productListOpen}
              title={selected?.name || undefined}
              onClick={() => setProductListOpen((open) => !open)}
            >
              <span className="admin-product-dropdown-value">
                {selected ? (
                  <>
                    <span className="admin-product-code">{selected.code}</span>
                    <span className="admin-product-name">{selected.name}</span>
                  </>
                ) : (
                  <span className="admin-product-placeholder">Alege un produs</span>
                )}
              </span>
              <span className="admin-product-dropdown-arrow" aria-hidden="true">
                ▾
              </span>
            </button>

            {productListOpen && (
              <div
                role="listbox"
                aria-label="Produse"
                className="admin-product-dropdown-menu"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedId}
                  className="admin-product-dropdown-option placeholder"
                  onClick={() => {
                    setSelectedId("");
                    setProductListOpen(false);
                  }}
                >
                  -- Alege un produs --
                </button>

                {products.map((p) => {
                  const active = String(p.id) === String(selectedId);

                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`admin-product-dropdown-option ${active ? "active" : ""}`}
                      title={p.name}
                      onClick={() => selectProduct(String(p.id))}
                    >
                      <span className="admin-product-code">{p.code}</span>
                      <span className="admin-product-name">{p.name}</span>
                      {active && (
                        <span className="admin-product-selected-mark" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="admin-products-refresh-btn"
            onClick={handleRefreshProducts}
            disabled={refreshBusy || refreshLocked}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.7 6.7L4 11M5.5 15A7 7 0 0 0 17.3 17.3L20 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {refreshBusy ? "Se actualizează..." : "Actualizează produsele"}
          </button>

          {err && <p className="admin-products-feedback error">{err}</p>}
          {msg && <p className="admin-products-feedback success">{msg}</p>}
        </aside>

        <section className="admin-products-card admin-products-editor">
          <h3>Editare</h3>

          {!selected && (
            <div className="admin-products-empty">
              Selectează un produs din lista din stânga pentru a începe editarea.
            </div>
          )}

          {selected && (
            <form className="admin-products-form" onSubmit={onSave}>
              <label className="admin-products-field">
                <span>Nume</span>
                <input name="name" value={form.name} onChange={onChange} />
              </label>

              <label className="admin-products-field">
                <span>Categorie</span>
                <select name="category" value={form.category} onChange={onChange}>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-products-inline-fields">
                <label className="admin-products-field">
                  <span>Preț</span>
                  <input name="price" value={form.price} onChange={onChange} />
                </label>

                <label className="admin-products-field">
                  <span>Cantitate</span>
                  <input name="quantity" value={form.quantity} onChange={onChange} />
                </label>

                <label className="admin-products-field">
                  <span>Promoție</span>
                  <select
                    name="promotion"
                    value={form.promotion}
                    onChange={onChange}
                  >
                    {PROMOTION_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="admin-products-field">
                <span>Descriere</span>
                <textarea
                  className="admin-products-description"
                  name="description"
                  value={form.description}
                  onChange={onChange}
                />
              </label>

              <label className="admin-products-field">
                <span>Detalii tehnice (JSON)</span>
                <textarea
                  className="admin-products-tech-details"
                  name="tech_details"
                  value={form.tech_details}
                  onChange={onChange}
                  placeholder='Ex: [["Lungime","2.7 m"],["Material","Carbon"]]'
                />
              </label>

              <label className="admin-products-field">
                <span>Video URL (embed)</span>
                <input name="video_url" value={form.video_url} onChange={onChange} />
              </label>

              <div className="admin-products-actions">
                <button type="submit" className="admin-products-save-btn">
                  Salvează modificările
                </button>

                <button
                  type="button"
                  className="admin-products-delete-btn"
                  onClick={onDelete}
                >
                  Șterge produsul
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

export default memo(AdminProductsPage);
