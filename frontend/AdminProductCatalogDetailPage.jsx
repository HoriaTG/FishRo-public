import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProductById } from "../api";
import { getProductImageCandidates, loadNextProductImage } from "../productImages";
import "./AdminProductCatalog.css";

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function getDiscountedPrice(price, promotion) {
  const discount = Number(promotion) || 0;
  return Number(price) * (1 - discount / 100);
}

export default function AdminProductCatalogDetailPage({ me }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = me?.role === "admin";
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (me && !isAdmin) navigate("/", { replace: true });
  }, [isAdmin, me, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    getProductById(id)
      .then((data) => {
        if (!cancelled) {
          setProduct(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Produsul nu a putut fi încărcat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isAdmin]);

  const technicalDetails = useMemo(() => {
    if (!product?.tech_details) return [];

    try {
      const parsed = JSON.parse(product.tech_details);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [product?.tech_details]);

  if (!isAdmin) return null;

  if (loading) {
    return <main className="admin-catalog-page"><div className="admin-catalog-state">Se încarcă fișa produsului...</div></main>;
  }

  if (error || !product) {
    return <main className="admin-catalog-page"><div className="admin-catalog-state error">{error || "Produs inexistent."}</div></main>;
  }

  const finalPrice = getDiscountedPrice(product.price, product.promotion);

  return (
    <main className="admin-catalog-page">
      <button
        type="button"
        className="admin-catalog-back"
        onClick={() => navigate("/dashboard/products")}
      >
        <span aria-hidden="true">←</span>
        Înapoi la catalog
      </button>

      <section className="admin-product-sheet">
        <div className="admin-product-sheet-image">
          <img
            src={getProductImageCandidates(product.code)[0]}
            data-fallback-index="0"
            onError={(event) => loadNextProductImage(event, product.code)}
            alt={product.name}
          />
        </div>

        <div className="admin-product-sheet-summary">
          <span className="admin-product-sheet-category">{product.category}</span>
          <h1>{product.name}</h1>
          <div className="admin-product-sheet-code">Cod produs: <strong>{product.code}</strong></div>

          <div className="admin-product-sheet-price">
            <strong>{formatPrice(finalPrice)} lei</strong>
            {Number(product.promotion) > 0 && (
              <>
                <span>{formatPrice(product.price)} lei</span>
                <em>-{product.promotion}%</em>
              </>
            )}
          </div>

          <div className="admin-product-sheet-facts">
            <div><span>Stoc</span><strong>{product.quantity} buc.</strong></div>
            <div><span>Categorie</span><strong>{product.category}</strong></div>
            <div><span>Recenzii</span><strong>{product.review_count || 0}</strong></div>
            <div><span>Rating</span><strong>{Number(product.average_rating || 0).toFixed(2)} / 5</strong></div>
          </div>
        </div>

        <div className="admin-product-sheet-section admin-product-sheet-description">
          <h2>Descriere</h2>
          <p>{product.description || "Produsul nu are o descriere disponibilă."}</p>
        </div>

        <div className="admin-product-sheet-section">
          <h2>Specificații tehnice</h2>
          {technicalDetails.length > 0 ? (
            <dl className="admin-product-specifications">
              {technicalDetails.map(([label, value], index) => (
                <div key={`${label}-${index}`}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="admin-product-sheet-muted">Nu există specificații tehnice.</p>
          )}
        </div>
      </section>
    </main>
  );
}
