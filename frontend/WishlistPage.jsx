import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteFromWishlist, getWishlist } from "../api";
import "./HomePage.css";
import "./FavoritesPage.css";
import { getProductImageCandidates, loadNextProductImage } from "../productImages";

const WISHLIST_PER_PAGE = 4;

function getDiscountedPrice(price, promotion) {
  const promo = Number(promotion) || 0;
  return Number((Number(price) * (1 - promo / 100)).toFixed(2));
}

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

export default function WishlistPage({ embedded = false }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [busyProductId, setBusyProductId] = useState(null);
  const [error, setError] = useState("");
  const [wishlistPage, setWishlistPage] = useState(1);
  const [wishlistPageJumpOpen, setWishlistPageJumpOpen] = useState(false);
  const [wishlistPageJumpValue, setWishlistPageJumpValue] = useState("");
  const [wishlistPageJumpIndex, setWishlistPageJumpIndex] = useState(0);
  const [hoveredPagerControl, setHoveredPagerControl] = useState("");
  const wishlistPageJumpRef = useRef(null);

  async function loadWishlist() {
    const data = await getWishlist();
    setProducts(data);
  }

  useEffect(() => {
    let cancelled = false;

    getWishlist()
      .then((data) => {
        if (!cancelled) {
          setProducts(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Eroare la încărcarea wishlist-ului.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const totalWishlistPages = Math.max(
    1,
    Math.ceil(products.length / WISHLIST_PER_PAGE)
  );
  const visibleProducts = useMemo(() => {
    const start = (wishlistPage - 1) * WISHLIST_PER_PAGE;
    return products.slice(start, start + WISHLIST_PER_PAGE);
  }, [wishlistPage, products]);

  useEffect(() => {
    setWishlistPage((current) =>
      Math.min(Math.max(1, current), totalWishlistPages)
    );
  }, [totalWishlistPages]);

  useEffect(() => {
    if (!wishlistPageJumpOpen) return undefined;

    function handlePointerDown(event) {
      if (wishlistPageJumpRef.current?.contains(event.target)) return;
      setWishlistPageJumpOpen(false);
      setWishlistPageJumpValue("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [wishlistPageJumpOpen]);

  function getWishlistPageItems() {
    if (totalWishlistPages <= 4) {
      return Array.from({ length: totalWishlistPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalWishlistPages, wishlistPage]);

    if (wishlistPage <= 2) {
      pages.add(2);
    } else if (wishlistPage >= totalWishlistPages - 1) {
      pages.add(totalWishlistPages - 1);
    } else {
      pages.add(wishlistPage - 1);
      pages.add(wishlistPage + 1);
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

  function goToWishlistPage(page) {
    setWishlistPage(Math.min(Math.max(1, page), totalWishlistPages));
    setWishlistPageJumpOpen(false);
    setWishlistPageJumpValue("");
  }

  function submitWishlistPageJump() {
    const trimmed = wishlistPageJumpValue.trim();
    if (!/^-?\d+$/.test(trimmed)) return;

    goToWishlistPage(Number(trimmed));
  }

  async function handleRemove(event, productId) {
    event.stopPropagation();
    try {
      setBusyProductId(productId);
      setError("");
      await deleteFromWishlist(productId);
      await loadWishlist();
    } catch (err) {
      setError(err.message || "Eroare la eliminarea produsului din wishlist.");
    } finally {
      setBusyProductId(null);
    }
  }

  return (
    <div className={embedded ? "favorites-page-wrap embedded" : "favorites-page-wrap"}>
      {!embedded && (
        <div className="favorites-header">
          <h2>Wishlist stoc</h2>
        </div>
      )}

      <p style={{ color: "rgba(255,255,255,0.7)", marginTop: 0 }}>
        Te notificăm când produsele salvate revin în stoc.
      </p>

      {error && <p style={{ color: "salmon" }}>{error}</p>}

      {!error && products.length === 0 && (
        <div className="favorites-empty">
          <h3>Wishlist-ul este gol</h3>
          <p>Poți salva aici produsele care au stocul epuizat.</p>
          <button type="button" onClick={() => navigate("/store")}>
            Vezi produsele
          </button>
        </div>
      )}

      <div className="products-grid">
        {visibleProducts.map((product) => {
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
                onClick={(event) => handleRemove(event, product.id)}
                disabled={isBusy}
                aria-label="Elimină din wishlist"
                data-tooltip="Elimină din wishlist"
              >
                ×
              </button>

              {hasPromotion && <span className="promo-badge">-{product.promotion}%</span>}

              <img
                src={getProductImageCandidates(product.code)[0]}
                alt={product.name}
                onError={(event) => loadNextProductImage(event, product.code)}
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

              <button type="button" className="add-cart-inline-btn" disabled>
                Vei fi notificat la reapariția stocului
              </button>
            </div>
          );
        })}
        {products.length > 0 &&
          Array.from({
            length: Math.max(0, WISHLIST_PER_PAGE - visibleProducts.length),
          }).map((_, index) => (
            <div
              key={`wishlist-placeholder-${index}`}
              className="product-card favorite-card-placeholder"
            />
          ))}
      </div>

      {products.length > WISHLIST_PER_PAGE && (
        <div className="favorites-pagination" aria-label="Paginare wishlist">
          <button
            type="button"
            className={`favorites-pagination-btn ${
              hoveredPagerControl === "prev" && wishlistPage > 1 ? "is-hovered" : ""
            }`}
            onClick={() => goToWishlistPage(wishlistPage - 1)}
            onMouseEnter={() => setHoveredPagerControl("prev")}
            onMouseLeave={() => setHoveredPagerControl("")}
            disabled={wishlistPage <= 1}
          >
            Pagina anterioară
          </button>

          <div
            ref={wishlistPageJumpRef}
            className={`favorites-pagination-pages ${
              wishlistPageJumpOpen ? "has-jump" : ""
            }`}
          >
            {getWishlistPageItems().map((item, index) =>
              typeof item === "number" ? (
                <button
                  key={item}
                  type="button"
                  className={`favorites-pagination-number ${
                    item === wishlistPage ? "is-active" : ""
                  }`}
                  onClick={() => goToWishlistPage(item)}
                  aria-current={item === wishlistPage ? "page" : undefined}
                >
                  {item}
                </button>
              ) : (
                <button
                  key={item}
                  type="button"
                  className="favorites-pagination-number"
                  onClick={() => {
                    setWishlistPageJumpOpen(true);
                    setWishlistPageJumpValue("");
                    setWishlistPageJumpIndex(index);
                  }}
                >
                  ...
                </button>
              )
            )}

            {wishlistPageJumpOpen && (
              <div
                className="favorites-pagination-jump"
                style={{ left: wishlistPageJumpIndex * 44 + 19 }}
              >
                <input
                  value={wishlistPageJumpValue}
                  onChange={(event) => setWishlistPageJumpValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitWishlistPageJump();
                    }
                    if (event.key === "Escape") {
                      setWishlistPageJumpOpen(false);
                      setWishlistPageJumpValue("");
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
              hoveredPagerControl === "next" && wishlistPage < totalWishlistPages
                ? "is-hovered"
                : ""
            }`}
            onClick={() => goToWishlistPage(wishlistPage + 1)}
            onMouseEnter={() => setHoveredPagerControl("next")}
            onMouseLeave={() => setHoveredPagerControl("")}
            disabled={wishlistPage >= totalWishlistPages}
          >
            Pagina următoare
          </button>
        </div>
      )}
    </div>
  );
}
