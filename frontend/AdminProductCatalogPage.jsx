import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProducts } from "../api";
import { getProductImageCandidates, loadNextProductImage } from "../productImages";
import "./AdminProductCatalog.css";

export default function AdminProductCatalogPage({ me }) {
  const navigate = useNavigate();
  const isAdmin = me?.role === "admin";
  const [products, setProducts] = useState([]);
  const [codeSearch, setCodeSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const filteredProducts = useMemo(() => {
    const query = codeSearch.trim().toLowerCase();
    if (!query) return products;

    return products.filter((product) =>
      String(product.code || "").toLowerCase().includes(query)
    );
  }, [codeSearch, products]);

  useEffect(() => {
    if (me && !isAdmin) navigate("/", { replace: true });
  }, [isAdmin, me, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    getProducts()
      .then((data) => {
        if (!cancelled) {
          setProducts(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Catalogul nu a putut fi încărcat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <main className="admin-catalog-page">
      <header className="admin-catalog-header">
        <div>
          <p>CATALOG INTERN</p>
          <h1>Catalog produse</h1>
          <span>Consultă rapid produsele și fișele lor complete.</span>
        </div>
        <div className="admin-catalog-header-tools">
          <label className="admin-catalog-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={codeSearch}
              onChange={(event) => setCodeSearch(event.target.value)}
              placeholder="Caută după cod..."
              aria-label="Caută produs după cod"
            />
          </label>

          <div className="admin-catalog-count">
            <strong>{filteredProducts.length}</strong>
            <span>{filteredProducts.length === 1 ? "produs" : "produse"}</span>
          </div>
        </div>
      </header>

      {loading && <div className="admin-catalog-state">Se încarcă produsele...</div>}
      {error && <div className="admin-catalog-state error">{error}</div>}

      {!loading && !error && products.length === 0 && (
        <div className="admin-catalog-state">Nu există produse în catalog.</div>
      )}

      {!loading && !error && products.length > 0 && filteredProducts.length === 0 && (
        <div className="admin-catalog-state">
          Nu există produse cu codul „{codeSearch.trim()}”.
        </div>
      )}

      {!loading && !error && filteredProducts.length > 0 && (
        <section className="admin-catalog-grid" aria-label="Catalog produse">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              className="admin-catalog-card"
              onClick={() => navigate(`/dashboard/products/${product.id}`)}
            >
              <div className="admin-catalog-card-image">
                <img
                  src={getProductImageCandidates(product.code)[0]}
                  data-fallback-index="0"
                  onError={(event) => loadNextProductImage(event, product.code)}
                  alt={product.name}
                />
                {Number(product.promotion) > 0 && (
                  <span className="admin-catalog-promo">-{product.promotion}%</span>
                )}
              </div>
              <div className="admin-catalog-card-body">
                <h2 title={product.name}>{product.name}</h2>
                <span>Cod produs: {product.code}</span>
              </div>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
