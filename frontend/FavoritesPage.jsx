import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addCartItem, deleteFavorite, getCart, getFavorites, getToken } from "../api";
import "./HomePage.css";
import "./FavoritesPage.css";
import { getProductImageCandidates, loadNextProductImage } from "../productImages";

const FAVORITES_PER_PAGE = 4;

function getDiscountedPrice(price, promotion) {
  const promo = Number(promotion) || 0;
  return Number((Number(price) * (1 - promo / 100)).toFixed(2));
}

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

export default function FavoritesPage({ onCartChange, embedded = false, onLoginRequired }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [cartQtyByProduct, setCartQtyByProduct] = useState({});
  const [busyProductId, setBusyProductId] = useState(null);
  const [error, setError] = useState("");
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [favoritesPageJumpOpen, setFavoritesPageJumpOpen] = useState(false);
  const [favoritesPageJumpValue, setFavoritesPageJumpValue] = useState("");
  const [favoritesPageJumpIndex, setFavoritesPageJumpIndex] = useState(0);
  const [hoveredPagerControl, setHoveredPagerControl] = useState("");
  const favoritesPageJumpRef = useRef(null);

  async function loadFavorites() {
    const data = await getFavorites();
    setProducts(data);
  }

  async function loadCartQuantities() {
    try {
      const cart = await getCart();
      const nextMap = {};

      for (const item of cart.items || []) {
        nextMap[item.product_id] = item.quantity;
      }

      setCartQtyByProduct(nextMap);
    } catch {
      setCartQtyByProduct({});
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getToken()) {
        onLoginRequired?.();
        return;
      }

      try {
        const [favoritesData, cartData] = await Promise.all([
          getFavorites(),
          getCart().catch(() => ({ items: [] })),
        ]);

        if (cancelled) return;

        setProducts(favoritesData);

        const nextMap = {};
        for (const item of cartData.items || []) {
          nextMap[item.product_id] = item.quantity;
        }
        setCartQtyByProduct(nextMap);
        setError("");
      } catch (e) {
        if (!cancelled) setError(e.message || "Eroare la încărcarea favoritelor.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onLoginRequired]);

  const totalFavoritesPages = Math.max(
    1,
    Math.ceil(products.length / FAVORITES_PER_PAGE)
  );
  const visibleProducts = useMemo(() => {
    const start = (favoritesPage - 1) * FAVORITES_PER_PAGE;
    return products.slice(start, start + FAVORITES_PER_PAGE);
  }, [favoritesPage, products]);

  useEffect(() => {
    setFavoritesPage((current) =>
      Math.min(Math.max(1, current), totalFavoritesPages)
    );
  }, [totalFavoritesPages]);

  useEffect(() => {
    if (!favoritesPageJumpOpen) return undefined;

    function handlePointerDown(event) {
      if (favoritesPageJumpRef.current?.contains(event.target)) return;
      setFavoritesPageJumpOpen(false);
      setFavoritesPageJumpValue("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [favoritesPageJumpOpen]);

  function getFavoritesPageItems() {
    if (totalFavoritesPages <= 4) {
      return Array.from({ length: totalFavoritesPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalFavoritesPages, favoritesPage]);

    if (favoritesPage <= 2) {
      pages.add(2);
    } else if (favoritesPage >= totalFavoritesPages - 1) {
      pages.add(totalFavoritesPages - 1);
    } else {
      pages.add(favoritesPage - 1);
      pages.add(favoritesPage + 1);
    }

    const sorted = Array.from(pages).sort((a, b) => a - b);
    const result = [];

    sorted.forEach((page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) {
        result.push(`ellipsis-${index}`);
      }
      result.push(page);
    });

    return result;
  }

  function goToFavoritesPage(page) {
    setFavoritesPage(Math.min(Math.max(1, page), totalFavoritesPages));
    setFavoritesPageJumpOpen(false);
    setFavoritesPageJumpValue("");
  }

  function submitFavoritesPageJump() {
    const trimmed = favoritesPageJumpValue.trim();
    if (!/^-?\d+$/.test(trimmed)) return;

    goToFavoritesPage(Number(trimmed));
  }

  async function handleAddToCart(event, product) {
    event.stopPropagation();

    if (!product || product.quantity <= 0) return;

    const qtyInCart = cartQtyByProduct[product.id] || 0;
    if (qtyInCart >= product.quantity) {
      window.showCartToast?.("Ai deja cantitatea maximă disponibilă în coș.");
      return;
    }

    try {
      setBusyProductId(product.id);
      setError("");
      await addCartItem(product.id, 1);
      await loadCartQuantities();

      if (onCartChange) {
        await onCartChange();
      }

      window.showCartToast?.("Produsul a fost adăugat în coș.");
    } catch (e) {
      window.showCartToast?.(e.message || "Eroare la adăugarea în coș.");
    } finally {
      setBusyProductId(null);
    }
  }

  async function handleRemoveFavorite(event, productId) {
    event.stopPropagation();

    try {
      setBusyProductId(productId);
      setError("");
      await deleteFavorite(productId);
      await loadFavorites();
    } catch (e) {
      setError(e.message || "Eroare la eliminarea produsului din favorite.");
    } finally {
      setBusyProductId(null);
    }
  }

  return (
    <div className={embedded ? "favorites-page-wrap embedded" : "favorites-page-wrap"}>
      {!embedded && (
        <div className="favorites-header">
          <h2>Produse favorite</h2>
        </div>
      )}

      {error && <p style={{ color: "salmon" }}>{error}</p>}

      {!error && products.length === 0 && (
        <div className="favorites-empty">
          <h3>Lista de favorite este goală</h3>
          <p>Produsele salvate vor apărea aici.</p>
          <button type="button" onClick={() => navigate("/store")}>
            Vezi produsele
          </button>
        </div>
      )}

      <div className="products-grid">
        {visibleProducts.map((product) => {
          const qtyInCart = cartQtyByProduct[product.id] || 0;
          const reachedLimit = product.quantity > 0 && qtyInCart >= product.quantity;
          const isBusy = busyProductId === product.id;
          const hasPromotion = Number(product.promotion) > 0;
          const discountedPrice = getDiscountedPrice(product.price, product.promotion);

          return (
            <div
              key={product.id}
              className="product-card"
              onClick={() => navigate(`/products/${product.id}`)}
            >
              <button
                type="button"
                className="favorite-card-remove"
                onClick={(event) => handleRemoveFavorite(event, product.id)}
                disabled={isBusy}
                aria-label="Elimină de la favorite"
                data-tooltip="Elimină de la favorite"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
                </svg>
              </button>

              {hasPromotion && <span className="promo-badge">-{product.promotion}%</span>}

              <img
                src={getProductImageCandidates(product.code)[0]}
                alt={product.name}
                onError={(e) => loadNextProductImage(e, product.code)}
              />

              <h3>{product.name}</h3>

              <div className="product-price-wrap">
                {hasPromotion ? (
                  <>
                    <span className="product-old-price">{formatPrice(product.price)} lei</span>
                    <span className="product-price">{formatPrice(discountedPrice)} lei</span>
                  </>
                ) : (
                  <span className="product-price">{formatPrice(product.price)} lei</span>
                )}
              </div>

              <button
                type="button"
                className="add-cart-inline-btn"
                onClick={(event) => handleAddToCart(event, product)}
                disabled={product.quantity <= 0 || reachedLimit || isBusy}
              >
                <span className="add-cart-inline-icon" aria-hidden="true">
                  {"\u{1F6D2}"}
                </span>
                <span>
                  {product.quantity <= 0
                    ? "Stoc epuizat"
                    : reachedLimit
                    ? "Cantitate maximă în coș"
                    : isBusy
                    ? "Se actualizează..."
                    : "Adaugă în coș"}
                </span>
              </button>
            </div>
          );
        })}
        {products.length > 0 &&
          Array.from({
            length: Math.max(0, FAVORITES_PER_PAGE - visibleProducts.length),
          }).map((_, index) => (
            <div
              key={`favorite-placeholder-${index}`}
              className="product-card favorite-card-placeholder"
            />
          ))}
      </div>

      {products.length > FAVORITES_PER_PAGE && (
        <div className="favorites-pagination" aria-label="Paginare favorite">
          <button
            type="button"
            className={`favorites-pagination-btn ${
              hoveredPagerControl === "prev" && favoritesPage > 1 ? "is-hovered" : ""
            }`}
            onClick={() => goToFavoritesPage(favoritesPage - 1)}
            onMouseEnter={() => setHoveredPagerControl("prev")}
            onMouseLeave={() => setHoveredPagerControl("")}
            disabled={favoritesPage <= 1}
          >
            Pagina anterioară
          </button>

          <div
            ref={favoritesPageJumpRef}
            className={`favorites-pagination-pages ${
              favoritesPageJumpOpen ? "has-jump" : ""
            }`}
          >
            {getFavoritesPageItems().map((item, index) =>
              typeof item === "number" ? (
                <button
                  key={item}
                  type="button"
                  className={`favorites-pagination-number ${
                    item === favoritesPage ? "is-active" : ""
                  }`}
                  onClick={() => goToFavoritesPage(item)}
                  aria-current={item === favoritesPage ? "page" : undefined}
                >
                  {item}
                </button>
              ) : (
                <button
                  key={item}
                  type="button"
                  className="favorites-pagination-number"
                  onClick={() => {
                    setFavoritesPageJumpOpen(true);
                    setFavoritesPageJumpValue("");
                    setFavoritesPageJumpIndex(index);
                  }}
                >
                  ...
                </button>
              )
            )}

            {favoritesPageJumpOpen && (
              <div
                className="favorites-pagination-jump"
                style={{ left: favoritesPageJumpIndex * 44 + 19 }}
              >
                <input
                  value={favoritesPageJumpValue}
                  onChange={(event) => setFavoritesPageJumpValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitFavoritesPageJump();
                    }
                    if (event.key === "Escape") {
                      setFavoritesPageJumpOpen(false);
                      setFavoritesPageJumpValue("");
                    }
                  }}
                  inputMode="numeric"
                  autoFocus
                />
              </div>
            )}
          </div>

          <button
            type="button"
            className={`favorites-pagination-btn ${
              hoveredPagerControl === "next" && favoritesPage < totalFavoritesPages
                ? "is-hovered"
                : ""
            }`}
            onClick={() => goToFavoritesPage(favoritesPage + 1)}
            onMouseEnter={() => setHoveredPagerControl("next")}
            onMouseLeave={() => setHoveredPagerControl("")}
            disabled={favoritesPage >= totalFavoritesPages}
          >
            Pagina următoare
          </button>
        </div>
      )}
    </div>
  );
}
