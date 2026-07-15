import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { applyVoucher, getCart, getMe, getToken } from "../api";
import "./CheckoutPage.css";

const SHIPPING_AMOUNT = 10;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function CheckoutPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    address: "",
    phone: "",
    email: "",
    payment: "cash",
    terms: false,
  });

  const [error, setError] = useState("");
  const [cart, setCart] = useState({ items: [], total: 0 });
  const [cartError, setCartError] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const [voucherMessage, setVoucherMessage] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [minimumOrderAlert, setMinimumOrderAlert] = useState("");
  const isGuest = !getToken();

  const subtotal = Number(cart.total) || 0;
  const discountAmount = Number(appliedVoucher?.discount_amount) || 0;
  const shippingAmount = Number(appliedVoucher?.shipping_amount ?? SHIPPING_AMOUNT);
  const productsTotalAfterDiscount = Math.max(subtotal - discountAmount, 0);
  const finalTotal = useMemo(
    () => productsTotalAfterDiscount + shippingAmount,
    [productsTotalAfterDiscount, shippingAmount]
  );

  useEffect(() => {
    if (!getToken()) return undefined;

    let cancelled = false;

    async function loadProfile() {
      try {
        const me = await getMe();
        if (cancelled) return;

        const fullName = (me?.full_name || "").trim();
        const fullNameParts = fullName.split(/\s+/).filter(Boolean);
        const addressParts = [
          me?.address,
          me?.city,
          me?.county,
          me?.postal_code ? `CP ${me.postal_code}` : "",
        ].filter(Boolean);

        setForm((prev) => ({
          ...prev,
          firstName: fullNameParts[0] || prev.firstName,
          lastName:
            (fullNameParts.length > 1 ? fullNameParts.slice(1).join(" ") : "") ||
            prev.lastName,
          address: addressParts.join(", ") || prev.address,
          phone: me?.phone || prev.phone,
          email: me?.email || prev.email,
        }));
      } catch {
        // silent
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCart() {
      try {
        const data = await getCart();
        if (cancelled) return;
        setCart({
          items: Array.isArray(data.items) ? data.items : [],
          total: Number(data.total) || 0,
        });
      } catch (err) {
        if (!cancelled) {
          setCartError(err.message || "Nu am putut incarca sumarul comenzii.");
        }
      }
    }

    loadCart();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleVoucherChange(e) {
    const value = e.target.value.toUpperCase();
    setVoucherCode(value);
    setVoucherError("");
    setVoucherMessage("");
    if (appliedVoucher && value.trim() !== appliedVoucher.code) {
      setAppliedVoucher(null);
    }
  }

  async function handleApplyVoucher() {
    const code = voucherCode.trim();
    if (!code) {
      setVoucherError("Introdu codul voucherului.");
      return;
    }

    if (isGuest) {
      setVoucherError("Trebuie sa fii autentificat pentru a folosi un voucher.");
      return;
    }

    try {
      setApplyingVoucher(true);
      setVoucherError("");
      setVoucherMessage("");
      const data = await applyVoucher(code);
      setAppliedVoucher(data);
      setVoucherCode(data.code);
      setVoucherMessage(`Voucher aplicat: -${Number(data.discount_amount).toFixed(2)} lei`);
    } catch (err) {
      setAppliedVoucher(null);
      const message = err.message || "Voucher invalid.";
      if (normalizeText(message).includes("comanda minima")) {
        setVoucherError("");
        setMinimumOrderAlert(message);
      } else {
        setVoucherError(message);
      }
    } finally {
      setApplyingVoucher(false);
    }
  }

  function isValid() {
    return (
      form.firstName.trim() &&
      form.lastName.trim() &&
      form.address.trim() &&
      form.phone.trim() &&
      form.email.trim() &&
      form.terms
    );
  }

  function handleSubmit() {
    if (!isValid()) {
      setError("Completează toate câmpurile obligatorii și acceptă termenii.");
      return;
    }

    setError("");

    const checkoutData = {
      ...form,
      voucherCode: appliedVoucher?.code || "",
    };

    if (form.payment === "card") {
      navigate("/payment", {
        state: {
          checkoutData,
        },
      });
      return;
    }

    navigate("/payment", {
      state: {
        checkoutData,
        cashMode: true,
      },
    });
  }

  const actionLabel =
    form.payment === "card" ? "Mergi spre plată" : "Plasează comanda";

  return (
    <div className="checkout-page-shell">
      <div className="checkout-container">
        <h2>Finalizare comandă</h2>

        {isGuest && (
          <div className="guest-checkout-card">
            <div>
              <strong>Poți continua fără cont</strong>
              <p>
                Plasezi comanda ca vizitator, iar datele de livrare rămân salvate pe comandă.
              </p>
            </div>
            <button type="button" onClick={() => navigate("/register")}>
              Creează cont
            </button>
          </div>
        )}

        <div className="form-grid">
          <div className="field-group">
            <label>Prenume *</label>
            <input
              name="firstName"
              value={form.firstName}
              placeholder="Prenume"
              onChange={handleChange}
            />
          </div>

          <div className="field-group">
            <label>Nume *</label>
            <input
              name="lastName"
              value={form.lastName}
              placeholder="Nume"
              onChange={handleChange}
            />
          </div>

          <div className="field-group field-span-2">
            <label>Adresă de livrare *</label>
            <input
              name="address"
              value={form.address}
              placeholder="Stradă, număr, bloc, apartament"
              onChange={handleChange}
            />
          </div>

          <div className="field-group">
            <label>Telefon *</label>
            <input
              name="phone"
              value={form.phone}
              placeholder="07xxxxxxxx"
              onChange={handleChange}
            />
          </div>

          <div className="field-group">
            <label>Email *</label>
            <input
              name="email"
              value={form.email}
              placeholder="email@exemplu.ro"
              onChange={handleChange}
            />
          </div>
        </div>

        <section className="checkout-summary-card">
          <div className="checkout-summary-head">
            <div>
              <div className="section-title">Sumar comandă</div>
              <p>Produsele selectate și totalul actual al coșului.</p>
            </div>
            <strong>{cart.items.length}</strong>
          </div>

          {cartError && <p className="error">{cartError}</p>}

          {!cartError && cart.items.length === 0 && (
            <p className="summary-empty">Coșul este gol.</p>
          )}

          {!cartError && cart.items.length > 0 && (
            <div className="summary-lines">
              {cart.items.map((item) => {
                const quantity = Number(item.quantity) || 0;
                const unitPrice = Number(item.unit_price) || 0;
                const lineTotal = unitPrice * quantity;

                return (
                  <div className="summary-line" key={item.id || item.product_id}>
                    <div>
                      <strong>
                        {quantity} x {item.product_name}
                      </strong>
                      <span>{unitPrice.toFixed(2)} lei / buc</span>
                    </div>
                    <strong>{lineTotal.toFixed(2)} lei</strong>
                  </div>
                );
              })}

              <div className="summary-totals">
                {appliedVoucher && (
                  <>
                    <div className="summary-total-row">
                      <span>Produse</span>
                      <strong>{subtotal.toFixed(2)} lei</strong>
                    </div>

                    <div className="summary-total-row summary-discount-row">
                      <span>Voucher {appliedVoucher.code}</span>
                      <strong>-{discountAmount.toFixed(2)} lei</strong>
                    </div>
                  </>
                )}

                <div className="summary-total-row">
                  <span>Subtotal produse</span>
                  <strong>{productsTotalAfterDiscount.toFixed(2)} lei</strong>
                </div>
              </div>

              <div className="summary-line">
                <div>
                  <strong>Transport</strong>
                  <span>Livrare prin curier</span>
                </div>
                <strong>{shippingAmount.toFixed(2)} lei</strong>
              </div>

              <div className="summary-totals summary-grand-total">
                <div className="summary-total-row summary-final-row">
                  <span>Total</span>
                  <strong>{finalTotal.toFixed(2)} lei</strong>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="voucher-section">
          <div className="section-title">Aplică voucher</div>
          <div className="voucher-row">
            <input
              value={voucherCode}
              placeholder="Ex: FR-ZGUJFX953U"
              onChange={handleVoucherChange}
            />
            <button
              type="button"
              className="voucher-apply-btn"
              onClick={handleApplyVoucher}
              disabled={applyingVoucher}
            >
              {applyingVoucher ? "Se verifică..." : "Aplică voucher"}
            </button>
          </div>
          {voucherMessage && <p className="voucher-success">{voucherMessage}</p>}
          {voucherError && <p className="error">{voucherError}</p>}
        </section>

        <div className="payment-section">
          <div className="section-title">Metodă de plată</div>

          <label className="radio-row">
            <input
              type="radio"
              name="payment"
              value="cash"
              checked={form.payment === "cash"}
              onChange={handleChange}
            />
            Ramburs către curier
          </label>

          <label className="radio-row">
            <input
              type="radio"
              name="payment"
              value="card"
              checked={form.payment === "card"}
              onChange={handleChange}
            />
            Plată cu cardul online
          </label>
        </div>

        <div className="terms">
          <input
            id="terms-checkbox"
            type="checkbox"
            name="terms"
            checked={form.terms}
            onChange={handleChange}
          />
          <label htmlFor="terms-checkbox">
            Accept{" "}
            <Link to="/terms" state={{ returnTo: "/checkout" }}>
              termenii și condițiile
            </Link>
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <button className="place-order-btn" onClick={handleSubmit}>
          {actionLabel}
        </button>
      </div>

      {minimumOrderAlert && (
        <div className="checkout-modal-backdrop">
          <div className="checkout-alert-modal">
            <button
              type="button"
              className="checkout-modal-close"
              onClick={() => setMinimumOrderAlert("")}
              aria-label="Inchide"
            >
              X
            </button>
            <h3>Comandă minimă</h3>
            <p>{minimumOrderAlert}</p>
            <button
              type="button"
              className="checkout-modal-primary"
              onClick={() => navigate("/store")}
            >
              Continuă cumpărăturile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
/*
                  <div className="summary-total-row summary-discount-row">
                    <span>Voucher {appliedVoucher.code}</span>
                    <strong>-{discountAmount.toFixed(2)} lei</strong>
                  </div>
                )}

                <div className="summary-total-row summary-final-row">
                  <span>Total</span>
                  <strong>{finalTotal.toFixed(2)} lei</strong>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="voucher-section">
          <div className="section-title">Aplică voucher</div>
          <div className="voucher-row">
            <input
              value={voucherCode}
              placeholder="Ex: FR-ZGUJFX953U"
              onChange={handleVoucherChange}
            />
            <button
              type="button"
              className="voucher-apply-btn"
              onClick={handleApplyVoucher}
              disabled={applyingVoucher}
            >
              {applyingVoucher ? "Se verifică..." : "Aplică voucher"}
            </button>
          </div>
          {voucherMessage && <p className="voucher-success">{voucherMessage}</p>}
          {voucherError && <p className="error">{voucherError}</p>}
        </section>

        <div className="payment-section">
          <div className="section-title">Metodă de plată</div>

          <label className="radio-row">
            <input
              type="radio"
              name="payment"
              value="cash"
              checked={form.payment === "cash"}
              onChange={handleChange}
            />
            Ramburs către curier
          </label>

          <label className="radio-row">
            <input
              type="radio"
              name="payment"
              value="card"
              checked={form.payment === "card"}
              onChange={handleChange}
            />
            Plată cu cardul online
          </label>
        </div>

        <div className="terms">
          <input
            id="terms-checkbox"
            type="checkbox"
            name="terms"
            checked={form.terms}
            onChange={handleChange}
          />
          <label htmlFor="terms-checkbox">
            Accept{" "}
            <Link to="/terms" state={{ returnTo: "/checkout" }}>
              termenii și condițiile
            </Link>
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <button className="place-order-btn" onClick={handleSubmit}>
          {actionLabel}
        </button>
      </div>

      {minimumOrderAlert && (
        <div className="checkout-modal-backdrop">
          <div className="checkout-alert-modal">
            <button
              type="button"
              className="checkout-modal-close"
              onClick={() => setMinimumOrderAlert("")}
              aria-label="Inchide"
            >
              X
            </button>
            <h3>Comandă minimă</h3>
            <p>{minimumOrderAlert}</p>
            <button
              type="button"
              className="checkout-modal-primary"
              onClick={() => navigate("/store")}
            >
              Continuă cumpărăturile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
*/
