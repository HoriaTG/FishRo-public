import { useLocation, useNavigate } from "react-router-dom";
import "./CheckoutPage.css";

export default function TermsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/checkout";

  return (
    <div className="checkout-page-shell">
      <div className="checkout-container terms-page">
        <h2>Termeni și condiții</h2>

        <p>
          Această pagină este demonstrativă pentru proiectul FishRo. Prin
          plasarea unei comenzi, clientul confirmă că datele completate sunt
          corecte și că a citit condițiile de livrare și retur.
        </p>

        <p>
          Produsele sunt livrate în limita stocului disponibil. În cazul în care
          apar diferențe de stoc, clientul poate fi contactat pentru confirmare.
        </p>

        <p>
          Pentru plata cu cardul, datele introduse în aplicație sunt folosite
          exclusiv în scop demonstrativ în cadrul proiectului și nu procesează
          tranzacții reale.
        </p>

        <p>
          Pentru orice problemă legată de comandă, utilizatorul poate deschide
          un tichet din secțiunea dedicată.
        </p>
        <button
          type="button"
          className="terms-back-btn"
          onClick={() => navigate(returnTo)}
        >
          Înapoi la comandă
        </button>
      </div>
    </div>
  );
}
