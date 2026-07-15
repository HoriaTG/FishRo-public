import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AddProductPage from "./pages/AddProductPage";
import BannedSupportPage from "./pages/BannedSupportPage";
import ProductPage from "./pages/ProductPage";
import AdminProductsPage from "./pages/AdminProductsPage";
import CartPage from "./pages/CartPage";
import FavoritesPage from "./pages/FavoritesPage";
import AccountPage from "./pages/AccountPage";
import OrdersHistoryPage from "./pages/OrderHistoryPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import MyTicketsPage from "./pages/MyTicketsPage.jsx";
import DashboardTicketsPage from "./pages/DashboardTicketsPage";
import DashboardUsersPage from "./pages/DashboardUsersPage";
import DashboardUserLogsPage from "./pages/DashboardUserLogsPage";
import DashboardVouchersPage from "./pages/DashboardVouchersPage";
import DashboardUserApprovalsPage from "./pages/DashboardUserApprovalsPage";
import AdminProductCatalogPage from "./pages/AdminProductCatalogPage";
import AdminProductCatalogDetailPage from "./pages/AdminProductCatalogDetailPage";
import TicketDetailsPage from "./pages/TicketDetailsPage";
import ChatWidget from "./components/ChatWidget";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentPage from "./pages/PaymentPage";
import TermsPage from "./pages/TermsPage";
import {
  clearToken,
  getCart,
  getDashboardUnreadCount,
  getMe,
  getNotifications,
  getToken,
  getUnreadNotificationCount,
  getUnreadTicketCount,
  logoutUser,
  markNotificationsRead,
  setAccountBannedHandler,
  setSessionReplacedHandler,
  updatePresence,
} from "./api";
import "./App.css";

const BACKGROUND_REFRESH_MS = 15000;
const PRESENCE_REFRESH_MS = 20000;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const backgroundLocation = location.state?.backgroundLocation;

  const [me, setMe] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [unreadTicketCount, setUnreadTicketCount] = useState(0);
  const [unreadOrderCount, setUnreadOrderCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [favoriteModal, setFavoriteModal] = useState(null);
  const [hoveredModalAction, setHoveredModalAction] = useState("");
  const [notificationModalItems, setNotificationModalItems] = useState([]);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [logoutConfirmModal, setLogoutConfirmModal] = useState(false);
  const [sessionReplacedModalOpen, setSessionReplacedModalOpen] = useState(false);
  const [replacedSessionId, setReplacedSessionId] = useState("");
  const [accountBannedModalOpen, setAccountBannedModalOpen] = useState(false);
  const [accountBannedDetail, setAccountBannedDetail] = useState(null);
  const [banNow, setBanNow] = useState(() => Date.now());

  const showOrderSuccessModal =
    location.pathname === "/store" && !!location.state?.orderSuccess;
  const showLoginModal = backgroundLocation && location.pathname === "/login";
  const showRegisterModal = backgroundLocation && location.pathname === "/register";
  const showCartModal = backgroundLocation && location.pathname === "/cart";

  const refreshCartCount = useCallback(async () => {
    try {
      const cart = await getCart();
      const count = (cart.items || []).reduce((sum, item) => sum + item.quantity, 0);
      setCartCount(count);
    } catch {
      setCartCount(0);
    }
  }, []);

  const refreshUnreadTicketCount = useCallback(async () => {
    const token = getToken();

    if (!token) {
      setUnreadTicketCount(0);
      setUnreadOrderCount(0);
      setPendingApprovalCount(0);
      return;
    }

    try {
      if (me?.role === "moderator" || me?.role === "admin") {
        const data = await getDashboardUnreadCount();
        setUnreadTicketCount(data.tickets || 0);
        setUnreadOrderCount(data.orders || 0);
        setPendingApprovalCount(data.approvals || 0);
      } else {
        const data = await getUnreadTicketCount();
        setUnreadTicketCount(data.count || 0);
        setUnreadOrderCount(0);
        setPendingApprovalCount(0);
      }
    } catch {
      setUnreadTicketCount(0);
      setUnreadOrderCount(0);
      setPendingApprovalCount(0);
    }
  }, [me]);

  const refreshUnreadNotificationCount = useCallback(async () => {
    const token = getToken();

    if (!token) {
      setUnreadNotificationCount(0);
      return;
    }

    try {
      const data = await getUnreadNotificationCount();
      setUnreadNotificationCount(data.count || 0);
    } catch {
      setUnreadNotificationCount(0);
    }
  }, []);

  async function refreshMe() {
    try {
      const user = await getMe();
      const isStaff = user.role === "moderator" || user.role === "admin";
      setMe(user);
      const [cart, unread, notifications] = await Promise.all([
        getCart().catch(() => ({ items: [] })),
        isStaff
          ? getDashboardUnreadCount().catch(() => ({ tickets: 0, orders: 0 }))
          : getUnreadTicketCount().catch(() => ({ count: 0 })),
        isStaff ? Promise.resolve({ count: 0 }) : getUnreadNotificationCount().catch(() => ({ count: 0 })),
      ]);

      const count = (cart.items || []).reduce((sum, item) => sum + item.quantity, 0);
      setCartCount(count);
      setUnreadTicketCount(isStaff ? unread.tickets || 0 : unread.count || 0);
      setUnreadOrderCount(isStaff ? unread.orders || 0 : 0);
      setPendingApprovalCount(user.role === "admin" ? unread.approvals || 0 : 0);
      setUnreadNotificationCount(notifications.count || 0);
    } catch {
      setMe(null);
      setCartCount(0);
      setUnreadTicketCount(0);
      setUnreadOrderCount(0);
      setPendingApprovalCount(0);
      setUnreadNotificationCount(0);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = getToken();

      if (!token) {
        if (!cancelled) {
          setMe(null);
          const cart = await getCart().catch(() => ({ items: [] }));
          const count = (cart.items || []).reduce((sum, item) => sum + item.quantity, 0);
          setCartCount(count);
          setUnreadTicketCount(0);
          setUnreadNotificationCount(0);
        }
        return;
      }

      try {
        const user = await getMe();
        const isStaff = user.role === "moderator" || user.role === "admin";
        const [cart, unread, notifications] = await Promise.all([
          getCart().catch(() => ({ items: [] })),
          isStaff
            ? getDashboardUnreadCount().catch(() => ({ tickets: 0, orders: 0, total: 0 }))
            : getUnreadTicketCount().catch(() => ({ count: 0 })),
          isStaff ? Promise.resolve({ count: 0 }) : getUnreadNotificationCount().catch(() => ({ count: 0 })),
        ]);

        if (!cancelled) {
          setMe(user);
          const count = (cart.items || []).reduce((sum, item) => sum + item.quantity, 0);
          setCartCount(count);
          setUnreadTicketCount(isStaff ? unread.tickets || 0 : unread.count || 0);
          setUnreadOrderCount(isStaff ? unread.orders || 0 : 0);
          setPendingApprovalCount(user.role === "admin" ? unread.approvals || 0 : 0);
          setUnreadNotificationCount(notifications.count || 0);
        }
      } catch {
        if (!cancelled) {
          clearToken();
          setMe(null);
          setCartCount(0);
          setUnreadTicketCount(0);
          setUnreadOrderCount(0);
          setPendingApprovalCount(0);
          setUnreadNotificationCount(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me) return undefined;

    function refreshBackgroundData() {
      if (document.hidden) return;
      refreshUnreadTicketCount();
      refreshUnreadNotificationCount();
      refreshCartCount();
    }

    const intervalId = setInterval(refreshBackgroundData, BACKGROUND_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshBackgroundData);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshBackgroundData);
    };
  }, [me, refreshCartCount, refreshUnreadNotificationCount, refreshUnreadTicketCount]);

  useEffect(() => {
    if (!me) return undefined;

    function sendPresence() {
      updatePresence(!document.hidden).catch(() => {});
    }

    sendPresence();
    const intervalId = setInterval(sendPresence, PRESENCE_REFRESH_MS);
    document.addEventListener("visibilitychange", sendPresence);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", sendPresence);
    };
  }, [me]);

  const resetClientSession = useCallback(() => {
    clearToken();
    sessionStorage.removeItem("fishro.dashboardTickets.statusFilter");
    setMe(null);
    setCartCount(0);
    setUnreadTicketCount(0);
    setUnreadOrderCount(0);
    setPendingApprovalCount(0);
    setUnreadNotificationCount(0);
  }, []);

  function handleLogout() {
    const sessionId = getToken();
    resetClientSession();
    setLogoutConfirmModal(false);
    navigate("/");
    logoutUser(sessionId).catch(() => {});
  }

  function handleSessionReplacedOk() {
    resetClientSession();
    setSessionReplacedModalOpen(false);
    logoutUser(replacedSessionId).catch(() => {});
    setReplacedSessionId("");
    navigate("/");
  }

  function parseBackendDate(value) {
    if (!value) return null;
    if (typeof value !== "string") return new Date(value);
    return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
  }

  const banRemaining = (() => {
    if (!accountBannedDetail?.ban_until || accountBannedDetail.ban_permanent) return "";

    const banUntil = parseBackendDate(accountBannedDetail.ban_until);
    const diff = Math.max(0, (banUntil?.getTime() || 0) - banNow);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  })();

  function handleAccountBannedOk() {
    setAccountBannedModalOpen(false);
    navigate("/");
  }

  function handleOpenBannedSupport() {
    if (!accountBannedDetail?.ban_token) return;
    setAccountBannedModalOpen(false);
    navigate(`/banned-support?token=${encodeURIComponent(accountBannedDetail.ban_token)}`);
  }

  useEffect(() => {
    setSessionReplacedHandler((detail) => {
      resetClientSession();
      setReplacedSessionId(detail?.session_id || "");
      setLogoutConfirmModal(false);
      setNotificationModalOpen(false);
      setSessionReplacedModalOpen(true);
    });

    return () => setSessionReplacedHandler(null);
  }, [resetClientSession]);

  useEffect(() => {
    setAccountBannedHandler((detail) => {
      resetClientSession();
      setAccountBannedDetail(detail);
      setBanNow(Date.now());
      setLogoutConfirmModal(false);
      setNotificationModalOpen(false);
      setSessionReplacedModalOpen(false);
      setAccountBannedModalOpen(true);
    });

    return () => setAccountBannedHandler(null);
  }, [resetClientSession]);

  useEffect(() => {
    if (!accountBannedModalOpen || accountBannedDetail?.ban_permanent) return undefined;

    const intervalId = window.setInterval(() => setBanNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [accountBannedModalOpen, accountBannedDetail]);

  function handleCloseOrderSuccessModal() {
    navigate("/store", { replace: true, state: {} });
  }

  const handleFavoriteAdded = useCallback(() => {
    setFavoriteModal("added");
  }, []);

  const handleFavoriteAuthRequired = useCallback(() => {
    setFavoriteModal("auth");
  }, []);

  function closeFavoriteModal() {
    setHoveredModalAction("");
    setFavoriteModal(null);
  }

  function goToAuth(path) {
    const authBackground =
      location.pathname === "/favorites"
        ? {
            pathname: "/store",
            search: "",
            hash: "",
            state: null,
            key: "favorite-auth-store",
          }
        : backgroundLocation || location;

    setHoveredModalAction("");
    setFavoriteModal(null);
    navigate(path, {
      state: { backgroundLocation: authBackground },
    });
  }

  async function handleOpenNotifications() {
    try {
      const notifications = await getNotifications({ unreadOnly: true });
      setNotificationModalItems(notifications);
    } catch {
      setNotificationModalItems([]);
    }
    setNotificationModalOpen(true);
  }

  async function handleCloseNotifications() {
    const ids = notificationModalItems.map((notification) => notification.id);

    if (ids.length > 0) {
    try {
      await markNotificationsRead(ids);
    } catch {
      // Următorul polling va reîncerca actualizarea count-ului.
    }

    }

    setNotificationModalItems([]);
    setNotificationModalOpen(false);
    setHoveredModalAction("");
    await refreshUnreadNotificationCount();
  }

  return (
    <div>
      <Navbar
        me={me}
        onLogout={() => setLogoutConfirmModal(true)}
        searchText={searchText}
        onSearchChange={setSearchText}
        cartCount={cartCount}
        unreadTicketCount={unreadTicketCount}
        unreadOrderCount={unreadOrderCount}
        pendingApprovalCount={pendingApprovalCount}
        unreadNotificationCount={unreadNotificationCount}
        onNotificationsClick={handleOpenNotifications}
        onCartChange={refreshCartCount}
      />

      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/store"
          element={
            <HomePage
              searchText={searchText}
              onCartChange={refreshCartCount}
            />
          }
        />
        <Route path="/login" element={<LoginPage onLoggedIn={refreshMe} />} />
        <Route path="/banned-support" element={<BannedSupportPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin/products/new" element={<AddProductPage me={me} />} />
        <Route
          path="/products/:id"
          element={
            <ProductPage
              onCartChange={refreshCartCount}
              onFavoriteAdded={handleFavoriteAdded}
              onFavoriteAuthRequired={handleFavoriteAuthRequired}
            />
          }
        />
        <Route
          path="/favorites"
          element={
            <FavoritesPage
              onCartChange={refreshCartCount}
              onLoginRequired={handleFavoriteAuthRequired}
            />
          }
        />
        <Route path="/cart" element={<CartPage onCartChange={refreshCartCount} />} />
        <Route
          path="/account"
          element={
            <AccountPage
              key={me?.id ?? "guest"}
              me={me}
              onCartChange={refreshCartCount}
              unreadTicketCount={unreadTicketCount}
              onTicketsChanged={refreshUnreadTicketCount}
              onNotificationsChanged={refreshUnreadNotificationCount}
              onProfileChanged={refreshMe}
            />
          }
        />
        <Route path="/admin/products" element={<AdminProductsPage me={me} />} />
        <Route path="/dashboard/products" element={<AdminProductCatalogPage me={me} />} />
        <Route
          path="/dashboard/products/:id"
          element={<AdminProductCatalogDetailPage me={me} />}
        />
        <Route path="/dashboard/orders" element={<OrdersHistoryPage me={me} />} />
        <Route path="/dashboard/users" element={<DashboardUsersPage me={me} />} />
        <Route
          path="/dashboard/user-approvals"
          element={
            <DashboardUserApprovalsPage
              me={me}
              onApprovalsChanged={refreshUnreadTicketCount}
            />
          }
        />
        <Route path="/dashboard/users/:userId/logs" element={<DashboardUserLogsPage me={me} />} />
        <Route path="/dashboard/vouchers" element={<DashboardVouchersPage me={me} />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/payment" element={<PaymentPage onCartChange={refreshCartCount} />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="/dashboard/tickets"
          element={
            <DashboardTicketsPage
              me={me}
              onTicketsChanged={refreshUnreadTicketCount}
            />
          }
        />
        <Route
          path="/my-tickets"
          element={<MyTicketsPage me={me} onTicketsChanged={refreshUnreadTicketCount} />}
        />
        <Route
          path="/tickets/:id"
          element={
            <TicketDetailsPage me={me} onTicketsChanged={refreshUnreadTicketCount} />
          }
        />
        <Route path="/orders/:id" element={<OrderDetailsPage me={me} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showLoginModal && (
        <LoginPage
          onLoggedIn={refreshMe}
          isModal
          backgroundLocation={backgroundLocation}
        />
      )}

      {showRegisterModal && (
        <RegisterPage isModal backgroundLocation={backgroundLocation} />
      )}

      {showCartModal && (
        <CartPage
          onCartChange={refreshCartCount}
          isModal
          backgroundLocation={backgroundLocation}
        />
      )}

      {showOrderSuccessModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h3 style={{ marginTop: 0 }}>Comanda a fost plasată cu succes</h3>
            <p style={{ marginBottom: 18 }}>
              Îți mulțumim! Poți urmări detaliile comenzii din contul tău.
            </p>
            <button style={modalStyles.okBtn} onClick={handleCloseOrderSuccessModal}>
              OK
            </button>
          </div>
        </div>
      )}

      {favoriteModal === "added" && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h3 style={{ marginTop: 0 }}>Produsul a fost adăugat la favorite</h3>
            <p style={{ marginBottom: 18 }}>
              Îl poți găsi oricând în Contul meu, la secțiunea Favorite.
            </p>
            <button style={modalStyles.okBtn} onClick={closeFavoriteModal}>
              OK
            </button>
          </div>
        </div>
      )}

      {favoriteModal === "auth" && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <button
              type="button"
              style={{
                ...modalStyles.closeBtn,
                ...(hoveredModalAction === "close" ? modalStyles.closeBtnHover : {}),
              }}
              onClick={closeFavoriteModal}
              onMouseEnter={() => setHoveredModalAction("close")}
              onMouseLeave={() => setHoveredModalAction("")}
              aria-label="Închide alerta favorite"
            >
              <span
                style={
                  hoveredModalAction === "close"
                    ? modalStyles.closeIconHover
                    : modalStyles.closeIcon
                }
              >
                X
              </span>
            </button>
            <h3 style={{ marginTop: 0 }}>Ai nevoie de cont pentru favorite</h3>
            <p style={{ marginBottom: 18 }}>
              Lista de favorite este disponibilă doar după autentificare. Intră în cont
              sau creează unul nou pentru a salva produsul.
            </p>
            <div style={modalStyles.confirmActions}>
              <button
                type="button"
                style={{
                  ...modalStyles.secondaryBtn,
                  ...(hoveredModalAction === "login" ? modalStyles.secondaryBtnHover : {}),
                }}
                onClick={() => goToAuth("/login")}
                onMouseEnter={() => setHoveredModalAction("login")}
                onMouseLeave={() => setHoveredModalAction("")}
              >
                Login
              </button>
              <button
                type="button"
                style={{
                  ...modalStyles.okBtn,
                  ...(hoveredModalAction === "register" ? modalStyles.primaryBtnHover : {}),
                }}
                onClick={() => goToAuth("/register")}
                onMouseEnter={() => setHoveredModalAction("register")}
                onMouseLeave={() => setHoveredModalAction("")}
              >
                Creează cont
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <button
              type="button"
              style={{
                ...modalStyles.closeBtn,
                ...(hoveredModalAction === "notification-close"
                  ? modalStyles.closeBtnHover
                  : {}),
              }}
              onClick={handleCloseNotifications}
              onMouseEnter={() => setHoveredModalAction("notification-close")}
              onMouseLeave={() => setHoveredModalAction("")}
              aria-label="Închide notificările"
            >
              <span
                style={
                  hoveredModalAction === "notification-close"
                    ? modalStyles.closeIconHover
                    : modalStyles.closeIcon
                }
              >
                X
              </span>
            </button>
            <h3 style={{ margin: "0 42px 18px 0" }}>Notificări noi</h3>
            {notificationModalItems.length === 0 && (
              <p style={{ marginBottom: 18 }}>Nu ai notificări recente.</p>
            )}
            <div style={modalStyles.notificationList}>
              {notificationModalItems.map((notification) => (
                <div key={notification.id} style={modalStyles.notificationItem}>
                  {notification.message}
                </div>
              ))}
            </div>
            <button
              style={{
                ...modalStyles.okBtn,
                ...(hoveredModalAction === "notification-ok"
                  ? modalStyles.primaryBtnHover
                  : {}),
              }}
              onClick={handleCloseNotifications}
              onMouseEnter={() => setHoveredModalAction("notification-ok")}
              onMouseLeave={() => setHoveredModalAction("")}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {logoutConfirmModal && (
        <div style={{ ...modalStyles.overlay, ...modalStyles.logoutOverlay }}>
          <div style={{ ...modalStyles.modal, ...modalStyles.logoutModal }}>
            <button
              type="button"
              style={{
                ...modalStyles.closeBtn,
                ...(hoveredModalAction === "logout-close"
                  ? modalStyles.closeBtnHover
                  : {}),
              }}
              onClick={() => setLogoutConfirmModal(false)}
              onMouseEnter={() => setHoveredModalAction("logout-close")}
              onMouseLeave={() => setHoveredModalAction("")}
              aria-label="Închide confirmarea de logout"
            >
              <span
                style={
                  hoveredModalAction === "logout-close"
                    ? modalStyles.closeIconHover
                    : modalStyles.closeIcon
                }
              >
                X
              </span>
            </button>
            <div style={modalStyles.logoutIcon}>↪</div>
            <h3 style={modalStyles.logoutTitle}>Confirmă deconectarea</h3>
            <p style={modalStyles.logoutText}>
              Ești sigur că vrei să te deconectezi din contul tău?
            </p>
            <div style={modalStyles.confirmActions}>
              <button
                type="button"
                style={{
                  ...modalStyles.secondaryBtn,
                  ...(hoveredModalAction === "logout-cancel"
                    ? modalStyles.secondaryBtnHover
                    : {}),
                }}
                onClick={() => setLogoutConfirmModal(false)}
                onMouseEnter={() => setHoveredModalAction("logout-cancel")}
                onMouseLeave={() => setHoveredModalAction("")}
              >
                Rămân conectat
              </button>
              <button
                type="button"
                style={{
                  ...modalStyles.dangerBtn,
                  ...(hoveredModalAction === "logout-confirm"
                    ? modalStyles.dangerBtnHover
                    : {}),
                }}
                onClick={handleLogout}
                onMouseEnter={() => setHoveredModalAction("logout-confirm")}
                onMouseLeave={() => setHoveredModalAction("")}
              >
                Deconectează-mă
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionReplacedModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h3 style={{ marginTop: 0 }}>Conexiune întreruptă</h3>
            <p style={{ marginBottom: 18 }}>
              Te-ai conectat la acest cont din altă parte. Pentru siguranță, sesiunea
              curentă a fost închisă.
            </p>
            <button style={modalStyles.okBtn} onClick={handleSessionReplacedOk}>
              OK
            </button>
          </div>
        </div>
      )}

      {accountBannedModalOpen && accountBannedDetail && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <button
              type="button"
              style={{
                ...modalStyles.closeBtn,
                ...(hoveredModalAction === "banned-close"
                  ? modalStyles.bannedCloseBtnHover
                  : {}),
              }}
              onClick={handleAccountBannedOk}
              onMouseEnter={() => setHoveredModalAction("banned-close")}
              onMouseLeave={() => setHoveredModalAction("")}
              aria-label="Inchide alerta de suspendare"
            >
              <span
                style={
                  hoveredModalAction === "banned-close"
                    ? modalStyles.closeIconHover
                    : modalStyles.closeIcon
                }
              >
                X
              </span>
            </button>
            <h3 style={{ margin: "0 42px 18px 0" }}>
              {accountBannedDetail.ban_permanent
                ? "Contul dvs a fost suspendat"
                : "Contul dvs a fost suspendat temporar"}
            </h3>

            {!accountBannedDetail.ban_permanent && (
              <p style={modalStyles.banTimer}>
                Durata: <strong>{banRemaining}</strong>
              </p>
            )}

            <p style={{ marginBottom: 18 }}>
              Pentru a afla motivul, contacteaza echipa noastra de asistenta.
            </p>

            <div style={modalStyles.confirmActions}>
              <button
                type="button"
                style={{
                  ...modalStyles.okBtn,
                  ...(hoveredModalAction === "banned-support"
                    ? modalStyles.bannedPrimaryBtnHover
                    : {}),
                }}
                onClick={handleOpenBannedSupport}
                onMouseEnter={() => setHoveredModalAction("banned-support")}
                onMouseLeave={() => setHoveredModalAction("")}
              >
                {accountBannedDetail.support_ticket_id
                  ? "Vezi status tichet"
                  : "Deschide un tichet"}
              </button>
              <button
                type="button"
                style={{
                  ...modalStyles.secondaryBtn,
                  ...(hoveredModalAction === "banned-ok"
                    ? modalStyles.bannedSecondaryBtnHover
                    : {}),
                }}
                onClick={handleAccountBannedOk}
                onMouseEnter={() => setHoveredModalAction("banned-ok")}
                onMouseLeave={() => setHoveredModalAction("")}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatWidget me={me} />
    </div>
  );
}

const modalStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(2px)",
  },
  modal: {
    position: "relative",
    width: "min(420px, calc(100% - 32px))",
    background: "#1e1e1e",
    color: "white",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    padding: 22,
    boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
  },
  logoutOverlay: {
    background: "rgba(0,0,0,0.64)",
    backdropFilter: "blur(6px)",
  },
  logoutModal: {
    width: "min(500px, calc(100% - 32px))",
    display: "grid",
    justifyItems: "center",
    gap: 14,
    padding: "30px 28px",
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.97), rgba(24,31,45,0.95))",
    textAlign: "center",
    boxShadow:
      "0 24px 60px rgba(0,0,0,0.58), 0 0 30px rgba(59,130,246,0.14)",
  },
  logoutIcon: {
    display: "grid",
    width: 52,
    height: 52,
    placeItems: "center",
    border: "1px solid rgba(96,165,250,0.4)",
    borderRadius: 999,
    background: "rgba(59,130,246,0.12)",
    color: "#93c5fd",
    fontSize: 27,
    fontWeight: 900,
  },
  logoutTitle: {
    margin: 0,
    fontSize: 25,
  },
  logoutText: {
    margin: 0,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.55,
  },
  okBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    outline: "none",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
    transition: "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  primaryBtnHover: {
    filter: "brightness(1.08)",
    transform: "scale(1.02)",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.42)",
    background: "linear-gradient(135deg, rgba(220,38,38,0.92), rgba(153,27,27,0.9))",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 15,
    lineHeight: 1,
    boxShadow: "0 0 16px rgba(239,68,68,0.24)",
    transition:
      "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  closeBtnHover: {
    borderColor: "rgba(248,113,113,0.68)",
    transform: "translateY(-1px)",
    boxShadow: "0 0 20px rgba(239,68,68,0.32)",
  },
  bannedCloseBtnHover: {
    borderColor: "rgba(248,113,113,0.68)",
    transform: "translateY(-1px)",
    boxShadow: "0 0 20px rgba(239,68,68,0.32)",
  },
  closeIcon: {
    display: "inline-block",
    transform: "scale(1)",
    transition: "transform 0.16s ease",
  },
  closeIconHover: {
    display: "inline-block",
    transform: "scale(1.12)",
    transition: "transform 0.16s ease",
  },
  notificationList: {
    display: "grid",
    gap: 10,
    marginBottom: 18,
  },
  notificationItem: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    lineHeight: 1.5,
    maxWidth: "100%",
    boxSizing: "border-box",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  confirmActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  banTimer: {
    color: "#fecaca",
    fontWeight: 800,
    marginTop: 0,
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "rgba(59,130,246,0.08)",
    color: "white",
    outline: "none",
    fontWeight: 900,
    cursor: "pointer",
    transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  },
  secondaryBtnHover: {
    background: "rgba(59,130,246,0.14)",
    transform: "scale(1.03)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  bannedPrimaryBtnHover: {
    transform: "translateY(-2px)",
    boxShadow:
      "0 0 22px rgba(59,130,246,0.34), 0 0 34px rgba(168,85,247,0.22)",
  },
  bannedSecondaryBtnHover: {
    background: "rgba(59,130,246,0.14)",
    transform: "translateY(-2px)",
    boxShadow:
      "0 0 22px rgba(59,130,246,0.18), 0 0 30px rgba(168,85,247,0.12)",
  },
  dangerBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    outline: "none",
    background: "linear-gradient(135deg, rgba(220,38,38,0.96), rgba(153,27,27,0.92))",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 0 18px rgba(239,68,68,0.2), 0 0 26px rgba(127,29,29,0.14)",
    transition: "transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease",
  },
  dangerBtnHover: {
    transform: "translateY(-2px)",
    filter: "brightness(1.08)",
    boxShadow:
      "0 0 24px rgba(239,68,68,0.3), 0 0 34px rgba(127,29,29,0.2)",
  },
};
