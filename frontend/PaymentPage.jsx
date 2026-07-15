import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { placeOrder } from "../api";
import "./CheckoutPage.css";

function formatCardNumber(value) {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function PaymentPage({ onCartChange }) {
  const navigate = useNavigate();
  const location = useLocation();

  const checkoutData = location.state?.checkoutData || null;
  const cashMode = !!location.state?.cashMode;

  const [card, setCard] = useState({
    cardNumber: "",
    cardName: "",
    expiry: "",
    cvv: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!checkoutData) {
      navigate("/checkout", { replace: true });
    }
  }, [checkoutData, navigate]);

  const isValidCard = useMemo(() => {
    const cleanNumber = card.cardNumber.replace(/\s/g, "");
    const expiryOk = /^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry);
    const cvvOk = /^\d{3}$/.test(card.cvv);
    const nameOk = card.cardName.trim().length >= 3;
    const numberOk = /^\d{16}$/.test(cleanNumber);

    return expiryOk && cvvOk && nameOk && numberOk;
  }, [card]);

  async function submitOrder() {
    if (!checkoutData) return;

    if (!cashMode && !isValidCard) {
      setError("Completează corect toate câmpurile cardului.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await placeOrder(checkoutData);
      if (onCartChange) {
        await onCartChange();
      }
      navigate("/store", {
        replace: true,
        state: { orderSuccess: true },
      });
    } catch (err) {
      setError(err.message || "Eroare la plasarea comenzii.");
    } finally {
      setLoading(false);
    }
  }

  if (!checkoutData) return null;

  if (cashMode) {
    return (
      <div className="checkout-page-shell">
        <div className="checkout-container">
          <h2>Confirmare comandă</h2>
          <p className="helper-text">
            Ai ales plata ramburs către curier. Apasă butonul de mai jos pentru a
            finaliza comanda.
          </p>

          {error && <p className="error">{error}</p>}

          <button
            className="place-order-btn"
            onClick={submitOrder}
            disabled={loading}
          >
            {loading ? "Se plasează..." : "Plasează comanda"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page-shell">
      <div className="checkout-container">
        <h2>Plată cu cardul</h2>

        <div className="form-grid">
          <div className="field-group field-span-2">
            <label>Număr card *</label>
            <input
              value={card.cardNumber}
              placeholder="1234 5678 1234 5678"
              onChange={(e) =>
                setCard((prev) => ({
                  ...prev,
                  cardNumber: formatCardNumber(e.target.value),
                }))
              }
            />
          </div>

          <div className="field-group field-span-2">
            <label>Nume pe card *</label>
            <input
              value={card.cardName}
              placeholder="NUME PRENUME"
              onChange={(e) =>
                setCard((prev) => ({
                  ...prev,
                  cardName: e.target.value,
                }))
              }
            />
          </div>

          <div className="field-group">
            <label>Data expirare *</label>
            <input
              value={card.expiry}
              placeholder="MM/YY"
              onChange={(e) =>
                setCard((prev) => ({
                  ...prev,
                  expiry: formatExpiry(e.target.value),
                }))
              }
            />
          </div>

          <div className="field-group">
            <label>CVV *</label>
            <input
              value={card.cvv}
              placeholder="123"
              onChange={(e) =>
                setCard((prev) => ({
                  ...prev,
                  cvv: e.target.value.replace(/\D/g, "").slice(0, 3),
                }))
              }
            />
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <button
          className="place-order-btn"
          onClick={submitOrder}
          disabled={loading}
        >
          {loading ? "Se plasează..." : "Plasează comanda"}
        </button>
      </div>
    </div>
  );
}
