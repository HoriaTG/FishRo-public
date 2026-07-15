import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addCartItem, getCart, getProducts } from "../api";
import { getProductImageCandidates, loadNextProductImage } from "../productImages";
import "./HomePage.css";

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

const MIN_PRICE_LIMIT = 0;
const MAX_PRICE_LIMIT = 2000;
const PRODUCT_ROWS_PER_PAGE = 3;

function getDiscountedPrice(price, promotion) {
  const promo = Number(promotion) || 0;
  return Number((Number(price) * (1 - promo / 100)).toFixed(2));
}

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

export default function HomePage({ searchText, onCartChange }) {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [selectedCategories, setSelectedCategories] = useState(() => new Set(CATEGORIES));
  const [minPrice, setMinPrice] = useState(MIN_PRICE_LIMIT);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE_LIMIT);
  const [cartQtyByProduct, setCartQtyByProduct] = useState({});
  const [addingProductId, setAddingProductId] = useState(null);
  const [productPage, setProductPage] = useState(1);
  const [productGridColumns, setProductGridColumns] = useState(1);
  const [productPageJumpOpen, setProductPageJumpOpen] = useState(false);
  const [productPageJumpValue, setProductPageJumpValue] = useState("");
  const [productPageJumpIndex, setProductPageJumpIndex] = useState(0);
  const [hoveredPagerControl, setHoveredPagerControl] = useState("");
  const productsGridRef = useRef(null);
  const productPageJumpRef = useRef(null);

  const navigate = useNavigate();

  async function loadProducts() {
    setError("");
    const data = await getProducts();
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
      try {
        const [productsData, cartData] = await Promise.all([
          getProducts(),
          getCart().catch(() => ({ items: [] })),
        ]);

        if (cancelled) return;

        setProducts(productsData);

        const nextMap = {};
        for (const item of cartData.items || []) {
          nextMap[item.product_id] = item.quantity;
        }
        setCartQtyByProduct(nextMap);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message || "Eroare la încărcarea produselor.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const grid = productsGridRef.current;
    if (!grid) return undefined;

    function updateColumns() {
      const columns = window
        .getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      setProductGridColumns(Math.max(1, columns || 1));
    }

    updateColumns();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateColumns);
      return () => window.removeEventListener("resize", updateColumns);
    }

    const observer = new ResizeObserver(updateColumns);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  function toggleCategory(category) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleMinPriceChange(e) {
    const value = Number(e.target.value);
    setMinPrice(Math.min(value, maxPrice));
  }

  function handleMaxPriceChange(e) {
    const value = Number(e.target.value);
    setMaxPrice(Math.max(value, minPrice));
  }

  async function handleAddToCart(event, product) {
    event.stopPropagation();

    if (!product || product.quantity <= 0) return;

    const currentQtyInCart = cartQtyByProduct[product.id] || 0;

    if (currentQtyInCart >= product.quantity) {
      window.showCartToast?.("Ai deja cantitatea maximă disponibilă în coș.");
      return;
    }

    try {
      setAddingProductId(product.id);
      setError("");

      await addCartItem(product.id, 1);
      await loadCartQuantities();
      await loadProducts();

      if (onCartChange) {
        await onCartChange();
      }

      window.showCartToast?.("Produsul a fost adăugat în coș.");
    } catch (e) {
      if (
        e.message === "Invalid token" ||
        e.message === "User not found"
      ) {
        window.showCartToast?.("Sesiunea a expirat. Autentifică-te din nou.");
        navigate("/login");
        return;
      }

      window.showCartToast?.(e.message || "Eroare la adăugarea în coș.");
    } finally {
      setAddingProductId(null);
    }
  }

  const normalizedSearch = (searchText || "").trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !normalizedSearch || (p.name || "").toLowerCase().includes(normalizedSearch);

      const matchesCategory = selectedCategories.has((p.category || "").toLowerCase());

      const effectivePrice = getDiscountedPrice(p.price, p.promotion);
      const matchesPrice = effectivePrice >= minPrice && effectivePrice <= maxPrice;

      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [products, normalizedSearch, selectedCategories, minPrice, maxPrice]);

  const productsPerPage = Math.max(
    PRODUCT_ROWS_PER_PAGE,
    productGridColumns * PRODUCT_ROWS_PER_PAGE
  );

  const totalProductPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / productsPerPage)
  );

  const visibleProducts = useMemo(() => {
    const start = (productPage - 1) * productsPerPage;
    return filteredProducts.slice(start, start + productsPerPage);
  }, [filteredProducts, productPage, productsPerPage]);

  useEffect(() => {
    setProductPage(1);
  }, [normalizedSearch, selectedCategories, minPrice, maxPrice, productsPerPage]);

  useEffect(() => {
    setProductPage((current) =>
      Math.min(Math.max(1, current), totalProductPages)
    );
  }, [totalProductPages]);

  useEffect(() => {
    if (!productPageJumpOpen) return undefined;

    function handlePointerDown(event) {
      if (productPageJumpRef.current?.contains(event.target)) return;
      setProductPageJumpOpen(false);
      setProductPageJumpValue("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [productPageJumpOpen]);

  function getProductPageItems() {
    if (totalProductPages <= 4) {
      return Array.from({ length: totalProductPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalProductPages, productPage]);

    if (productPage <= 2) {
      pages.add(2);
    } else if (productPage >= totalProductPages - 1) {
      pages.add(totalProductPages - 1);
    } else {
      pages.add(productPage - 1);
      pages.add(productPage + 1);
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

  function goToProductPage(page) {
    setProductPage(Math.min(Math.max(1, page), totalProductPages));
    setProductPageJumpOpen(false);
    setProductPageJumpValue("");
  }

  function submitProductPageJump() {
    const trimmed = productPageJumpValue.trim();
    if (!/^-?\d+$/.test(trimmed)) return;

    goToProductPage(Number(trimmed));
  }

  const minPercent =
    ((minPrice - MIN_PRICE_LIMIT) / (MAX_PRICE_LIMIT - MIN_PRICE_LIMIT)) * 100;

  const maxPercent =
    ((maxPrice - MIN_PRICE_LIMIT) / (MAX_PRICE_LIMIT - MIN_PRICE_LIMIT)) * 100;

  return (
    <div className="home-page-wrap">
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div className="shop-layout">
        <aside className="filters-sidebar">
          <div className="filters-card">
            <h3>Categorii</h3>

            <div className="category-list">
              {CATEGORIES.map((category) => (
                <label key={category} className="category-row">
                  <span className="category-name">{category}</span>
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(category)}
                    onChange={() => toggleCategory(category)}
                  />
                </label>
              ))}
            </div>

            <div className="price-filter">
              <h3>Preț</h3>

              <div className="range-slider">
                <div className="slider-track"></div>
                <div
                  className="slider-range"
                  style={{
                    left: `${minPercent}%`,
                    width: `${maxPercent - minPercent}%`,
                  }}
                ></div>

                <input
                  type="range"
                  min={MIN_PRICE_LIMIT}
                  max={MAX_PRICE_LIMIT}
                  value={minPrice}
                  onChange={handleMinPriceChange}
                  className="range-input range-input-min"
                />

                <input
                  type="range"
                  min={MIN_PRICE_LIMIT}
                  max={MAX_PRICE_LIMIT}
                  value={maxPrice}
                  onChange={handleMaxPriceChange}
                  className="range-input range-input-max"
                />
              </div>

              <div className="price-values">
                <span>Minim</span>
                <span>Maxim</span>
              </div>

              <div className="price-current-range">
                {minPrice} lei - {maxPrice} lei
              </div>
            </div>
          </div>
        </aside>

        <section className="products-section">
          <div className="products-header" aria-hidden="true" />

          {!error && filteredProducts.length === 0 && (
            <p className="empty-text">
              Nu există produse care să corespundă filtrelor selectate.
            </p>
          )}

          <div className="products-grid" ref={productsGridRef}>
            {visibleProducts.map((p) => {
              const qtyInCart = cartQtyByProduct[p.id] || 0;
              const reachedLimit = p.quantity > 0 && qtyInCart >= p.quantity;
              const isAdding = addingProductId === p.id;
              const hasPromotion = Number(p.promotion) > 0;
              const discountedPrice = getDiscountedPrice(p.price, p.promotion);

              return (
                <div
                  key={p.id}
                  className="product-card"
                  onClick={() => navigate(`/products/${p.id}`)}
                >

                  {Number(p.review_count) > 0 && (
                    <div className="product-rating-badge">
                      ★ {Number(p.average_rating).toFixed(1)}
                    </div>
                  )}

                  {hasPromotion && (
                    <span className="promo-badge">-{p.promotion}%</span>
                  )}

                  <img
                    src={getProductImageCandidates(p.code)[0]}
                    alt={p.name}
                    onError={(e) => loadNextProductImage(e, p.code)}
                  />

                  <h3>{p.name}</h3>

                  <div className="product-price-wrap">
                    {hasPromotion ? (
                      <>
                        <span className="product-old-price">{formatPrice(p.price)} lei</span>
                        <span className="product-price">{formatPrice(discountedPrice)} lei</span>
                      </>
                    ) : (
                      <span className="product-price">{formatPrice(p.price)} lei</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="add-cart-inline-btn"
                    onClick={(event) => handleAddToCart(event, p)}
                    disabled={p.quantity <= 0 || reachedLimit || isAdding}
                  >
                    <span className="add-cart-inline-icon" aria-hidden="true">
                      🛒
                    </span>
                    <span>
                      {p.quantity <= 0
                        ? "Stoc epuizat"
                        : reachedLimit
                        ? "Cantitate maximă în coș"
                        : isAdding
                        ? "Se adaugă..."
                        : "Adaugă în coș"}
                    </span>
                  </button>
                </div>
              );
            })}
            {filteredProducts.length > 0 &&
              Array.from({
                length: Math.max(0, productsPerPage - visibleProducts.length),
              }).map((_, index) => (
                <div
                  key={`product-placeholder-${index}`}
                  className="product-card product-card-placeholder"
                  aria-hidden="true"
                />
              ))}
          </div>

          {filteredProducts.length > productsPerPage && (
            <div className="products-pagination" aria-label="Paginare produse">
              <button
                type="button"
                className={`products-pagination-btn ${
                  hoveredPagerControl === "prev" && productPage > 1
                    ? "is-hovered"
                    : ""
                }`}
                onClick={() => goToProductPage(productPage - 1)}
                onMouseEnter={() => setHoveredPagerControl("prev")}
                onMouseLeave={() => setHoveredPagerControl("")}
                disabled={productPage <= 1}
              >
                Pagina anterioară
              </button>

              <div
                ref={productPageJumpRef}
                className={`products-pagination-pages ${
                  productPageJumpOpen ? "has-jump" : ""
                }`}
              >
                {getProductPageItems().map((item, index) =>
                  typeof item === "number" ? (
                    <button
                      key={item}
                      type="button"
                      className={`products-pagination-number ${
                        item === productPage ? "is-active" : ""
                      }`}
                      onClick={() => goToProductPage(item)}
                      aria-current={item === productPage ? "page" : undefined}
                    >
                      {item}
                    </button>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className="products-pagination-number"
                      onClick={() => {
                        setProductPageJumpOpen(true);
                        setProductPageJumpValue("");
                        setProductPageJumpIndex(index);
                      }}
                    >
                      ...
                    </button>
                  )
                )}

                {productPageJumpOpen && (
                  <div
                    className="products-pagination-jump"
                    style={{ left: productPageJumpIndex * 44 + 19 }}
                  >
                    <input
                      value={productPageJumpValue}
                      onChange={(event) => setProductPageJumpValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitProductPageJump();
                        }
                        if (event.key === "Escape") {
                          setProductPageJumpOpen(false);
                          setProductPageJumpValue("");
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
                className={`products-pagination-btn ${
                  hoveredPagerControl === "next" && productPage < totalProductPages
                    ? "is-hovered"
                    : ""
                }`}
                onClick={() => goToProductPage(productPage + 1)}
                onMouseEnter={() => setHoveredPagerControl("next")}
                onMouseLeave={() => setHoveredPagerControl("")}
                disabled={productPage >= totalProductPages}
              >
                Pagina următoare
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
