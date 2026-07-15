import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  clearCartApi,
  deleteCartItem,
  getCart,
  updateCartItem,
} from "../api";
import { loadNextProductImage } from "../productImages";

const CART_BACKGROUND_REFRESH_MS = 15000;

export default function CartPage({ onCartChange, isModal = false, backgroundLocation }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredAction, setHoveredAction] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const prevItemsRef = useRef([]);

  const returnLocation = backgroundLocation || location.state?.backgroundLocation;

  function getReturnPath() {
    if (!returnLocation) return "/";

    return `${returnLocation.pathname || "/"}${returnLocation.search || ""}${
      returnLocation.hash || ""
    }`;
  }

  const loadCart = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const cart = await getCart();
        const nextItems = cart.items || [];
        const prevItems = prevItemsRef.current || [];

        const nextMap = new Map(nextItems.map((item) => [item.product_id, item]));
        let stockChanged = false;

        for (const prevItem of prevItems) {
          const nextItem = nextMap.get(prevItem.product_id);

          if (!nextItem || nextItem.quantity !== prevItem.quantity) {
            stockChanged = true;
            break;
          }
        }

        setItems(nextItems);
        prevItemsRef.current = nextItems;
        setError("");

        if (stockChanged && silent) {
          setMsg("Coșul a fost actualizat automat în funcție de stocul disponibil.");
        }

        if (onCartChange) {
          await onCartChange();
        }
      } catch (e) {
        setItems([]);
        prevItemsRef.current = [];
        setError(e.message || "Eroare la încărcarea coșului.");
      } finally {
        setIsLoading(false);
      }
    },
    [onCartChange]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const cart = await getCart();
        if (!cancelled) {
          const loadedItems = cart.items || [];
          setItems(loadedItems);
          prevItemsRef.current = loadedItems;
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Eroare la încărcarea coșului.");
          setItems([]);
          prevItemsRef.current = [];
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function refreshCartIfVisible() {
      if (document.hidden) return;
      loadCart({ silent: true });
    }

    const intervalId = setInterval(refreshCartIfVisible, CART_BACKGROUND_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshCartIfVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshCartIfVisible);
    };
  }, [loadCart]);

  useEffect(() => {
    function handleExternalCartUpdate(event) {
      const nextItems = event.detail?.cart?.items;
      if (!Array.isArray(nextItems)) {
        loadCart({ silent: true });
        return;
      }

      setItems(nextItems);
      prevItemsRef.current = nextItems;
      setQuantityDrafts((current) => {
        const productIds = new Set(nextItems.map((item) => item.product_id));
        return Object.fromEntries(
          Object.entries(current).filter(([productId]) =>
            productIds.has(Number(productId))
          )
        );
      });
      setError("");
      setMsg("");
      setIsLoading(false);
    }

    window.addEventListener("fishro-cart-updated", handleExternalCartUpdate);
    return () => {
      window.removeEventListener("fishro-cart-updated", handleExternalCartUpdate);
    };
  }, [loadCart]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    if (isModal && !isLoading && items.length > 0) {
      navigate("/cart", { replace: true });
    }
  }, [isLoading, isModal, items.length, navigate]);

  async function reloadCart() {
    await loadCart({ silent: false });
  }

  async function handleIncrease(item) {
    if (item.quantity >= item.stock) return;

    try {
      await updateCartItem(item.product_id, item.quantity + 1);
      await reloadCart();
    } catch (e) {
      setError(e.message || "Eroare la actualizarea cantității.");
    }
  }

  async function handleDecrease(item) {
    if (item.quantity <= 1) return;

    try {
      await updateCartItem(item.product_id, item.quantity - 1);
      await reloadCart();
    } catch (e) {
      setError(e.message || "Eroare la actualizarea cantității.");
    }
  }

  function clampQuantity(value, item) {
    const parsed = Number.parseInt(value, 10);
    const maxQuantity = Math.max(1, Number(item.stock) || 1);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }

    return Math.min(parsed, maxQuantity);
  }

  function handleQuantityDraftChange(item, value) {
    setQuantityDrafts((prev) => ({
      ...prev,
      [item.product_id]: value,
    }));
  }

  async function commitQuantityDraft(item) {
    const nextQuantity = clampQuantity(
      quantityDrafts[item.product_id] ?? item.quantity,
      item
    );

    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[item.product_id];
      return next;
    });

    if (nextQuantity === item.quantity) {
      return;
    }

    try {
      await updateCartItem(item.product_id, nextQuantity);
      await reloadCart();
    } catch (e) {
      setError(e.message || "Eroare la actualizarea cantității.");
    }
  }

  async function handleRemove(item) {
    try {
      await deleteCartItem(item.product_id);
      setQuantityDrafts((prev) => {
        const next = { ...prev };
        delete next[item.product_id];
        return next;
      });
      await reloadCart();
    } catch (e) {
      setError(e.message || "Eroare la ștergerea produsului.");
    }
  }

  async function handleClear() {
    try {
      await clearCartApi();
      setItems([]);
      prevItemsRef.current = [];
      setQuantityDrafts({});
      setError("");
      setMsg("");
      if (onCartChange) await onCartChange();
    } catch (e) {
      setError(e.message || "Eroare la golirea coșului.");
    }
  }

  function closeCartModal() {
    navigate(getReturnPath(), { replace: true });
  }

  function goToStore() {
    navigate("/store", { replace: true });
  }

  function handleCheckout() {
    navigate("/checkout");
  }

  const total = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0
    );
  }, [items]);

  if (isLoading) {
    return (
      <div style={isModal ? styles.overlay : styles.pageCenter}>
        <div style={styles.emptyModal}>
          <h2 style={styles.emptyTitle}>Se încarcă...</h2>
          <p style={styles.emptyText}>Verificăm produsele din coșul tău.</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        style={isModal ? styles.overlay : styles.pageCenter}
        onMouseDown={(e) => {
          if (isModal && e.target === e.currentTarget) closeCartModal();
        }}
        role={isModal ? "dialog" : undefined}
        aria-modal={isModal ? "true" : undefined}
        aria-labelledby="empty-cart-title"
      >
        <div style={styles.emptyModal}>
          {isModal && (
            <button
              type="button"
              style={{
                ...styles.closeBtn,
                ...(hoveredAction === "close-cart" ? styles.closeBtnHover : {}),
              }}
              onClick={closeCartModal}
              onMouseEnter={() => setHoveredAction("close-cart")}
              onMouseLeave={() => setHoveredAction("")}
              aria-label="Închide coșul"
            >
              <span
                style={
                  hoveredAction === "close-cart"
                    ? styles.closeIconHover
                    : styles.closeIcon
                }
              >
                X
              </span>
            </button>
          )}

          <h2 id="empty-cart-title" style={styles.emptyTitle}>
            Coșul este gol
          </h2>
          <p style={styles.emptyText}>
            Nu ai produse în coș momentan. Poți reveni în magazin și adăuga
            articolele preferate.
          </p>

          {error && <p style={styles.errBox}>{error}</p>}
          {msg && <p style={styles.okBox}>{msg}</p>}

          <button
            type="button"
            style={{
              ...styles.primaryBtn,
              ...(hoveredAction === "store" ? styles.primaryBtnHover : {}),
            }}
            onClick={goToStore}
            onMouseEnter={() => setHoveredAction("store")}
            onMouseLeave={() => setHoveredAction("")}
          >
            Continuă cumpărăturile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Produsele selectate</h2>
        </div>
      </div>

      {error && <p style={styles.errBox}>{error}</p>}
      {msg && <p style={styles.okBox}>{msg}</p>}

      <div style={styles.layout}>
        <div style={styles.list}>
          {items.map((item) => (
            <div key={item.product_id} style={styles.card}>
              <img
                src={item.image_url}
                alt={item.product_name}
                style={styles.image}
                onError={(e) => loadNextProductImage(e, item.product_code)}
              />

              <div style={styles.info}>
                <div>
                  <h3 style={styles.productTitle}>{item.product_name}</h3>
                </div>

                <div style={styles.metaRow}>
                  <span style={styles.price}>{item.unit_price} lei</span>
                  <span style={styles.stock}>Stoc disponibil: {item.stock}</span>
                </div>

                <div style={styles.qtyRow}>
                  <button
                    type="button"
                    style={{
                      ...styles.qtyBtn,
                      ...(item.quantity <= 1 ? styles.disabledBtn : {}),
                      ...(hoveredAction === `decrease-${item.product_id}`
                        && item.quantity > 1
                        ? styles.qtyBtnHover
                        : {}),
                    }}
                    onClick={() => handleDecrease(item)}
                    onMouseEnter={() => setHoveredAction(`decrease-${item.product_id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                    disabled={item.quantity <= 1}
                    aria-label="Scade cantitatea"
                  >
                    <span style={styles.qtyBtnSymbol}>-</span>
                  </button>

                  <input
                    style={styles.qtyInput}
                    value={quantityDrafts[item.product_id] ?? item.quantity}
                    inputMode="numeric"
                    aria-label="Cantitate produs"
                    onChange={(e) => handleQuantityDraftChange(item, e.target.value)}
                    onBlur={() => commitQuantityDraft(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                  />

                  <button
                    type="button"
                    style={{
                      ...styles.qtyBtn,
                      ...(item.quantity >= item.stock ? styles.disabledBtn : {}),
                      ...(hoveredAction === `increase-${item.product_id}` &&
                      item.quantity < item.stock
                        ? styles.qtyBtnHover
                        : {}),
                    }}
                    onClick={() => handleIncrease(item)}
                    onMouseEnter={() => setHoveredAction(`increase-${item.product_id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                    disabled={item.quantity >= item.stock}
                    aria-label="Crește cantitatea"
                  >
                    <span style={styles.qtyBtnSymbol}>+</span>
                  </button>
                </div>

                <div style={styles.actions}>
                  <button
                    type="button"
                    style={{
                      ...styles.removeBtn,
                      ...(hoveredAction === `remove-${item.product_id}`
                        ? styles.removeBtnHover
                        : {}),
                    }}
                    onClick={() => handleRemove(item)}
                    onMouseEnter={() => setHoveredAction(`remove-${item.product_id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                  >
                    Șterge
                  </button>

                  <Link
                    to={`/products/${item.product_id}`}
                    style={{
                      ...styles.secondaryBtn,
                      ...(hoveredAction === `product-${item.product_id}`
                        ? styles.secondaryBtnHover
                        : {}),
                    }}
                    onMouseEnter={() => setHoveredAction(`product-${item.product_id}`)}
                    onMouseLeave={() => setHoveredAction("")}
                  >
                    <span>Vezi produsul</span>
                  </Link>
                </div>
              </div>

              <div style={styles.subtotal}>
                <span style={styles.subtotalLabel}>Subtotal</span>
                <strong>{(item.unit_price * item.quantity).toFixed(2)} lei</strong>
              </div>
            </div>
          ))}
        </div>

        <aside style={styles.summary}>
          <p style={styles.summaryEyebrow}>Sumar comandă</p>
          <div style={styles.summaryRow}>
            <span>Total</span>
            <strong>{total.toFixed(2)} lei</strong>
          </div>

          <button
            type="button"
            style={{
              ...styles.checkoutBtn,
              ...(hoveredAction === "checkout" ? styles.primaryBtnHover : {}),
            }}
            onClick={handleCheckout}
            onMouseEnter={() => setHoveredAction("checkout")}
            onMouseLeave={() => setHoveredAction("")}
          >
            Finalizează comanda
          </button>

          <Link
            to="/store"
            style={{
              ...styles.storeLink,
              ...(hoveredAction === "store-summary" ? styles.secondaryBtnHover : {}),
            }}
            onMouseEnter={() => setHoveredAction("store-summary")}
            onMouseLeave={() => setHoveredAction("")}
          >
            Continuă cumpărăturile
          </Link>

          <button
            type="button"
            style={{
              ...styles.clearBtn,
              ...(hoveredAction === "clear" ? styles.clearBtnHover : {}),
            }}
            onClick={handleClear}
            onMouseEnter={() => setHoveredAction("clear")}
            onMouseLeave={() => setHoveredAction("")}
          >
            Golește coșul
          </button>

          <p style={styles.note}>
            Poți continua comanda cu sau fără cont. Datele de livrare se vor
            completa la pasul următor.
          </p>
        </aside>
      </div>
    </div>
  );
}

const glassPanel = {
  border: "1px solid rgba(96,165,250,0.22)",
  background:
    "linear-gradient(145deg, rgba(15,23,42,0.88), rgba(24,31,45,0.84))",
  boxShadow:
    "0 18px 44px rgba(0,0,0,0.42), 0 0 24px rgba(59,130,246,0.12)",
};

const styles = {
  page: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 24,
  },
  pageCenter: {
    minHeight: "calc(100vh - 68px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    boxSizing: "border-box",
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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
  },
  emptyModal: {
    ...glassPanel,
    position: "relative",
    width: "min(440px, 100%)",
    display: "grid",
    gap: 14,
    padding: "28px 26px",
    borderRadius: 16,
    color: "white",
    boxSizing: "border-box",
  },
  emptyTitle: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
  },
  emptyText: {
    margin: 0,
    color: "rgba(255,255,255,0.74)",
    lineHeight: 1.55,
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
    background:
      "linear-gradient(135deg, rgba(220,38,38,0.92), rgba(153,27,27,0.9))",
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
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 320px",
    gap: 20,
    alignItems: "start",
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    ...glassPanel,
    display: "grid",
    gridTemplateColumns: "128px 1fr auto",
    gap: 18,
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
  },
  image: {
    width: 128,
    height: 128,
    objectFit: "contain",
    background: "rgba(255,255,255,0.94)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
  },
  info: {
    display: "grid",
    gap: 12,
  },
  productTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 20,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  price: {
    fontWeight: 900,
    color: "#86efac",
  },
  stock: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.25)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
    transition: "background 0.18s ease, transform 0.18s ease",
  },
  qtyBtnHover: {
    background: "rgba(59,130,246,0.14)",
    transform: "scale(1.06)",
  },
  disabledBtn: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  qtyBtnSymbol: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    fontSize: 22,
    lineHeight: 1,
  },
  qtyInput: {
    width: 46,
    border: "1px solid transparent",
    outline: "none",
    color: "white",
    textAlign: "center",
    fontWeight: 900,
    padding: "8px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
    boxSizing: "border-box",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  removeBtn: {
    border: "1px solid transparent",
    background: "rgba(248,113,113,0.13)",
    color: "white",
    outline: "none",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 800,
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  removeBtnHover: {
    background: "rgba(248,113,113,0.2)",
    transform: "scale(1.03)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    border: "1px solid transparent",
    background: "rgba(59,130,246,0.08)",
    color: "white",
    outline: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 800,
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  secondaryBtnHover: {
    background: "rgba(59,130,246,0.14)",
    transform: "scale(1.03)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  subtotal: {
    display: "grid",
    justifyItems: "end",
    gap: 5,
    whiteSpace: "nowrap",
    color: "#f8fafc",
  },
  subtotalLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  summary: {
    ...glassPanel,
    borderRadius: 16,
    padding: 18,
    position: "sticky",
    top: 20,
  },
  summaryEyebrow: {
    margin: "0 0 18px",
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
    paddingBottom: 16,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    outline: "none",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  primaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  checkoutBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    outline: "none",
    fontWeight: 900,
    cursor: "pointer",
    marginBottom: 10,
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  clearBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "rgba(248,113,113,0.12)",
    color: "white",
    outline: "none",
    fontWeight: 900,
    cursor: "pointer",
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  clearBtnHover: {
    background: "rgba(248,113,113,0.2)",
    transform: "scale(1.02)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  storeLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 10,
    textDecoration: "none",
    color: "white",
    border: "1px solid transparent",
    background: "rgba(59,130,246,0.08)",
    borderRadius: 10,
    padding: "12px 14px",
    fontWeight: 900,
    outline: "none",
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  note: {
    margin: "14px 0 0",
    fontSize: 13,
    opacity: 0.75,
    lineHeight: 1.5,
  },
  errBox: {
    margin: "0 0 14px",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "#fca5a5",
  },
  okBox: {
    margin: "0 0 14px",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(74,222,128,0.35)",
    background: "rgba(34,197,94,0.12)",
    color: "#86efac",
  },
};
