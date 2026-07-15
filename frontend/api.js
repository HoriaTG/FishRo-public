const API_URL =
  import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
const TOKEN_KEY = "fishro_session_id";
const GUEST_CART_KEY = "fishro_guest_cart";
let sessionReplacedHandler = null;
let accountBannedHandler = null;

export class AccountBannedError extends Error {
  constructor(detail) {
    super(detail?.message || "Cont suspendat");
    this.name = "AccountBannedError";
    this.detail = detail;
  }
}

export function saveToken(token) {
  localStorage.removeItem("token");
  sessionStorage.setItem(TOKEN_KEY, token);
}

export class AccountApprovalError extends Error {
  constructor(detail) {
    super(detail?.message || "Contul nu este încă aprobat");
    this.name = "AccountApprovalError";
    this.detail = detail;
  }
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem("token");
  sessionStorage.removeItem(TOKEN_KEY);
}

export function setSessionReplacedHandler(handler) {
  sessionReplacedHandler = handler;
}

export function setAccountBannedHandler(handler) {
  accountBannedHandler = handler;
}

function buildAuthHeaders(headers = {}) {
  const sessionId = getToken();
  return {
    ...headers,
    ...(sessionId ? { "X-Session-Id": sessionId } : {}),
  };
}

function apiFetch(url, options = {}) {
  return window.fetch(url, {
    ...options,
    credentials: "include",
    headers: buildAuthHeaders(options.headers),
  });
}

function readGuestCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestCart(items) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
}

function getDiscountedPrice(price, promotion) {
  const promo = Number(promotion) || 0;
  return Number((Number(price) * (1 - promo / 100)).toFixed(2));
}

async function buildGuestCartResponse() {
  const guestItems = readGuestCart();
  if (!guestItems.length) return { items: [], total: 0 };

  const products = await getProducts();
  const productById = new Map(products.map((product) => [Number(product.id), product]));
  const nextGuestItems = [];
  const items = [];
  let total = 0;

  for (const item of guestItems) {
    const product = productById.get(Number(item.product_id));
    if (!product || Number(product.quantity) <= 0) continue;

    const quantity = Math.min(Number(item.quantity) || 1, Number(product.quantity));
    const unitPrice = getDiscountedPrice(product.price, product.promotion);
    total += unitPrice * quantity;

    nextGuestItems.push({ product_id: Number(product.id), quantity });
    items.push({
      id: Number(product.id),
      product_id: Number(product.id),
      product_name: product.name,
      product_code: product.code,
      unit_price: unitPrice,
      quantity,
      stock: Number(product.quantity),
      image_url: `/images/products/${product.code}.jpg`,
      unavailable: false,
    });
  }

  saveGuestCart(nextGuestItems);
  return { items, total };
}

async function parseError(res) {
  const data = await res.json().catch(() => ({}));
  const detail = data.detail;

  if (
    res.status === 401 ||
    detail === "Invalid token" ||
    detail === "User not found" ||
    detail === "Account suspended"
  ) {
    clearToken();
  }

  if (res.status === 409 && detail?.code === "session_replaced") {
    const replacedSessionId = getToken();
    clearToken();
    sessionReplacedHandler?.({ ...detail, session_id: replacedSessionId });
  }

  if (res.status === 403 && detail?.code === "account_banned") {
    clearToken();
    accountBannedHandler?.(detail);
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join(", ");
  }

  if (detail && typeof detail === "object") {
    return detail.msg || detail.message || JSON.stringify(detail);
  }

  return "Request failed";
}

export async function registerUser({ username, email, password }) {
  const res = await apiFetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function loginUser({ email, password }) {
  const res = await apiFetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && data?.detail?.code === "account_banned") {
      throw new AccountBannedError(data.detail);
    }
    if (
      res.status === 403 &&
      ["account_pending", "account_rejected"].includes(data?.detail?.code)
    ) {
      throw new AccountApprovalError(data.detail);
    }
    const detail = data.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) {
      throw new Error(
        detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join(", ")
      );
    }
    if (detail && typeof detail === "object") {
      throw new Error(detail.msg || detail.message || JSON.stringify(detail));
    }
    throw new Error("Request failed");
  }
  return res.json();
}

export async function getMe() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function logoutUser(sessionId = getToken()) {
  if (!sessionId) return { ok: true };

  const res = await apiFetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
  });

  clearToken();
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updatePresence(visible = true) {
  const token = getToken();
  if (!token) return { ok: true };

  const res = await apiFetch(`${API_URL}/auth/presence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ visible }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateMe(profile) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(profile),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uploadProfileImage(file) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/auth/me/profile-image`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteProfileImage() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/auth/me/profile-image`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function changePassword({ currentPassword, newPassword }) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/auth/me/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getProducts() {
  const res = await apiFetch(`${API_URL}/products`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createProduct({
  code,
  name,
  category,
  price,
  quantity,
  promotion,
  description,
  tech_details,
  video_url,
}) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      code,
      name,
      category,
      price,
      quantity,
      promotion,
      description,
      tech_details,
      video_url,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uploadProductImage(productId, position, file) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(
    `${API_URL}/products/${productId}/images/${position}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        Authorization: `Bearer ${token}`,
      },
      body: file,
    }
  );

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function clearProductImages(productId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/products/${productId}/images`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getProductById(id) {
  const res = await apiFetch(`${API_URL}/products/${id}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateProduct(id, patch) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/products/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteProduct(id) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/products/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function placeOrder(orderData) {
  const token = getToken();
  const guestCart = token ? [] : readGuestCart();

  const res = await apiFetch(`${API_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      first_name: orderData.firstName,
      last_name: orderData.lastName,
      address: orderData.address,
      phone: orderData.phone,
      email: orderData.email,
      payment_method: orderData.payment === "card" ? "card" : "ramburs",
      voucher_code: orderData.voucherCode || null,
      items: guestCart,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  if (!token) saveGuestCart([]);
  return data;
}

export async function getMyOrders() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/orders/my`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getAllOrders() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getOrderById(id) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/orders/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateOrderStatus(orderId, status) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getCart() {
  const token = getToken();
  if (!token) return buildGuestCartResponse();

  const res = await apiFetch(`${API_URL}/cart`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function addCartItem(productId, quantity = 1) {
  const token = getToken();
  if (!token) {
    const cart = await buildGuestCartResponse();
    const existing = cart.items.find((item) => Number(item.product_id) === Number(productId));
    const stock = existing?.stock;
    const nextItems = readGuestCart();
    const nextItem = nextItems.find((item) => Number(item.product_id) === Number(productId));

    if (nextItem) {
      nextItem.quantity = stock
        ? Math.min(Number(nextItem.quantity) + quantity, stock)
        : Number(nextItem.quantity) + quantity;
    } else {
      nextItems.push({ product_id: Number(productId), quantity });
    }

    saveGuestCart(nextItems);
    return buildGuestCartResponse();
  }

  const res = await apiFetch(`${API_URL}/cart/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      product_id: productId,
      quantity,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateCartItem(productId, quantity) {
  const token = getToken();
  if (!token) {
    const nextItems = readGuestCart()
      .map((item) =>
        Number(item.product_id) === Number(productId)
          ? { ...item, quantity: Number(quantity) }
          : item
      )
      .filter((item) => item.quantity > 0);

    saveGuestCart(nextItems);
    return buildGuestCartResponse();
  }

  const res = await apiFetch(`${API_URL}/cart/items/${productId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ quantity }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteCartItem(productId) {
  const token = getToken();
  if (!token) {
    saveGuestCart(
      readGuestCart().filter((item) => Number(item.product_id) !== Number(productId))
    );
    return buildGuestCartResponse();
  }

  const res = await apiFetch(`${API_URL}/cart/items/${productId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function clearCartApi() {
  const token = getToken();
  if (!token) {
    saveGuestCart([]);
    return { items: [], total: 0 };
  }

  const res = await apiFetch(`${API_URL}/cart/clear`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getFavorites() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/favorites`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getFavoriteIds() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/favorites/ids`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function addFavorite(productId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/favorites/${productId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteFavorite(productId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/favorites/${productId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getWishlist() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/wishlist`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getWishlistIds() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/wishlist/ids`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function addToWishlist(productId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/wishlist/${productId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteFromWishlist(productId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/wishlist/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createTicket({ category, message }) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ category, message }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getMyTickets() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/my`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getAllTickets() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getTicketById(ticketId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/${ticketId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function sendTicketMessage(ticketId, { message }) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function closeTicket(ticketId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/${ticketId}/close`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function markTicketRead(ticketId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/${ticketId}/mark-read`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createBannedSupportTicket({ banToken, message }) {
  const res = await apiFetch(`${API_URL}/tickets/banned-support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ban_token: banToken, category: "ban", message }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getBannedSupportStatus(banToken) {
  const res = await apiFetch(
    `${API_URL}/tickets/banned-support/status?ban_token=${encodeURIComponent(
      banToken
    )}`
  );

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getBannedSupportTicket(ticketId, banToken) {
  const res = await apiFetch(
    `${API_URL}/tickets/banned-support/${ticketId}?ban_token=${encodeURIComponent(
      banToken
    )}`
  );

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function sendBannedSupportMessage(ticketId, { banToken, message }) {
  const res = await apiFetch(`${API_URL}/tickets/banned-support/${ticketId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ban_token: banToken, category: "ban", message }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getDashboardUsers() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getPendingUserApprovals() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/user-approvals`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateUserApproval(userId, action) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/user-approvals/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getUserLoginLogs(userId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/users/${userId}/login-logs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateUserBan(userId, { banType, reason = "" }) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/users/${userId}/ban`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ban_type: banType, reason }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateUserRole(userId, role) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/users/${userId}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ role }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function sendUserNotification(userId, message) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/users/${userId}/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function sendAllUsersNotification(message) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/users/notifications/all`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getVouchers() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/vouchers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createVoucher({ amount, discountType, expiresOn, usageType }) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/vouchers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      discount_type: discountType,
      amount,
      expires_on: expiresOn,
      usage_type: usageType,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function cancelVoucher(voucherId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/vouchers/${voucherId}/cancel`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function applyVoucher(code) {
  const token = getToken();
  if (!token) throw new Error("Trebuie să fii autentificat pentru a folosi un voucher");

  const res = await apiFetch(`${API_URL}/vouchers/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function reopenTicket(ticketId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/${ticketId}/reopen`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getUnreadTicketCount() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/unread-count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getDashboardUnreadCount() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/dashboard/unread-count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getNotifications({ unreadOnly = false } = {}) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const query = unreadOnly ? "?unread_only=true" : "";
  const res = await apiFetch(`${API_URL}/notifications${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getUnreadNotificationCount() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/notifications/unread-count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function markNotificationsRead(ids = []) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/notifications/mark-read`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getTicketCreateAvailability() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/create-availability`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getAssignableTicketUsers() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/assignable-users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function assignTicket(ticketId, assignedToUserId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/tickets/${ticketId}/assign`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assigned_to_user_id: assignedToUserId }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function askFishBot(
  message,
  contextProducts = [],
  focusedProduct = null
) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await apiFetch(`${API_URL}/assistant/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      context_products: contextProducts,
      focused_product: focusedProduct,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getFishbotConversations() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/assistant/conversations`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function saveFishbotConversation({
  clientKey,
  title,
  createdAt,
  endedAt,
  messages,
}) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/assistant/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      client_key: clientKey,
      title,
      created_at: createdAt,
      ended_at: endedAt,
      messages,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getProductReviews(productId) {
  const token = getToken();

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await apiFetch(`${API_URL}/products/${productId}/reviews`, {
    headers,
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function submitProductReview(productId, { rating, comment }) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await apiFetch(`${API_URL}/products/${productId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rating, comment }),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

