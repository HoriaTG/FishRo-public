import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { deleteCartItem, getCart } from "../api";
import { loadNextProductImage } from "../productImages";

function formatPrice(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

const NAV_CONTROL_HEIGHT = 44;

export default function Navbar({
  me,
  onLogout,
  searchText,
  onSearchChange,
  cartCount,
  unreadTicketCount,
  unreadOrderCount,
  pendingApprovalCount,
  unreadNotificationCount,
  onNotificationsClick,
  onCartChange,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isDashboardHovered, setIsDashboardHovered] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isAccountHovered, setIsAccountHovered] = useState(false);
  const [isNotificationHovered, setIsNotificationHovered] = useState(false);
  const [cartToast, setCartToast] = useState("");
  const [cartToastVisible, setCartToastVisible] = useState(false);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [cartPreviewLoading, setCartPreviewLoading] = useState(false);
  const [cartPreviewItems, setCartPreviewItems] = useState([]);
  const [cartPreviewRemovingId, setCartPreviewRemovingId] = useState(null);
  const [hoveredCartPreviewId, setHoveredCartPreviewId] = useState(null);
  const [hoveredCartPreviewRemoveId, setHoveredCartPreviewRemoveId] = useState(null);
  const dashboardRef = useRef(null);
  const accountMenuRef = useRef(null);
  const cartToastTimeoutRef = useRef(null);
  const cartPreviewCloseTimeoutRef = useRef(null);
  const cartPreviewPanelRef = useRef(null);

  const showSearch = location.pathname === "/store";
  const isStaff = me?.role === "moderator" || me?.role === "admin";
  const isAdmin = me?.role === "admin";
  const accountDisplayName = me?.full_name?.trim() || me?.username || "Cont";
  const dashboardUnreadCount =
    (Number(unreadTicketCount) || 0) +
    (Number(unreadOrderCount) || 0) +
    (Number(pendingApprovalCount) || 0);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dashboardRef.current && !dashboardRef.current.contains(event.target)) {
        setIsDashboardOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    window.showCartToast = (message) => {
      if (cartToastTimeoutRef.current) {
        clearTimeout(cartToastTimeoutRef.current);
      }

      setCartToast(message || "Produsul a fost adăugat în coș.");
      setCartToastVisible(true);

      cartToastTimeoutRef.current = setTimeout(() => {
        setCartToastVisible(false);
      }, 2000);
    };

    return () => {
      delete window.showCartToast;
      if (cartToastTimeoutRef.current) {
        clearTimeout(cartToastTimeoutRef.current);
      }
      if (cartPreviewCloseTimeoutRef.current) {
        clearTimeout(cartPreviewCloseTimeoutRef.current);
      }
    };
  }, []);

  function handleDashboardLinkClick() {
    setIsDashboardOpen(false);
  }

  function handleAccountLinkClick() {
    setIsAccountMenuOpen(false);
  }

  function handleAccountLogout() {
    setIsAccountMenuOpen(false);
    onLogout?.();
  }

  function handleAccountMouseLeave() {
    setIsAccountHovered(false);
  }

  async function handleCartPreviewEnter() {
    if (cartPreviewCloseTimeoutRef.current) {
      clearTimeout(cartPreviewCloseTimeoutRef.current);
      cartPreviewCloseTimeoutRef.current = null;
    }

    if (cartCount <= 0) {
      setCartPreviewOpen(false);
      return;
    }

    setCartPreviewOpen(true);

    if (cartPreviewOpen && cartPreviewItems.length > 0) {
      return;
    }

    setCartPreviewLoading(true);

    try {
      const cart = await getCart();
      setCartPreviewItems(cart.items || []);
    } catch {
      setCartPreviewItems([]);
    } finally {
      setCartPreviewLoading(false);
    }
  }

  function handleCartPreviewLeave() {
    if (cartPreviewCloseTimeoutRef.current) {
      clearTimeout(cartPreviewCloseTimeoutRef.current);
      cartPreviewCloseTimeoutRef.current = null;
    }
    setCartPreviewOpen(false);
  }

  function handleCartPreviewWheel(event) {
    if (!cartPreviewOpen || cartCount <= 0 || !cartPreviewPanelRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    cartPreviewPanelRef.current.scrollTop += event.deltaY;
  }

  function openCartPreviewProduct(productId) {
    setCartPreviewOpen(false);
    navigate(`/products/${productId}`);
  }

  async function handleRemoveCartPreviewItem(event, productId) {
    event.stopPropagation();

    try {
      setCartPreviewRemovingId(productId);
      const cart = await deleteCartItem(productId);
      setCartPreviewItems(cart.items || []);
      window.dispatchEvent(
        new CustomEvent("fishro-cart-updated", {
          detail: { cart },
        })
      );
      await onCartChange?.();
    } catch {
      window.showCartToast?.("Eroare la eliminarea produsului din coș.");
    } finally {
      setCartPreviewRemovingId(null);
    }
  }

  function liftControl(event) {
    if (!event.currentTarget.dataset.prevBorderColor) {
      event.currentTarget.dataset.prevBorderColor = event.currentTarget.style.borderColor;
      event.currentTarget.dataset.prevBoxShadow = event.currentTarget.style.boxShadow;
      event.currentTarget.dataset.prevTransform = event.currentTarget.style.transform;
    }

    event.currentTarget.style.transform = "translateY(-1px)";
    event.currentTarget.style.borderColor = "rgba(96,165,250,0.48)";
    event.currentTarget.style.boxShadow =
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)";
  }

  function settleControl(event) {
    event.currentTarget.style.transform = event.currentTarget.dataset.prevTransform || "";
    event.currentTarget.style.borderColor = event.currentTarget.dataset.prevBorderColor || "";
    event.currentTarget.style.boxShadow = event.currentTarget.dataset.prevBoxShadow || "";
    delete event.currentTarget.dataset.prevTransform;
    delete event.currentTarget.dataset.prevBorderColor;
    delete event.currentTarget.dataset.prevBoxShadow;
  }

  return (
    <div style={styles.nav}>
      <Link to="/" style={styles.brand} className="logo-wrapper">
        <span className="logo-text">FishRo</span>
        <span className="fish-swim">🐟</span>
      </Link>

      {showSearch && (
        <div style={styles.searchWrap}>
          <div style={styles.searchBox}>
            <input
              type="text"
              placeholder="Caută produse după nume..."
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              style={styles.searchInput}
            />

            <button type="submit" style={styles.searchIcon} aria-label="CautÄƒ produse">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M21 21l-4.35-4.35m1.6-4.15a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div style={styles.right}>
        <div
          style={styles.cartArea}
          onMouseEnter={handleCartPreviewEnter}
          onMouseLeave={handleCartPreviewLeave}
          onWheel={handleCartPreviewWheel}
        >
          <Link
            to="/cart"
            state={cartCount === 0 ? { backgroundLocation: location } : undefined}
            style={styles.cartLink}
            aria-label="Coș cumpărături"
            onMouseEnter={liftControl}
            onMouseLeave={settleControl}
          >
            <span style={styles.iconWrap}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M3 4h2l2.2 10.2a1 1 0 00.98.8h8.9a1 1 0 00.97-.76L20 7H7"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="19" r="1.6" fill="white" />
                <circle cx="17" cy="19" r="1.6" fill="white" />
              </svg>

              {cartCount > 0 && <span style={styles.badge}>{cartCount}</span>}
            </span>
            <span style={styles.cartText}>Coșul meu</span>
          </Link>

          {cartPreviewOpen && cartCount > 0 && (
            <div style={styles.cartPreview}>
              <div style={styles.cartPreviewPointer} />
              <div ref={cartPreviewPanelRef} style={styles.cartPreviewPanel}>
                {cartPreviewLoading && (
                  <div style={styles.cartPreviewMuted}>Se încarcă...</div>
                )}

                {!cartPreviewLoading && cartPreviewItems.length === 0 && (
                  <div style={styles.cartPreviewMuted}>Coșul este gol.</div>
                )}

                {!cartPreviewLoading &&
                  cartPreviewItems.map((item) => (
                    <div
                      key={item.product_id}
                      style={{
                        ...styles.cartPreviewItem,
                        ...(hoveredCartPreviewId === item.product_id
                          ? styles.cartPreviewItemHover
                          : {}),
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCartPreviewProduct(item.product_id)}
                      onMouseEnter={() => setHoveredCartPreviewId(item.product_id)}
                      onMouseLeave={() => setHoveredCartPreviewId(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCartPreviewProduct(item.product_id);
                        }
                      }}
                    >
                      <img
                        src={item.image_url}
                        alt={item.product_name}
                        style={styles.cartPreviewImage}
                        onError={(event) =>
                            loadNextProductImage(event, item.product_code)
                        }
                      />
                      <div style={styles.cartPreviewInfo}>
                        <div style={styles.cartPreviewName}>
                          {item.quantity} x {item.product_name}
                        </div>
                        <div style={styles.cartPreviewPrice}>
                          {formatPrice(Number(item.unit_price) * Number(item.quantity))} lei
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{
                          ...styles.cartPreviewRemove,
                          ...(hoveredCartPreviewRemoveId === item.product_id
                            ? styles.cartPreviewRemoveHover
                            : {}),
                          ...(cartPreviewRemovingId === item.product_id
                            ? styles.cartPreviewRemoveDisabled
                            : {}),
                        }}
                        onClick={(event) =>
                          handleRemoveCartPreviewItem(event, item.product_id)
                        }
                        onMouseEnter={() => setHoveredCartPreviewRemoveId(item.product_id)}
                        onMouseLeave={() => setHoveredCartPreviewRemoveId(null)}
                        disabled={cartPreviewRemovingId === item.product_id}
                        aria-label={`Elimină ${item.product_name} din coș`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M9 4h6l1 2h4"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 6h16"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M7 9l1 11h8l1-11"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 12v5M14 12v5"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}

                {!cartPreviewLoading && cartPreviewItems.length > 0 && (
                  <div style={styles.cartPreviewTotal}>
                    <span>TOTAL:</span>
                    <strong>
                      {formatPrice(
                        cartPreviewItems.reduce(
                          (sum, item) =>
                            sum + Number(item.unit_price) * Number(item.quantity),
                          0
                        )
                      )}{" "}
                      lei
                    </strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {cartToastVisible && !cartPreviewOpen && (
            <div style={styles.cartToastWrap} role="status" aria-live="polite">
              <div style={styles.cartToastPointer} />
              <div style={styles.cartToast}>{cartToast}</div>
            </div>
          )}
        </div>

        {!me && (
          <>
            <Link
              to="/login"
              state={{ backgroundLocation: location }}
              style={styles.link}
              onMouseEnter={liftControl}
              onMouseLeave={settleControl}
            >
              Login
            </Link>
            <Link
              to="/register"
              state={{ backgroundLocation: location }}
              style={styles.link}
              onMouseEnter={liftControl}
              onMouseLeave={settleControl}
            >
              Register
            </Link>
          </>
        )}

        {me && (
          <>
            {!isStaff && (
            <div
              style={styles.notificationWrap}
              onMouseEnter={() => setIsNotificationHovered(true)}
              onMouseLeave={() => setIsNotificationHovered(false)}
            >
            <button
              type="button"
              style={styles.notificationButton}
              onClick={onNotificationsClick}
              onMouseEnter={liftControl}
              onMouseLeave={settleControl}
              aria-label="Notificări"
            >
              <span style={styles.iconWrap}>
                <span style={styles.bellIcon}>{"\u{1F514}"}</span>
                {unreadNotificationCount > 0 && (
                  <span style={styles.badge}>{unreadNotificationCount}</span>
                )}
              </span>
            </button>

              {isNotificationHovered && (
                <div style={styles.dashboardTooltip}>Notificări</div>
              )}
            </div>
            )}

            <div
              ref={accountMenuRef}
              style={styles.accountMenuWrap}
              onMouseEnter={() => setIsAccountHovered(true)}
              onMouseLeave={handleAccountMouseLeave}
            >
              <button
                type="button"
                style={{
                  ...styles.accountButton,
                  ...(!isAccountMenuOpen && isAccountHovered
                    ? styles.accountButtonHover
                    : {}),
                  ...(isAccountMenuOpen ? styles.accountButtonOpen : {}),
                }}
                onClick={(event) => {
                  setIsAccountMenuOpen((prev) => !prev);
                  event.currentTarget.blur();
                }}
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
              >
                <span style={styles.accountName}>{accountDisplayName}</span>
                <span style={styles.accountAvatar}>
                  {me.profile_image_url ? (
                    <img
                      src={me.profile_image_url}
                      alt=""
                      style={styles.accountAvatarImage}
                    />
                  ) : (
                    <span style={styles.accountAvatarPlaceholder} aria-hidden="true">
                      <span style={styles.accountAvatarPlaceholderHead} />
                      <span style={styles.accountAvatarPlaceholderBody} />
                    </span>
                  )}
                </span>
              </button>

              {isAccountMenuOpen && (
                <div style={styles.accountMenu} role="menu">
                  <Link
                    to="/account"
                    style={styles.accountMenuItem}
                    onClick={handleAccountLinkClick}
                    onMouseEnter={liftControl}
                    onMouseLeave={settleControl}
                    role="menuitem"
                  >
                    Contul meu
                  </Link>
                  <button
                    type="button"
                    style={styles.accountMenuItemDanger}
                    onClick={handleAccountLogout}
                    onMouseEnter={liftControl}
                    onMouseLeave={settleControl}
                    role="menuitem"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>

            {isStaff && (
              <div
                ref={dashboardRef}
                style={styles.dashboardWrap}
                onMouseEnter={() => setIsDashboardHovered(true)}
                onMouseLeave={() => setIsDashboardHovered(false)}
              >
                <button
                  type="button"
                  style={{
                    ...styles.dashboardButton,
                    ...(!isDashboardOpen && isDashboardHovered
                      ? styles.dashboardButtonHover
                      : {}),
                    ...(isDashboardOpen ? styles.dashboardButtonOpen : {}),
                  }}
                  onClick={(event) => {
                    setIsDashboardOpen((prev) => !prev);
                    event.currentTarget.blur();
                  }}
                  aria-label="Dashboard"
                >
                  <span style={styles.iconWrap}>
                    <span style={styles.gearIcon}>⚙</span>
                    {dashboardUnreadCount > 0 && (
                      <span style={styles.badge}>{dashboardUnreadCount}</span>
                    )}
                  </span>
                </button>

                {isDashboardHovered && !isDashboardOpen && (
                  <div style={styles.dashboardTooltip}>Dashboard</div>
                )}

                {isDashboardOpen && (
                  <div style={styles.dashboardMenu}>
                    <Link
                      to="/dashboard/orders"
                      style={styles.dashboardMenuItem}
                      onClick={handleDashboardLinkClick}
                      onMouseEnter={liftControl}
                      onMouseLeave={settleControl}
                    >
                      Istoric comenzi
                      {unreadOrderCount > 0 && (
                        <span style={styles.inlineBadge}>{unreadOrderCount}</span>
                      )}
                    </Link>

                    <Link
                      to="/dashboard/tickets"
                      style={styles.dashboardMenuItem}
                      onClick={handleDashboardLinkClick}
                      onMouseEnter={liftControl}
                      onMouseLeave={settleControl}
                    >
                      Tichete
                      {unreadTicketCount > 0 && (
                        <span style={styles.inlineBadge}>{unreadTicketCount}</span>
                      )}
                    </Link>

                    <Link
                      to="/dashboard/users"
                      style={styles.dashboardMenuItem}
                      onClick={handleDashboardLinkClick}
                      onMouseEnter={liftControl}
                      onMouseLeave={settleControl}
                    >
                      Utilizatori
                    </Link>

                    {isAdmin && (
                      <>
                        <Link
                          to="/dashboard/user-approvals"
                          style={styles.dashboardMenuItem}
                          onClick={handleDashboardLinkClick}
                          onMouseEnter={liftControl}
                          onMouseLeave={settleControl}
                        >
                          Aprobă utilizatori
                          {pendingApprovalCount > 0 && (
                            <span style={styles.inlineBadge}>{pendingApprovalCount}</span>
                          )}
                        </Link>

                        <Link
                          to="/dashboard/products"
                          style={styles.dashboardMenuItem}
                          onClick={handleDashboardLinkClick}
                          onMouseEnter={liftControl}
                          onMouseLeave={settleControl}
                        >
                          Catalog produse
                        </Link>

                        <Link
                          to="/admin/products/new"
                          style={styles.dashboardMenuItem}
                          onClick={handleDashboardLinkClick}
                          onMouseEnter={liftControl}
                          onMouseLeave={settleControl}
                        >
                          Adaugă produse
                        </Link>

                        <Link
                          to="/admin/products"
                          style={styles.dashboardMenuItem}
                          onClick={handleDashboardLinkClick}
                          onMouseEnter={liftControl}
                          onMouseLeave={settleControl}
                        >
                          Actualizează produse
                        </Link>

                        <Link
                          to="/dashboard/vouchers"
                          style={styles.dashboardMenuItem}
                          onClick={handleDashboardLinkClick}
                          onMouseEnter={liftControl}
                          onMouseLeave={settleControl}
                        >
                          Vouchere
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const baseControl = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid rgba(96,165,250,0.22)",
  background: "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.55))",
  color: "#f8fafc",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  minHeight: 38,
  boxSizing: "border-box",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(59,130,246,0.08)",
  transition:
    "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
};

const styles = {
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 1000,
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 18px",
    borderBottom: "1px solid rgba(96,165,250,0.16)",
    background: "rgba(12,16,24,0.9)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxSizing: "border-box",
    flexWrap: "wrap",
    boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
  },
  brand: {
    textDecoration: "none",
    color: "white",
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
    marginRight: 158,
  },
  searchWrap: {
    flex: 1,
    minWidth: 220,
    maxWidth: 560,
  },
  searchBox: {
    position: "relative",
    width: "100%",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 42px 10px 14px",
    borderRadius: 10,
    border: "1px solid #444",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
  },
  searchIcon: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: 0,
    background: "transparent",
    color: "white",
    opacity: 0.7,
    pointerEvents: "none",
    fontSize: 15,
  },
  right: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  cartArea: {
    position: "relative",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "flex-end",
    overflow: "visible",
  },
  link: baseControl,
  button: {
    ...baseControl,
    cursor: "pointer",
    fontWeight: 800,
  },
  buttonWithBadge: {
    ...baseControl,
    cursor: "pointer",
    fontWeight: 800,
    position: "relative",
    gap: 8,
  },
  favoriteLink: baseControl,
  notificationWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    order: 998,
  },
  notificationButton: {
    ...baseControl,
    cursor: "pointer",
    width: NAV_CONTROL_HEIGHT,
    minWidth: NAV_CONTROL_HEIGHT,
    height: NAV_CONTROL_HEIGHT,
    minHeight: NAV_CONTROL_HEIGHT,
    padding: 0,
  },
  notificationTooltip: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    padding: "6px 10px",
    borderRadius: 8,
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "white",
    fontSize: 12,
    fontWeight: 500,
    zIndex: 20,
    boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  },
  accountMenuWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
  },
  accountButton: {
    ...baseControl,
    cursor: "pointer",
    height: NAV_CONTROL_HEIGHT,
    minHeight: NAV_CONTROL_HEIGHT,
    padding: "6px 8px 6px 15px",
    gap: 10,
    fontWeight: 900,
    border: "1px solid rgba(96,165,250,0.26)",
    borderColor: "rgba(96,165,250,0.26)",
    outline: "none",
    background: "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.55))",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(96,165,250,0.08), 0 0 12px rgba(59,130,246,0.08)",
  },
  accountButtonHover: {
    transform: "translateY(-1px)",
    borderColor: "rgba(96,165,250,0.48)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)",
  },
  accountButtonOpen: {
    borderColor: "rgba(96,165,250,0.48)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)",
  },
  accountName: {
    maxWidth: 150,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountAvatar: {
    position: "relative",
    width: 32,
    height: 32,
    flex: "0 0 auto",
    overflow: "hidden",
    borderRadius: 999,
    border: "1px solid rgba(147,197,253,0.34)",
    background: "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94))",
    boxShadow: "0 0 12px rgba(59,130,246,0.16)",
  },
  accountAvatarImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  accountAvatarPlaceholder: {
    position: "absolute",
    inset: 0,
    display: "block",
    background:
      "radial-gradient(circle at 50% 36%, rgba(148,163,184,0.18), transparent 42%), linear-gradient(145deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94))",
  },
  accountAvatarPlaceholderHead: {
    position: "absolute",
    top: 7,
    left: "50%",
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(203,213,225,0.86)",
    transform: "translateX(-50%)",
  },
  accountAvatarPlaceholderBody: {
    position: "absolute",
    bottom: 5,
    left: "50%",
    width: 22,
    height: 13,
    borderRadius: "999px 999px 8px 8px",
    background: "rgba(203,213,225,0.86)",
    transform: "translateX(-50%)",
    clipPath: "ellipse(50% 48% at 50% 70%)",
  },
  accountMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    minWidth: 190,
    background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(18,24,38,0.98))",
    border: "1px solid rgba(96,165,250,0.18)",
    borderRadius: 12,
    padding: 8,
    display: "grid",
    gap: 6,
    zIndex: 35,
    boxShadow:
      "0 16px 35px rgba(0,0,0,0.45), 0 0 18px rgba(59,130,246,0.14)",
  },
  accountMenuItem: {
    color: "white",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "11px 13px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.14)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.82), rgba(30,41,59,0.62))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    fontWeight: 800,
    boxSizing: "border-box",
  },
  accountMenuItemDanger: {
    color: "white",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    padding: "11px 13px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.14)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.82), rgba(30,41,59,0.62))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    boxSizing: "border-box",
  },
  cartLink: {
    ...baseControl,
    height: NAV_CONTROL_HEIGHT,
    minHeight: NAV_CONTROL_HEIGHT,
    padding: "9px 15px",
    gap: 10,
    fontWeight: 800,
  },
  cartText: {
    whiteSpace: "nowrap",
  },
  cartPreview: {
    position: "absolute",
    top: "100%",
    right: -6,
    zIndex: 80,
    width: 340,
    maxWidth: "calc(100vw - 28px)",
    paddingTop: 8,
    filter: "drop-shadow(0 16px 34px rgba(0,0,0,0.48))",
  },
  cartPreviewPointer: {
    width: 14,
    height: 14,
    marginLeft: "auto",
    marginRight: 30,
    marginBottom: -7,
    borderTop: "1px solid rgba(96,165,250,0.22)",
    borderLeft: "1px solid rgba(96,165,250,0.22)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))",
    transform: "rotate(45deg)",
    borderTopLeftRadius: 3,
  },
  cartPreviewPanel: {
    maxHeight: 330,
    overflowY: "auto",
    display: "grid",
    gap: 8,
    padding: 10,
    borderRadius: 14,
    border: "1px solid rgba(96,165,250,0.22)",
    background: "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(24,31,45,0.98))",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(59,130,246,0.12)",
  },
  cartPreviewItem: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "52px 1fr",
    gap: 10,
    alignItems: "center",
    minHeight: 62,
    padding: "8px 42px 8px 8px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    cursor: "pointer",
    transition: "background 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
  },
  cartPreviewItemHover: {
    borderColor: "rgba(96,165,250,0.28)",
    background: "rgba(59,130,246,0.08)",
    transform: "translateY(-1px)",
  },
  cartPreviewRemove: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 9,
    border: "1px solid rgba(248,113,113,0.28)",
    background: "rgba(15,23,42,0.72)",
    color: "#fca5a5",
    cursor: "pointer",
    transition: "background 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
  },
  cartPreviewRemoveHover: {
    borderColor: "rgba(248,113,113,0.55)",
    background: "rgba(248,113,113,0.16)",
    transform: "translateY(-1px)",
  },
  cartPreviewRemoveDisabled: {
    cursor: "wait",
    opacity: 0.55,
    transform: "none",
  },
  cartPreviewImage: {
    width: 52,
    height: 52,
    borderRadius: 8,
    objectFit: "contain",
    background: "rgba(255,255,255,0.06)",
  },
  cartPreviewInfo: {
    minWidth: 0,
    display: "grid",
    gap: 5,
  },
  cartPreviewName: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.25,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cartPreviewPrice: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: 900,
  },
  cartPreviewMuted: {
    padding: "12px 10px",
    color: "rgba(226,232,240,0.72)",
    fontSize: 13,
    fontWeight: 700,
  },
  cartPreviewTotal: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
    padding: "11px 8px 2px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: 900,
  },
  iconWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    lineHeight: 1,
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -10,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 999,
    background: "#ef4444",
    color: "white",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  cartToastWrap: {
    position: "absolute",
    top: "calc(100% + 12px)",
    right: -6,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    zIndex: 50,
    filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.42))",
  },
  cartToastPointer: {
    width: 14,
    height: 14,
    marginRight: 20,
    marginBottom: -7,
    borderTop: "1px solid rgba(255,255,255,0.18)",
    borderLeft: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(135deg, rgba(79, 70, 229, 0.96), rgba(139, 92, 246, 0.96))",
    transform: "rotate(45deg)",
    borderTopLeftRadius: 3,
  },
  cartToast: {
    whiteSpace: "nowrap",
    padding: "10px 14px",
    borderRadius: 12,
    background: "linear-gradient(135deg, rgba(79, 70, 229, 0.97), rgba(139, 92, 246, 0.97))",
    color: "white",
    fontSize: 12,
    fontWeight: 700,
    boxShadow: "0 0 18px rgba(99,102,241,0.24), 0 0 24px rgba(168,85,247,0.16)",
  },
  inlineBadge: {
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 999,
    background: "#ef4444",
    color: "white",
    fontSize: 11,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  dashboardWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    order: 999,
  },
  dashboardButton: {
    ...baseControl,
    cursor: "pointer",
    width: NAV_CONTROL_HEIGHT,
    minWidth: NAV_CONTROL_HEIGHT,
    height: NAV_CONTROL_HEIGHT,
    minHeight: NAV_CONTROL_HEIGHT,
    borderColor: "rgba(96,165,250,0.22)",
    padding: 0,
  },
  dashboardButtonHover: {
    transform: "translateY(-1px)",
    borderColor: "rgba(96,165,250,0.48)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)",
  },
  dashboardButtonOpen: {
    borderColor: "rgba(255,255,255,0.86)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 16px rgba(59,130,246,0.2), 0 0 22px rgba(168,85,247,0.12)",
  },
  gearIcon: {
    fontSize: 18,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  bellIcon: {
    fontSize: 19,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dashboardTooltip: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    padding: "6px 10px",
    borderRadius: 8,
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 12,
    zIndex: 20,
    boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  },
  dashboardMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    minWidth: 210,
    background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(18,24,38,0.98))",
    border: "1px solid rgba(96,165,250,0.18)",
    borderRadius: 12,
    padding: 8,
    display: "grid",
    gap: 6,
    zIndex: 30,
    boxShadow:
      "0 16px 35px rgba(0,0,0,0.45), 0 0 18px rgba(59,130,246,0.14)",
  },
  dashboardMenuItem: {
    color: "white",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "11px 13px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.14)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.82), rgba(30,41,59,0.62))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    fontWeight: 700,
  },
};
