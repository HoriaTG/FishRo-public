import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addCartItem,
  addFavorite,
  addToWishlist,
  deleteFavorite,
  deleteFromWishlist,
  getFavoriteIds,
  getCart,
  getProductById,
  getProductReviews,
  getToken,
  getWishlistIds,
  submitProductReview,
} from "../api";
import "./ProductPage.css";
import { getProductGalleryCandidates } from "../productImages";

const PRODUCT_BACKGROUND_REFRESH_MS = 15000;

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function getDiscountedPrice(price, promotion) {
  const promo = Number(promotion) || 0;
  return Number((Number(price) * (1 - promo / 100)).toFixed(2));
}

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function renderStars(rating) {
  const safeRating = Number(rating) || 0;
  return Array.from({ length: 5 }, (_, index) =>
    index < safeRating ? "★" : "☆"
  ).join("");
}

function renderFractionalStars(rating) {
  const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));

  return Array.from({ length: 5 }, (_, index) => {
    const fill = Math.max(0, Math.min(1, safeRating - index)) * 100;

    return (
      <span
        key={index}
        className="fractionalStar"
        style={{ "--star-fill": `${fill}%` }}
        aria-hidden="true"
      >
        ★
      </span>
    );
  });
}

function getReviewTime(review) {
  const value = review.updated_at || review.created_at;
  if (!value) return 0;

  const normalized =
    typeof value === "string" &&
    !value.endsWith("Z") &&
    !/[+-]\d{2}:\d{2}$/.test(value)
      ? `${value}Z`
      : value;

  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export default function ProductPage({ onCartChange, onFavoriteAdded, onFavoriteAuthRequired }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [images, setImages] = useState([]);
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [cartQtyForProduct, setCartQtyForProduct] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [isWishlist, setIsWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  const [reviewsData, setReviewsData] = useState(null);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [visibleReviewCount, setVisibleReviewCount] = useState(5);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  });

  const loadReviews = useCallback(async () => {
    const data = await getProductReviews(id);
    setReviewsData(data);
    setReviewsError("");

    const myReview = (data.reviews || []).find((review) => review.is_mine);

    if (myReview) {
      setReviewForm({
        rating: myReview.rating,
        comment: myReview.comment || "",
      });
      setIsEditingReview(false);
    } else {
      setReviewForm({
        rating: 5,
        comment: "",
      });
      setIsEditingReview(true);
    }
  }, [id]);

  const loadProductAndCart = useCallback(
    async ({ keepGallery = false } = {}) => {
      const data = await getProductById(id);
      setProduct(data);
      if (data.quantity > 0) {
        setIsWishlist(false);
      }

      if (!keepGallery) {
        const candidates = getProductGalleryCandidates(data.code);

        const checks = await Promise.all(candidates.map(loadImage));
        const existing = candidates.filter((_, i) => checks[i]);
        const safeImages = existing.length
          ? existing
          : ["/images/products/placeholder.jpg"];

        setImages(safeImages);
        setIdx(0);
        setZoomed(false);
      }

      try {
        const cart = await getCart();
        const existingItem = (cart.items || []).find(
          (item) => Number(item.product_id) === Number(data.id)
        );
        setCartQtyForProduct(existingItem?.quantity || 0);
      } catch {
        setCartQtyForProduct(0);
      }
    },
    [id]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");
        setReviewsError("");

        const [productData, reviews] = await Promise.all([
          getProductById(id),
          getProductReviews(id),
        ]);

        if (cancelled) return;

        setProduct(productData);
        setReviewsData(reviews);

        getFavoriteIds()
          .then((favoriteIds) => {
            if (!cancelled) {
              setIsFavorite(
                favoriteIds.map(Number).includes(Number(productData.id))
              );
            }
          })
          .catch(() => {
            if (!cancelled) setIsFavorite(false);
          });

        getWishlistIds()
          .then((wishlistIds) => {
            if (!cancelled) {
              setIsWishlist(
                productData.quantity <= 0 &&
                  wishlistIds.map(Number).includes(Number(productData.id))
              );
            }
          })
          .catch(() => {
            if (!cancelled) setIsWishlist(false);
          });

        const myReview = (reviews.reviews || []).find((review) => review.is_mine);
        if (myReview) {
          setReviewForm({
            rating: myReview.rating,
            comment: myReview.comment || "",
          });
          setIsEditingReview(false);
        } else {
          setReviewForm({
            rating: 5,
            comment: "",
          });
          setIsEditingReview(true);
        }

        const candidates = getProductGalleryCandidates(productData.code);

        const checks = await Promise.all(candidates.map(loadImage));
        const existing = candidates.filter((_, i) => checks[i]);
        const safeImages = existing.length
          ? existing
          : ["/images/products/placeholder.jpg"];

        if (!cancelled) {
          setImages(safeImages);
          setIdx(0);
          setZoomed(false);
        }

        try {
          const cart = await getCart();
          if (!cancelled) {
            const existingItem = (cart.items || []).find(
              (item) => Number(item.product_id) === Number(productData.id)
            );
            setCartQtyForProduct(existingItem?.quantity || 0);
          }
        } catch {
          if (!cancelled) {
            setCartQtyForProduct(0);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Eroare la încărcarea produsului.");
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!anim) return;
    const t = setTimeout(() => setAnim(""), 220);
    return () => clearTimeout(t);
  }, [anim]);

  useEffect(() => {
    if (!product) return undefined;

    async function refreshProductData() {
      if (document.hidden) return;

      try {
        await loadProductAndCart({ keepGallery: true });
      } catch {
        // silent polling
      }
    }

    const intervalId = setInterval(
      refreshProductData,
      PRODUCT_BACKGROUND_REFRESH_MS
    );
    document.addEventListener("visibilitychange", refreshProductData);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshProductData);
    };
  }, [product, loadProductAndCart]);

  useEffect(() => {
    if (!reviewMsg) return;
    const t = setTimeout(() => setReviewMsg(""), 2500);
    return () => clearTimeout(t);
  }, [reviewMsg]);

  useEffect(() => {
    setVisibleReviewCount(5);
  }, [id]);

  function prev() {
    if (!images.length || idx <= 0) return;
    setZoomed(false);
    setAnim("slide-right");
    setIdx((v) => v - 1);
  }

  function next() {
    if (!images.length || idx >= images.length - 1) return;
    setZoomed(false);
    setAnim("slide-left");
    setIdx((v) => v + 1);
  }

  function setOriginFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setOrigin({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  }

  function handleImageClick(e) {
    setOriginFromEvent(e);
    setZoomed((z) => !z);
  }

  function handleImageMove(e) {
    if (!zoomed) return;
    setOriginFromEvent(e);
  }

  async function handleAddToCart() {
    if (!product || product.quantity <= 0) return;
    if (cartQtyForProduct >= product.quantity) return;

    try {
      setError("");

      await addCartItem(product.id, 1);
      await loadProductAndCart({ keepGallery: true });

      if (onCartChange) {
        await onCartChange();
      }

      window.showCartToast?.("Produsul a fost adăugat în coș.");
    } catch (e) {
      setError(e.message || "Eroare la adăugarea în coș.");
    }
  }

  async function handleToggleFavorite() {
    if (!product || favoriteBusy) return;

    if (!getToken()) {
      onFavoriteAuthRequired?.();
      return;
    }

    try {
      setFavoriteBusy(true);
      setError("");

      if (isFavorite) {
        await deleteFavorite(product.id);
        setIsFavorite(false);
      } else {
        await addFavorite(product.id);
        setIsFavorite(true);
        onFavoriteAdded?.();
      }
    } catch (e) {
      setError(e.message || "Eroare la actualizarea favoritelor.");
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function handleToggleWishlist() {
    if (!product || wishlistBusy || product.quantity > 0) return;

    if (!getToken()) {
      window.showCartToast?.("Autentifică-te pentru a folosi wishlist-ul.");
      navigate("/login");
      return;
    }

    try {
      setWishlistBusy(true);
      setError("");

      if (isWishlist) {
        await deleteFromWishlist(product.id);
        setIsWishlist(false);
        window.showCartToast?.("Produsul a fost eliminat din wishlist.");
      } else {
        await addToWishlist(product.id);
        setIsWishlist(true);
        window.showCartToast?.(
          "Produs salvat. Te vom notifica atunci când revine în stoc."
        );
      }
    } catch (e) {
      setError(e.message || "Eroare la actualizarea wishlist-ului.");
    } finally {
      setWishlistBusy(false);
    }
  }

async function handleSubmitReview() {
  try {
    setReviewSubmitting(true);
    setReviewsError("");
    setReviewMsg("");

    await submitProductReview(id, {
      rating: reviewForm.rating,
      comment: reviewForm.comment,
    });

    await loadReviews();
    setReviewMsg("Recenzia a fost salvată cu succes.");
  } catch (e) {
    setReviewsError(e.message || "Eroare la salvarea recenziei.");
  } finally {
    setReviewSubmitting(false);
  }
}

  const tech = useMemo(() => {
    if (!product?.tech_details) return [];

    try {
      const parsed = JSON.parse(product.tech_details);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [product?.tech_details]);

  if (error) {
    return (
      <div className="product-wrap">
        <p className="err">{error}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-wrap">
        <p>Loading...</p>
      </div>
    );
  }

  const atStart = idx === 0;
  const atEnd = idx === images.length - 1;

  const descriptionText = product.description || "Descriere indisponibilă momentan.";
  const videoUrl = product.video_url?.trim();
  const techRows = tech.length ? tech : [["-", "-"]];

  const stockClass = product.quantity === 0 ? "out" : product.quantity <= 3 ? "low" : "ok";
  const stockText =
    product.quantity === 0
      ? "Stoc epuizat"
      : product.quantity <= 3
      ? "Stoc limitat"
      : "În stoc";

  const reachedCartLimit = product.quantity > 0 && cartQtyForProduct >= product.quantity;
  const addButtonDisabled = product.quantity === 0 || reachedCartLimit;

  const hasPromotion = Number(product.promotion) > 0;
  const finalPrice = hasPromotion
    ? getDiscountedPrice(product.price, product.promotion)
    : product.price;

  const hasToken = !!getToken();
  const allReviews = reviewsData?.reviews || [];
  const myReview = allReviews.find((review) => review.is_mine);
  const otherTextReviews = allReviews
    .filter((review) => !review.is_mine && review.comment?.trim())
    .sort((a, b) => getReviewTime(b) - getReviewTime(a));
  const displayableReviews = myReview
    ? [myReview, ...otherTextReviews]
    : otherTextReviews;
  const visibleReviews = displayableReviews.slice(0, visibleReviewCount);
  const hasMoreReviews = visibleReviewCount < displayableReviews.length;
  const shouldShowReviewForm =
    hasToken &&
    ((!myReview && reviewsData?.can_review) || (myReview && isEditingReview));

  return (
    <div className="product-wrap">
      <div className="top-grid">
        <div className="card">
          <div className="gallery">
            <div className="imgStage">
              <img
                key={images[idx]}
                className={`mainImg ${anim} ${zoomed ? "zoomed" : ""}`}
                src={images[idx]}
                alt={product.name}
                style={zoomed ? { transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
                onClick={handleImageClick}
                onMouseMove={handleImageMove}
              />

              <button
                className={`navArrow left ${atStart ? "disabled" : ""}`}
                onClick={prev}
                disabled={atStart}
                aria-label="Imagine precedentă"
              >
                ‹
              </button>

              <button
                className={`navArrow right ${atEnd ? "disabled" : ""}`}
                onClick={next}
                disabled={atEnd}
                aria-label="Imagine următoare"
              >
                ›
              </button>
            </div>

            <div className="dots">
              {images.map((_, i) => (
                <button
                  key={i}
                  className={`dot ${i === idx ? "active" : ""}`}
                  onClick={() => {
                    setZoomed(false);
                    setIdx(i);
                  }}
                  aria-label={`Imagine ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="productHeaderRow">
            <h1 className="title">{product.name}</h1>
          </div>

          <div className="productMetaRow">
            <div className="ratingSummaryBox">
              <div className="ratingSummaryTop">
                <span
                  className="ratingStarsStatic fractionalStars"
                  aria-label={`${Number(reviewsData?.average_rating || 0).toFixed(2)} din 5 stele`}
                >
                {renderFractionalStars(reviewsData?.average_rating || 0)}
              </span>
              <span className="ratingSummaryText">
                {reviewsData?.total_reviews
                  ? `${reviewsData.average_rating.toFixed(2)} / 5 · `
                  : "Fără recenzii"}
              </span>
              {!!reviewsData?.total_reviews && (
                <a className="reviewsJumpLink" href="#product-reviews">
                  {reviewsData.total_reviews}{" "}
                  {reviewsData.total_reviews === 1 ? "recenzie" : "recenzii"}
                </a>
              )}
            </div>
          </div>

            <div className="productHeaderActions">
              <button
                type="button"
                className={`wishlistBtn ${isWishlist ? "active" : ""}`}
                onClick={handleToggleWishlist}
                disabled={wishlistBusy || product.quantity > 0}
                aria-label={
                  product.quantity > 0
                    ? "Wishlist disponibil doar când stocul este epuizat"
                    : isWishlist
                      ? "Elimină din wishlist"
                      : "Anunță-mă când revine în stoc"
                }
                data-tooltip={
                  product.quantity > 0
                    ? "Disponibil doar la stoc epuizat"
                    : isWishlist
                      ? "Elimină din wishlist"
                      : "Anunță-mă când revine în stoc"
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="23"
                  height="23"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                </svg>
              </button>

              <button
                type="button"
                className={`favoriteBtn ${isFavorite ? "active" : ""}`}
                onClick={handleToggleFavorite}
                disabled={favoriteBusy}
                aria-label={isFavorite ? "Elimină de la favorite" : "Adaugă la favorite"}
                data-tooltip={isFavorite ? "Elimină de la favorite" : "Adaugă la favorite"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="priceRow">
            <div className="price">{formatPrice(finalPrice)} lei</div>

            <div
              className={`stock ${stockClass}`}
              data-tooltip={
                product.quantity > 0 ? `${product.quantity} produse rămase` : undefined
              }
            >
              {stockText}
            </div>
          </div>

          <button className="addBtn" disabled={addButtonDisabled} onClick={handleAddToCart}>
            {reachedCartLimit ? "Cantitatea maximă este în coș" : "Adaugă în coș"}
          </button>

          {product.quantity > 0 && (
            <p className="note">
              În coșul tău: <strong>{cartQtyForProduct}</strong> / {product.quantity}
            </p>
          )}
        </div>
      </div>

      <div className="card below">
        <h2>Descriere</h2>
        <p className="desc">{descriptionText}</p>
      </div>

      <div className="card below">
        <h2>Detalii tehnice</h2>
        <table className="techTable">
          <tbody>
            {techRows.map(([k, v], i) => (
              <tr key={`${k}-${i}`}>
                <td className="k">{k}</td>
                <td className="v">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {videoUrl && (
        <div className="card below">
          <h2>Video</h2>
          <div className="videoWrap">
            <iframe
              src={videoUrl}
              title="Product video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <div className="card below productReviewsSection" id="product-reviews">
        <div className="reviewsHeader">
          <h2 style={{ margin: 0 }}>Recenzii</h2>
          <div className="reviewsHeaderMeta">
            {reviewsData?.total_reviews || 0}{" "}
            {reviewsData?.total_reviews === 1 ? "recenzie" : "recenzii"}
          </div>
        </div>

        {shouldShowReviewForm && (
          <div className="reviewFormCard">
            <h3>{myReview ? "Editează recenzia ta" : "Lasă o recenzie"}</h3>

            <div className="reviewRatingRow">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`starBtn ${reviewForm.rating >= value ? "active" : ""}`}
                  onClick={() =>
                    setReviewForm((prev) => ({
                      ...prev,
                      rating: value,
                    }))
                  }
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              className="reviewTextarea"
              placeholder="Scrie părerea ta despre produs..."
              value={reviewForm.comment}
              onChange={(e) =>
                setReviewForm((prev) => ({
                  ...prev,
                  comment: e.target.value,
                }))
              }
            />

            <div className="reviewFormActions">
              <button
                className="reviewSubmitBtn"
                onClick={handleSubmitReview}
                disabled={reviewSubmitting}
              >
                {reviewSubmitting
                  ? "Se salvează..."
                  : myReview
                  ? "Actualizează recenzia"
                  : "Trimite recenzia"}
              </button>

              {myReview && (
                <button
                  type="button"
                  className="reviewCancelBtn"
                  onClick={() => {
                    setReviewForm({
                      rating: myReview.rating,
                      comment: myReview.comment || "",
                    });
                    setIsEditingReview(false);
                    setReviewsError("");
                  }}
                >
                  Renunță
                </button>
              )}
            </div>

            {reviewMsg && <p className="reviewOk">{reviewMsg}</p>}
          </div>
        )}

        {hasToken && !myReview && !reviewsData?.can_review && (
          <p className="reviewHint">
            Poți lăsa o recenzie doar după ce ai cumpărat acest produs.
          </p>
        )}

        {!hasToken && (
          <p className="reviewHint">
            Autentifică-te și cumpără produsul pentru a putea lăsa o recenzie.
          </p>
        )}

        {reviewsError && <p className="err">{reviewsError}</p>}

        <div className="reviewsList">
          {displayableReviews.length === 0 && (
            <p className="reviewEmptyText">Nu există încă recenzii pentru acest produs.</p>
          )}

          {visibleReviews.map((review) => (
            <div key={review.id} className="reviewItem">
              <div className="reviewTopRow">
                <div className="reviewUser">
                  {review.username}
                  {review.is_mine && <span className="mineBadge">Recenzia ta</span>}
                </div>
                <div className="reviewStars">{renderStars(review.rating)}</div>
              </div>

              {review.comment?.trim() ? (
                <div className="reviewComment">{review.comment}</div>
              ) : null}

              <div className="reviewBottomRow">
                <div className="reviewDate">
                  {review.updated_at
                    ? new Date(
                        typeof review.updated_at === "string" &&
                          !review.updated_at.endsWith("Z") &&
                          !/[+-]\d{2}:\d{2}$/.test(review.updated_at)
                          ? `${review.updated_at}Z`
                          : review.updated_at
                      ).toLocaleString()
                    : ""}
                </div>

                {review.is_mine && !isEditingReview && (
                  <button
                    type="button"
                    className="reviewEditBtn"
                    onClick={() => {
                      setReviewForm({
                        rating: review.rating,
                        comment: review.comment || "",
                      });
                      setIsEditingReview(true);
                      setReviewsError("");
                      setReviewMsg("");
                    }}
                  >
                    Editează
                  </button>
                )}
              </div>
            </div>
          ))}

          {hasMoreReviews && (
            <button
              type="button"
              className="reviewsLoadMoreBtn"
              onClick={() => setVisibleReviewCount((count) => count + 5)}
            >
              Click aici pentru a afișa mai multe recenzii
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
