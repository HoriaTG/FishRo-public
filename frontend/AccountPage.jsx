import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  changePassword,
  deleteProfileImage,
  getFishbotConversations,
  getMe,
  getMyOrders,
  getNotifications,
  updateMe,
  uploadProfileImage,
} from "../api";
import FavoritesPage from "./FavoritesPage";
import MyTicketsPage from "./MyTicketsPage";
import WishlistPage from "./WishlistPage";
import "./AccountPage.css";

const SECTIONS = {
  PROFILE: "profile",
  PASSWORD: "password",
  ORDERS: "orders",
  STATS: "stats",
  FAVORITES: "favorites",
  WISHLIST: "wishlist",
  TICKETS: "tickets",
  FISHBOT: "fishbot",
  NOTIFICATIONS: "notifications",
};

const VALID_SECTIONS = new Set(Object.values(SECTIONS));
const PROFILE_PREVIEW_SIZE = 180;
const PROFILE_EXPORT_SIZE = 512;
const ORDERS_PER_PAGE = 3;
const NOTIFICATIONS_PER_PAGE = 4;
const FISHBOT_HISTORY_EVENT = "fishro-fishbot-history-updated";
const FISHBOT_PROFILE_IMAGE = "/images/profiles/fishbot-profile.png";

function clampProfileImagePosition(position, imageWidth, imageHeight, scale) {
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;

  function clampAxis(value, renderedSize) {
    if (renderedSize <= PROFILE_PREVIEW_SIZE) {
      return (PROFILE_PREVIEW_SIZE - renderedSize) / 2;
    }

    return Math.min(0, Math.max(PROFILE_PREVIEW_SIZE - renderedSize, value));
  }

  return {
    x: clampAxis(position.x, renderedWidth),
    y: clampAxis(position.y, renderedHeight),
  };
}

function getOrderStatusLabel(status) {
  switch (status) {
    case "trimisa":
      return "Trimisă";
    case "confirmata":
      return "Confirmată";
    case "in_tranzit":
      return "În tranzit";
    case "livrata":
      return "Livrată";
    case "anulata":
      return "Anulată";
    default:
      return status || "-";
  }
}

function getOrderStatusStyle(status) {
  switch (status) {
    case "trimisa":
      return {
        background: "rgba(59,130,246,0.18)",
        color: "#93c5fd",
        border: "1px solid rgba(59,130,246,0.28)",
      };
    case "confirmata":
      return {
        background: "rgba(168,85,247,0.18)",
        color: "#d8b4fe",
        border: "1px solid rgba(168,85,247,0.28)",
      };
    case "in_tranzit":
      return {
        background: "rgba(245,158,11,0.18)",
        color: "#fcd34d",
        border: "1px solid rgba(245,158,11,0.28)",
      };
    case "livrata":
      return {
        background: "rgba(34,197,94,0.18)",
        color: "#86efac",
        border: "1px solid rgba(34,197,94,0.28)",
      };
    case "anulata":
      return {
        background: "rgba(239,68,68,0.18)",
        color: "#fca5a5",
        border: "1px solid rgba(239,68,68,0.28)",
      };
    default:
      return {
        background: "rgba(255,255,255,0.08)",
        color: "white",
        border: "1px solid rgba(255,255,255,0.12)",
      };
  }
}

function parseBackendDate(value) {
  if (!value) return null;

  let normalized = value;
  if (
    typeof value === "string" &&
    !value.endsWith("Z") &&
    !/[+-]\d{2}:\d{2}$/.test(value)
  ) {
    normalized = `${value}Z`;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFishbotDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFishbotTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFishbotMessagePreview(conversation) {
  const firstUserMessage = conversation.messages?.find(
    (message) => message.sender === "user"
  );
  return firstUserMessage?.text || conversation.title || "Conversatie FishBot";
}

export default function AccountPage({
  me,
  onCartChange,
  unreadTicketCount,
  onTicketsChanged,
  onNotificationsChanged,
  onProfileChanged,
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSection = searchParams.get("section");
  const [activeSection, setActiveSection] = useState(
    VALID_SECTIONS.has(initialSection) ? initialSection : SECTIONS.PROFILE
  );
  const [hoveredSection, setHoveredSection] = useState(null);
  const [hoveredOrderId, setHoveredOrderId] = useState(null);
  const [statsChartYear, setStatsChartYear] = useState(new Date().getFullYear());
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageJumpOpen, setOrdersPageJumpOpen] = useState(false);
  const [ordersPageJumpValue, setOrdersPageJumpValue] = useState("");
  const [ordersPageJumpIndex, setOrdersPageJumpIndex] = useState(0);
  const ordersPageJumpRef = useRef(null);
  const [hoveredOrdersPagerControl, setHoveredOrdersPagerControl] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = useRef(null);
  const dragStateRef = useRef(null);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [profileImageDraft, setProfileImageDraft] = useState(null);
  const [isDeletingProfileImage, setIsDeletingProfileImage] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordResult, setPasswordResult] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [notificationsPageJumpOpen, setNotificationsPageJumpOpen] = useState(false);
  const [notificationsPageJumpValue, setNotificationsPageJumpValue] = useState("");
  const [notificationsPageJumpIndex, setNotificationsPageJumpIndex] = useState(0);
  const notificationsPageJumpRef = useRef(null);
  const [hoveredNotificationsPagerControl, setHoveredNotificationsPagerControl] =
    useState("");
  const [fishbotConversations, setFishbotConversations] = useState([]);
  const [fishbotConversationsLoading, setFishbotConversationsLoading] =
    useState(false);
  const [fishbotConversationsError, setFishbotConversationsError] = useState("");
  const [selectedFishbotConversationId, setSelectedFishbotConversationId] =
    useState("");
  const isStaff = me?.role === "moderator" || me?.role === "admin";

  const [profile, setProfile] = useState({
    fullName: "",
    phone: "",
    address: "",
    city: "",
    county: "",
    postalCode: "",
  });

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    setProfile({
      fullName: me.full_name || "",
      phone: me.phone || "",
      address: me.address || "",
      city: me.city || "",
      county: me.county || "",
      postalCode: me.postal_code || "",
    });
    setProfileImageUrl(me.profile_image_url || "");

    async function loadSavedProfile() {
      try {
        const freshMe = await getMe();
        if (cancelled) return;

        setProfile({
          fullName: freshMe.full_name || "",
          phone: freshMe.phone || "",
          address: freshMe.address || "",
          city: freshMe.city || "",
          county: freshMe.county || "",
          postalCode: freshMe.postal_code || "",
        });
        setProfileImageUrl(freshMe.profile_image_url || "");
      } catch {
        // Daca refresh-ul esueaza, ramanem cu datele deja primite din App.
      }
    }

    loadSavedProfile();

    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    let cancelled = false;

    async function refreshFishbotConversations() {
      if (!me) {
        setFishbotConversations([]);
        setSelectedFishbotConversationId("");
        return;
      }

      try {
        setFishbotConversationsLoading(true);
        setFishbotConversationsError("");
        const conversations = await getFishbotConversations();
        if (cancelled) return;

        setFishbotConversations(conversations);
        setSelectedFishbotConversationId((current) =>
          current && conversations.some((conversation) => conversation.id === current)
            ? current
            : conversations[0]?.id || ""
        );
      } catch (error) {
        if (!cancelled) {
          setFishbotConversationsError(
            error.message || "Nu am putut incarca conversatiile FishBot."
          );
        }
      } finally {
        if (!cancelled) {
          setFishbotConversationsLoading(false);
        }
      }
    }

    refreshFishbotConversations();
    window.addEventListener(FISHBOT_HISTORY_EVENT, refreshFishbotConversations);

    return () => {
      cancelled = true;
      window.removeEventListener(FISHBOT_HISTORY_EVENT, refreshFishbotConversations);
    };
  }, [me]);

  useEffect(() => {
    return () => {
      if (profileImageDraft?.src) {
        URL.revokeObjectURL(profileImageDraft.src);
      }
    };
  }, [profileImageDraft?.src]);

  useEffect(() => {
    if (isStaff && activeSection === SECTIONS.NOTIFICATIONS) {
      setActiveSection(SECTIONS.PROFILE);
      setSearchParams({});
    }
  }, [activeSection, isStaff, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!me || isStaff || activeSection !== SECTIONS.NOTIFICATIONS) return;

      try {
        setNotificationsLoading(true);
        setNotificationsError("");
        const data = await getNotifications();
        if (!cancelled) {
          setNotifications(data);
          await onNotificationsChanged?.();
        }
      } catch (e) {
        if (!cancelled) {
          setNotificationsError(e.message || "Eroare la încărcarea notificărilor.");
        }
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [me, isStaff, activeSection, onNotificationsChanged]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!me) return;

      try {
        setOrdersError("");
        const data = await getMyOrders();
        if (!cancelled) {
          setOrders(data);
        }
      } catch (e) {
        if (!cancelled) {
          setOrdersError(e.message || "Eroare la încărcarea comenzilor.");
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    const section = searchParams.get("section");
    setActiveSection(VALID_SECTIONS.has(section) ? section : SECTIONS.PROFILE);
  }, [searchParams]);

  function handleProfileChange(e) {
    const { name, value } = e.target;
    setProfile((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleProfileSaveOld(e) {
    e.preventDefault();
    setProfileMsg("Datele de profil au fost salvate local momentan ✅");

    setTimeout(() => {
      setProfileMsg("");
    }, 1800);
  }

  void handleProfileSaveOld;

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileMsg("");
    setProfileError("");
    setIsSavingProfile(true);

    try {
      let updated = await updateMe({
        full_name: profile.fullName,
        phone: profile.phone,
        address: profile.address,
        city: profile.city,
        county: profile.county,
        postal_code: profile.postalCode,
      });

      if (profileImageDraft) {
        const blob = await createProfileImageBlob();
        if (blob) {
          const file = new File([blob], "profile-image.jpg", { type: "image/jpeg" });
          updated = await uploadProfileImage(file);
        }
      }

      setProfile({
        fullName: updated.full_name || "",
        phone: updated.phone || "",
        address: updated.address || "",
        city: updated.city || "",
        county: updated.county || "",
        postalCode: updated.postal_code || "",
      });
      setProfileImageUrl(updated.profile_image_url || "");
      setProfileImageDraft(null);
      setProfileMsg("Datele de profil au fost salvate.");
      await onProfileChanged?.();

      setTimeout(() => {
        setProfileMsg("");
      }, 1800);
    } catch (e) {
      setProfileError(e.message || "Nu am putut salva datele de profil.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  function openProfileImagePicker() {
    fileInputRef.current?.click();
  }

  function handleProfileImageSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Alege un fișier imagine.");
      return;
    }

    const src = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const baseScale = Math.max(
        PROFILE_PREVIEW_SIZE / image.naturalWidth,
        PROFILE_PREVIEW_SIZE / image.naturalHeight
      );
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const scale = baseScale;
      const position = clampProfileImagePosition(
        {
          x: (PROFILE_PREVIEW_SIZE - width * scale) / 2,
          y: (PROFILE_PREVIEW_SIZE - height * scale) / 2,
        },
        width,
        height,
        scale
      );

      setProfileImageDraft((current) => {
        if (current?.src) URL.revokeObjectURL(current.src);
        return {
          src,
          name: file.name,
          width,
          height,
          baseScale,
          zoom: 1,
          scale,
          position,
        };
      });
      setProfileMsg("");
      setProfileError("");
    };
    image.onerror = () => {
      URL.revokeObjectURL(src);
      setProfileError("Nu am putut citi imaginea aleasă.");
    };
    image.src = src;
  }

  function handleProfileImagePointerDown(e) {
    if (!profileImageDraft) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      position: profileImageDraft.position,
    };
  }

  function handleProfileImagePointerMove(e) {
    if (!profileImageDraft || !dragStateRef.current) return;

    const drag = dragStateRef.current;
    const nextPosition = clampProfileImagePosition(
      {
        x: drag.position.x + e.clientX - drag.startX,
        y: drag.position.y + e.clientY - drag.startY,
      },
      profileImageDraft.width,
      profileImageDraft.height,
      profileImageDraft.scale
    );

    setProfileImageDraft((current) =>
      current ? { ...current, position: nextPosition } : current
    );
  }

  function handleProfileImagePointerUp(e) {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
    }
  }

  function handleProfileImageZoom(e) {
    const zoom = Number(e.target.value);
    setProfileImageDraft((current) => {
      if (!current) return current;

      const centerX = PROFILE_PREVIEW_SIZE / 2 - current.position.x;
      const centerY = PROFILE_PREVIEW_SIZE / 2 - current.position.y;
      const nextScale = current.baseScale * zoom;
      const scaleRatio = nextScale / current.scale;
      const nextPosition = clampProfileImagePosition(
        {
          x: PROFILE_PREVIEW_SIZE / 2 - centerX * scaleRatio,
          y: PROFILE_PREVIEW_SIZE / 2 - centerY * scaleRatio,
        },
        current.width,
        current.height,
        nextScale
      );

      return {
        ...current,
        zoom,
        scale: nextScale,
        position: nextPosition,
      };
    });
  }

  async function createProfileImageBlob() {
    if (!profileImageDraft) return null;

    const image = new Image();
    image.src = profileImageDraft.src;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_EXPORT_SIZE;
    canvas.height = PROFILE_EXPORT_SIZE;
    const ctx = canvas.getContext("2d");
    const exportScale = PROFILE_EXPORT_SIZE / PROFILE_PREVIEW_SIZE;

    ctx.drawImage(
      image,
      profileImageDraft.position.x * exportScale,
      profileImageDraft.position.y * exportScale,
      profileImageDraft.width * profileImageDraft.scale * exportScale,
      profileImageDraft.height * profileImageDraft.scale * exportScale
    );

    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });
  }

  function handleProfileImageCancel() {
    setProfileImageDraft(null);
  }

  async function handleProfileImageDelete() {
    setProfileMsg("");
    setProfileError("");

    try {
      setIsDeletingProfileImage(true);
      const updated = await deleteProfileImage();
      setProfileImageUrl(updated.profile_image_url || "");
      setProfileImageDraft(null);
      setProfileMsg("Poza de profil a fost eliminată.");
      await onProfileChanged?.();
    } catch (e) {
      setProfileError(e.message || "Nu am putut elimina poza de profil.");
    } finally {
      setIsDeletingProfileImage(false);
    }
  }

  function handlePasswordChange(e) {
    const { name, value } = e.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordResult({
        type: "error",
        title: "Parolele nu coincid",
        message: "Confirmarea parolei noi este diferită. Parola nu a fost schimbată.",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordResult({
        type: "error",
        title: "Parola este prea scurtă",
        message: "Parola nouă trebuie să conțină cel puțin 6 caractere.",
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const result = await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordResult({
        type: "success",
        title: "Parolă actualizată",
        message: result.message || "Parola a fost schimbată cu succes.",
      });
    } catch (error) {
      setPasswordResult({
        type: "error",
        title: "Parola nu a fost schimbată",
        message: error.message || "A apărut o eroare la schimbarea parolei.",
      });
    } finally {
      setIsChangingPassword(false);
    }
  }

  function formatOrderDate(value) {
    if (!value) return "Data indisponibilă";

    let normalized = value;

    if (
      typeof value === "string" &&
      !value.endsWith("Z") &&
      !/[+-]\d{2}:\d{2}$/.test(value)
    ) {
      normalized = `${value}Z`;
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      return "Data indisponibilă";
    }

    return date.toLocaleString();
  }

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    const totalProductsValue = orders.reduce(
      (sum, order) => sum + Number(order.subtotal || order.total || 0),
      0
    );
    const totalDiscounts = orders.reduce(
      (sum, order) => sum + Number(order.discount_amount || 0),
      0
    );
    const vouchersUsed = orders.filter((order) => order.voucher_code).length;
    const yearlyTotals = new Map();
    const yearlyStats = {};

    let totalItems = 0;
    for (const order of orders) {
      const orderDate = parseBackendDate(order.created_at);
      if (orderDate && !Number.isNaN(orderDate.getTime())) {
        const year = orderDate.getFullYear();
        const month = orderDate.getMonth();
        const yearStats =
          yearlyStats[year] || {
            totalOrders: 0,
            totalSpent: 0,
            totalItems: 0,
            totalProductsValue: 0,
            totalDiscounts: 0,
            vouchersUsed: 0,
          };
        const months =
          yearlyTotals.get(year) ||
          Array.from({ length: 12 }, (_, index) => ({
            key: `${year}-${String(index + 1).padStart(2, "0")}`,
            label: new Date(year, index, 1).toLocaleDateString("ro-RO", {
              month: "short",
            }),
            total: 0,
          }));

        months[month].total += Number(order.total || 0);
        yearlyTotals.set(year, months);

        yearStats.totalOrders += 1;
        yearStats.totalSpent += Number(order.total || 0);
        yearStats.totalProductsValue += Number(order.subtotal || order.total || 0);
        yearStats.totalDiscounts += Number(order.discount_amount || 0);
        yearStats.vouchersUsed += order.voucher_code ? 1 : 0;

        for (const item of order.items) {
          yearStats.totalItems += item.quantity;
        }

        yearlyStats[year] = yearStats;
      }

      for (const item of order.items) {
        totalItems += item.quantity;
      }
    }

    const currentYear = new Date().getFullYear();
    const years = Array.from(yearlyTotals.keys()).sort((a, b) => a - b);
    if (!years.includes(currentYear)) years.push(currentYear);
    years.sort((a, b) => a - b);

    const yearlySpend = {};
    for (const year of years) {
      yearlySpend[year] =
        yearlyTotals.get(year) ||
        Array.from({ length: 12 }, (_, index) => ({
          key: `${year}-${String(index + 1).padStart(2, "0")}`,
          label: new Date(year, index, 1).toLocaleDateString("ro-RO", {
            month: "short",
          }),
          total: 0,
        }));
    }

    return {
      totalOrders,
      totalSpent,
      totalItems,
      totalProductsValue,
      totalDiscounts,
      vouchersUsed,
      years,
      yearlySpend,
      yearlyStats,
    };
  }, [orders]);

  const safeStatsChartYear = stats.years.includes(statsChartYear)
    ? statsChartYear
    : stats.years[stats.years.length - 1] || new Date().getFullYear();
  const visibleYearSpend = stats.yearlySpend[safeStatsChartYear] || [];
  const maxYearSpend = Math.max(1, ...visibleYearSpend.map((month) => month.total));
  const currentYearIndex = Math.max(0, stats.years.indexOf(safeStatsChartYear));
  const selectedYearStats =
    stats.yearlyStats[safeStatsChartYear] || {
      totalOrders: 0,
      totalSpent: 0,
      totalItems: 0,
      totalProductsValue: 0,
      totalDiscounts: 0,
      vouchersUsed: 0,
    };

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    setStatsChartYear((prev) =>
      stats.years.includes(prev)
        ? prev
        : stats.years.includes(currentYear)
          ? currentYear
          : stats.years[stats.years.length - 1] || currentYear
    );
  }, [stats.years]);

  const totalOrdersPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const visibleOrders = useMemo(() => {
    const start = (ordersPage - 1) * ORDERS_PER_PAGE;
    return orders.slice(start, start + ORDERS_PER_PAGE);
  }, [ordersPage, orders]);

  useEffect(() => {
    setOrdersPage((current) => Math.min(Math.max(1, current), totalOrdersPages));
  }, [totalOrdersPages]);

  useEffect(() => {
    if (!ordersPageJumpOpen) return undefined;

    function handlePointerDown(event) {
      if (ordersPageJumpRef.current?.contains(event.target)) return;
      setOrdersPageJumpOpen(false);
      setOrdersPageJumpValue("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [ordersPageJumpOpen]);

  function getOrdersPageItems() {
    if (totalOrdersPages <= 4) {
      return Array.from({ length: totalOrdersPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalOrdersPages, ordersPage]);

    if (ordersPage <= 2) {
      pages.add(2);
    } else if (ordersPage >= totalOrdersPages - 1) {
      pages.add(totalOrdersPages - 1);
    } else {
      pages.add(ordersPage - 1);
      pages.add(ordersPage + 1);
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

  function goToOrdersPage(page) {
    setOrdersPage(Math.min(Math.max(1, page), totalOrdersPages));
    setOrdersPageJumpOpen(false);
    setOrdersPageJumpValue("");
  }

  function submitOrdersPageJump() {
    const trimmed = ordersPageJumpValue.trim();
    if (!/^-?\d+$/.test(trimmed)) return;

    goToOrdersPage(Number(trimmed));
  }

  const totalNotificationsPages = Math.max(
    1,
    Math.ceil(notifications.length / NOTIFICATIONS_PER_PAGE)
  );
  const visibleNotifications = useMemo(() => {
    const start = (notificationsPage - 1) * NOTIFICATIONS_PER_PAGE;
    return notifications.slice(start, start + NOTIFICATIONS_PER_PAGE);
  }, [notificationsPage, notifications]);

  useEffect(() => {
    setNotificationsPage((current) =>
      Math.min(Math.max(1, current), totalNotificationsPages)
    );
  }, [totalNotificationsPages]);

  useEffect(() => {
    if (!notificationsPageJumpOpen) return undefined;

    function handlePointerDown(event) {
      if (notificationsPageJumpRef.current?.contains(event.target)) return;
      setNotificationsPageJumpOpen(false);
      setNotificationsPageJumpValue("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [notificationsPageJumpOpen]);

  function getNotificationsPageItems() {
    if (totalNotificationsPages <= 4) {
      return Array.from({ length: totalNotificationsPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalNotificationsPages, notificationsPage]);

    if (notificationsPage <= 2) {
      pages.add(2);
    } else if (notificationsPage >= totalNotificationsPages - 1) {
      pages.add(totalNotificationsPages - 1);
    } else {
      pages.add(notificationsPage - 1);
      pages.add(notificationsPage + 1);
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

  function goToNotificationsPage(page) {
    setNotificationsPage(Math.min(Math.max(1, page), totalNotificationsPages));
    setNotificationsPageJumpOpen(false);
    setNotificationsPageJumpValue("");
  }

  function submitNotificationsPageJump() {
    const trimmed = notificationsPageJumpValue.trim();
    if (!/^-?\d+$/.test(trimmed)) return;

    goToNotificationsPage(Number(trimmed));
  }

  const selectedFishbotConversation =
    fishbotConversations.find(
      (conversation) => conversation.id === selectedFishbotConversationId
    ) || fishbotConversations[0] || null;

  function getMenuCardStyle(section) {
    const isActive = activeSection === section;
    const isHovered = hoveredSection === section;

    if (isActive) {
      return {
        ...styles.menuCard,
        ...styles.menuCardActive,
      };
    }

    if (isHovered) {
      return {
        ...styles.menuCard,
        ...styles.menuCardHover,
      };
    }

    return styles.menuCard;
  }

  function getOrderCardStyle(orderId) {
    const isHovered = hoveredOrderId === orderId;

    if (isHovered) {
      return {
        ...styles.orderCardClickable,
        ...styles.orderCardHover,
      };
    }

    return styles.orderCardClickable;
  }

  function selectSection(section) {
    setActiveSection(section);

    if (section === SECTIONS.PROFILE) {
      setSearchParams({});
      return;
    }

    setSearchParams({ section });
  }

  if (!me) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <h2>Contul meu</h2>
          <p>Trebuie să fii autentificat pentru a vedea această pagină.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}></div>

      <div style={styles.cardsGrid}>
        <button
          type="button"
          style={getMenuCardStyle(SECTIONS.PROFILE)}
          onMouseEnter={() => setHoveredSection(SECTIONS.PROFILE)}
          onMouseLeave={() => setHoveredSection(null)}
          onClick={() => selectSection(SECTIONS.PROFILE)}
        >
          <div style={styles.menuCardTitle}>Date cont</div>
          <div style={styles.menuEmoji}>👤</div>
        </button>

        <button
          type="button"
          style={getMenuCardStyle(SECTIONS.ORDERS)}
          onMouseEnter={() => setHoveredSection(SECTIONS.ORDERS)}
          onMouseLeave={() => setHoveredSection(null)}
          onClick={() => selectSection(SECTIONS.ORDERS)}
        >
          <div style={styles.menuCardTitle}>Comenzile mele</div>
          <div style={styles.menuEmoji}>📦</div>
        </button>

        <button
          type="button"
          style={getMenuCardStyle(SECTIONS.FAVORITES)}
          onMouseEnter={() => setHoveredSection(SECTIONS.FAVORITES)}
          onMouseLeave={() => setHoveredSection(null)}
          onClick={() => selectSection(SECTIONS.FAVORITES)}
        >
          <div style={styles.menuCardTitle}>Favorite</div>
          <div style={styles.menuEmoji}>{"\u{1F496}"}</div>
        </button>

        {me?.role === "user" && (
          <button
            type="button"
            style={getMenuCardStyle(SECTIONS.WISHLIST)}
            onMouseEnter={() => setHoveredSection(SECTIONS.WISHLIST)}
            onMouseLeave={() => setHoveredSection(null)}
            onClick={() => selectSection(SECTIONS.WISHLIST)}
          >
            <div style={styles.menuCardTitle}>Wishlist stoc</div>
            <div style={styles.menuEmoji}>{"\u{1F514}"}</div>
          </button>
        )}

        {me?.role === "user" && (
          <button
            type="button"
            style={getMenuCardStyle(SECTIONS.TICKETS)}
            onMouseEnter={() => setHoveredSection(SECTIONS.TICKETS)}
            onMouseLeave={() => setHoveredSection(null)}
            onClick={() => selectSection(SECTIONS.TICKETS)}
          >
            <div style={styles.menuCardTitle}>Tichetele mele</div>
            <div style={styles.menuEmojiWrap}>
              <span style={styles.menuEmoji}>{"\u{1F3AB}"}</span>
              {unreadTicketCount > 0 && (
                <span style={styles.menuBadge}>{unreadTicketCount}</span>
              )}
            </div>
          </button>
        )}

        {me?.role === "user" && (
          <button
            type="button"
            style={getMenuCardStyle(SECTIONS.FISHBOT)}
            onMouseEnter={() => setHoveredSection(SECTIONS.FISHBOT)}
            onMouseLeave={() => setHoveredSection(null)}
            onClick={() => selectSection(SECTIONS.FISHBOT)}
          >
            <div style={styles.menuCardTitle}>Conversatii FishBot</div>
            <div style={styles.menuEmoji}>{"\u{1F4AC}"}</div>
          </button>
        )}

        {!isStaff && (
        <button
          type="button"
          style={getMenuCardStyle(SECTIONS.NOTIFICATIONS)}
          onMouseEnter={() => setHoveredSection(SECTIONS.NOTIFICATIONS)}
          onMouseLeave={() => setHoveredSection(null)}
          onClick={() => selectSection(SECTIONS.NOTIFICATIONS)}
        >
          <div style={styles.menuCardTitle}>Istoric notificări</div>
          <div style={styles.menuEmoji}>{"\u{1F514}"}</div>
        </button>
        )}

        <button
          type="button"
          style={getMenuCardStyle(SECTIONS.STATS)}
          onMouseEnter={() => setHoveredSection(SECTIONS.STATS)}
          onMouseLeave={() => setHoveredSection(null)}
          onClick={() => selectSection(SECTIONS.STATS)}
        >
          <div style={styles.menuCardTitle}>Statistici</div>
          <div style={styles.menuEmoji}>📊</div>
        </button>

        <button
          type="button"
          style={getMenuCardStyle(SECTIONS.PASSWORD)}
          onMouseEnter={() => setHoveredSection(SECTIONS.PASSWORD)}
          onMouseLeave={() => setHoveredSection(null)}
          onClick={() => selectSection(SECTIONS.PASSWORD)}
        >
          <div style={styles.menuCardTitle}>Schimbă parola</div>
          <div style={styles.menuEmoji}>🔑</div>
        </button>

      </div>

      <div style={styles.contentWrap}>
        {activeSection === SECTIONS.PROFILE && (
          <section style={styles.panel}>
            <div className="account-profile-layout">
              <aside className="account-profile-photo-panel">
                <div
                  className={`account-profile-photo ${
                    profileImageDraft ? "is-editing" : ""
                  }`}
                  onPointerDown={handleProfileImagePointerDown}
                  onPointerMove={handleProfileImagePointerMove}
                  onPointerUp={handleProfileImagePointerUp}
                  onPointerCancel={handleProfileImagePointerUp}
                >
                  {profileImageDraft ? (
                    <img
                      src={profileImageDraft.src}
                      alt=""
                      draggable="false"
                      style={{
                        width: profileImageDraft.width * profileImageDraft.scale,
                        height: profileImageDraft.height * profileImageDraft.scale,
                        transform: `translate(${profileImageDraft.position.x}px, ${profileImageDraft.position.y}px)`,
                      }}
                    />
                  ) : profileImageUrl ? (
                    <img src={profileImageUrl} alt="Poza de profil" />
                  ) : (
                    <div className="account-profile-placeholder" aria-hidden="true">
                      <span className="account-profile-placeholder-head" />
                      <span className="account-profile-placeholder-body" />
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  className="account-profile-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleProfileImageSelect}
                />

                {profileImageDraft ? (
                  <>
                    <label className="account-profile-zoom">
                      <span>Zoom</span>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.01"
                        value={profileImageDraft.zoom}
                        onChange={handleProfileImageZoom}
                      />
                    </label>
                    <div className="account-profile-photo-actions">
                      <button type="button" onClick={handleProfileImageCancel}>
                        Renunță
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="account-profile-upload-link"
                    onClick={openProfileImagePicker}
                  >
                    {profileImageUrl
                      ? "Schimbă poza de profil"
                      : "Încarcă o poză de profil"}
                  </button>
                )}
                {!profileImageDraft && profileImageUrl && (
                  <button
                    type="button"
                    className="account-profile-remove-link"
                    onClick={handleProfileImageDelete}
                    disabled={isDeletingProfileImage}
                  >
                    {isDeletingProfileImage
                      ? "Se elimină poza..."
                      : "Elimină poza de profil"}
                  </button>
                )}
              </aside>

            <form
              onSubmit={handleProfileSave}
              style={styles.form}
              className="account-profile-form"
            >
              <div style={styles.row2}>
                <div>
                  <label style={styles.label}>Username</label>
                  <input
                    name="username"
                    value={me.username}
                    style={styles.inputDisabled}
                    disabled
                  />
                </div>

                <div>
                  <label style={styles.label}>Email</label>
                  <input
                    name="email"
                    value={me.email}
                    style={styles.inputDisabled}
                    disabled
                  />
                </div>
              </div>

              <div style={styles.row2}>
                <div>
                  <label style={styles.label}>Nume complet</label>
                  <input
                    name="fullName"
                    value={profile.fullName}
                    onChange={handleProfileChange}
                    style={styles.input}
                    placeholder="Ex: Horia Teodor"
                  />
                </div>

                <div>
                  <label style={styles.label}>Telefon</label>
                  <input
                    name="phone"
                    value={profile.phone}
                    onChange={handleProfileChange}
                    style={styles.input}
                    placeholder="Ex: 07xxxxxxxx"
                  />
                </div>
              </div>

              <div>
                <label style={styles.label}>Adresă de livrare</label>
                <input
                  name="address"
                  value={profile.address}
                  onChange={handleProfileChange}
                  style={styles.input}
                  placeholder="Stradă, număr, bloc, apartament"
                />
              </div>

              <div style={styles.row3}>
                <div>
                  <label style={styles.label}>Oraș</label>
                  <input
                    name="city"
                    value={profile.city}
                    onChange={handleProfileChange}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Județ</label>
                  <input
                    name="county"
                    value={profile.county}
                    onChange={handleProfileChange}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Cod poștal</label>
                  <input
                    name="postalCode"
                    value={profile.postalCode}
                    onChange={handleProfileChange}
                    style={styles.input}
                  />
                </div>
              </div>

              <div className="account-profile-submit-row">
                <button
                  type="submit"
                  className="account-profile-submit"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? "Se salvează..." : "Salvează modificările"}
                </button>
              </div>

              {profileMsg && <p style={styles.ok}>{profileMsg}</p>}
              {profileError && <p style={styles.err}>{profileError}</p>}
            </form>
            </div>
          </section>
        )}

        {activeSection === SECTIONS.ORDERS && (
          <section style={styles.panel}>
            {ordersError && <p style={styles.err}>{ordersError}</p>}
            {!ordersError && orders.length === 0 && (
              <p style={styles.muted}>Nu ai nicio comandă încă.</p>
            )}

            <div style={styles.ordersWrap}>
              {visibleOrders.map((order) => (
                <div
                  key={order.id}
                  style={getOrderCardStyle(order.id)}
                  onMouseEnter={() => setHoveredOrderId(order.id)}
                  onMouseLeave={() => setHoveredOrderId(null)}
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div style={styles.orderTop}>
                    <div>
                      <strong>{order.order_number}</strong>
                    </div>

                    <div style={styles.orderTopRight}>
                      <span
                        style={{
                          ...styles.orderStatusBadge,
                          ...getOrderStatusStyle(order.status),
                        }}
                      >
                        {getOrderStatusLabel(order.status)}
                      </span>

                      <div style={styles.orderTotal}>
                        {order.total.toFixed(2)} lei
                      </div>
                    </div>
                  </div>

                  <div style={styles.orderDate}>
                    {formatOrderDate(order.created_at)}
                  </div>

                  <div style={styles.orderItems}>
                    {order.items.map((item) => (
                      <div key={item.id} style={styles.orderItemRow}>
                        <span>
                          {item.product_name} ({item.product_code}) ×{" "}
                          {item.quantity}
                        </span>
                        <strong>{item.line_total.toFixed(2)} lei</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Array.from({
                length: Math.max(0, ORDERS_PER_PAGE - visibleOrders.length),
              }).map((_, index) => (
                <div
                  key={`order-placeholder-${index}`}
                  style={{
                    ...styles.orderCardClickable,
                    ...styles.orderCardPlaceholder,
                  }}
                  aria-hidden="true"
                >
                  <div style={styles.orderTop}>
                    <div>
                      <strong>ORDER-000000</strong>
                    </div>
                    <div style={styles.orderTopRight}>
                      <span style={styles.orderStatusBadge}>Status</span>
                      <div style={styles.orderTotal}>0.00 lei</div>
                    </div>
                  </div>
                  <div style={styles.orderDate}>1/1/2026, 12:00:00 AM</div>
                  <div style={styles.orderItems}>
                    <div style={styles.orderItemRow}>
                      <span>Produs exemplu (000000) × 1</span>
                      <strong>0.00 lei</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!ordersError && orders.length > ORDERS_PER_PAGE && (
              <div style={styles.pagination} aria-label="Paginare comenzi">
                <button
                  type="button"
                  style={{
                    ...styles.paginationBtn,
                    ...(hoveredOrdersPagerControl === "prev" && ordersPage > 1
                      ? styles.paginationBtnHover
                      : {}),
                    ...(ordersPage <= 1 ? styles.paginationBtnDisabled : {}),
                  }}
                  onClick={() => goToOrdersPage(ordersPage - 1)}
                  onMouseEnter={() => setHoveredOrdersPagerControl("prev")}
                  onMouseLeave={() => setHoveredOrdersPagerControl("")}
                  disabled={ordersPage <= 1}
                >
                  Pagina anterioară
                </button>

                <div
                  ref={ordersPageJumpRef}
                  style={{
                    ...styles.paginationPages,
                    ...(ordersPageJumpOpen ? styles.paginationPagesWithJump : {}),
                  }}
                >
                  {getOrdersPageItems().map((item, index) =>
                    typeof item === "number" ? (
                      <button
                        key={item}
                        type="button"
                        style={{
                          ...styles.paginationNumber,
                          ...(item === ordersPage ? styles.paginationNumberActive : {}),
                        }}
                        onClick={() => goToOrdersPage(item)}
                        aria-current={item === ordersPage ? "page" : undefined}
                      >
                        {item}
                      </button>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        style={styles.paginationNumber}
                        onClick={() => {
                          setOrdersPageJumpOpen(true);
                          setOrdersPageJumpValue("");
                          setOrdersPageJumpIndex(index);
                        }}
                      >
                        ...
                      </button>
                    )
                  )}
                  {ordersPageJumpOpen && (
                    <div
                      style={{
                        ...styles.paginationJumpInline,
                        left: ordersPageJumpIndex * 44 + 19,
                      }}
                    >
                      <input
                        value={ordersPageJumpValue}
                        onChange={(event) => setOrdersPageJumpValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            submitOrdersPageJump();
                          }
                          if (event.key === "Escape") {
                            setOrdersPageJumpOpen(false);
                            setOrdersPageJumpValue("");
                          }
                        }}
                        style={styles.paginationJumpInput}
                        inputMode="numeric"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  style={{
                    ...styles.paginationBtn,
                    ...(hoveredOrdersPagerControl === "next" &&
                    ordersPage < totalOrdersPages
                      ? styles.paginationBtnHover
                      : {}),
                    ...(ordersPage >= totalOrdersPages
                      ? styles.paginationBtnDisabled
                      : {}),
                  }}
                  onClick={() => goToOrdersPage(ordersPage + 1)}
                  onMouseEnter={() => setHoveredOrdersPagerControl("next")}
                  onMouseLeave={() => setHoveredOrdersPagerControl("")}
                  disabled={ordersPage >= totalOrdersPages}
                >
                  Pagina următoare
                </button>

              </div>
            )}
          </section>
        )}

        {activeSection === SECTIONS.FAVORITES && (
          <section style={styles.panel}>
            <FavoritesPage onCartChange={onCartChange} embedded />
          </section>
        )}

        {activeSection === SECTIONS.PASSWORD && (
          <section style={styles.panel}>
            <p style={styles.passwordHint}>
              Pentru siguranță, introdu parola actuală înainte de a alege una nouă.
            </p>

            <form onSubmit={handlePasswordSubmit} style={styles.passwordForm}>
              <div>
                <label style={styles.label}>Parola actuală</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange}
                  style={styles.input}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div style={styles.row2}>
                <div>
                  <label style={styles.label}>Parola nouă</label>
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                    style={styles.input}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div>
                  <label style={styles.label}>Confirmă parola nouă</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                    style={styles.input}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="account-password-submit"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Se schimbă parola..." : "Schimbă parola"}
              </button>
            </form>
          </section>
        )}

        {activeSection === SECTIONS.WISHLIST && (
          <section style={styles.panel}>
            <WishlistPage embedded />
          </section>
        )}

        {activeSection === SECTIONS.TICKETS && (
          <section style={styles.panel}>
            <MyTicketsPage
              me={me}
              onTicketsChanged={onTicketsChanged}
              embedded
            />
          </section>
        )}

        {activeSection === SECTIONS.FISHBOT && (
          <section style={styles.panel}>
            {fishbotConversationsLoading ? (
              <p style={styles.muted}>Se incarca conversatiile FishBot...</p>
            ) : fishbotConversationsError ? (
              <p style={styles.err}>{fishbotConversationsError}</p>
            ) : fishbotConversations.length === 0 ? (
              <div style={styles.fishbotHistoryEmpty}>
                <div style={styles.fishbotHistoryEmptyIcon}>{"\u{1F4AC}"}</div>
                <h3 style={styles.fishbotHistoryEmptyTitle}>
                  Nu exista conversatii salvate
                </h3>
                <p style={styles.muted}>
                  Conversatiile cu FishBot apar aici dupa ce chatul se reseteaza,
                  de exemplu dupa refresh.
                </p>
              </div>
            ) : (
              <div style={styles.fishbotHistoryLayout}>
                <aside style={styles.fishbotHistoryList}>
                  <div style={styles.fishbotHistoryColumnTitle}>
                    Istoric conversatii
                  </div>
                  {fishbotConversations.map((conversation) => {
                    const isSelected =
                      selectedFishbotConversation?.id === conversation.id;

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        style={{
                          ...styles.fishbotHistoryItem,
                          ...(isSelected ? styles.fishbotHistoryItemActive : {}),
                        }}
                        onClick={() =>
                          setSelectedFishbotConversationId(conversation.id)
                        }
                      >
                        <span style={styles.fishbotHistoryItemTitle}>
                          {getFishbotMessagePreview(conversation)}
                        </span>
                        <span style={styles.fishbotHistoryItemMeta}>
                          {formatFishbotDate(conversation.ended_at)}
                        </span>
                      </button>
                    );
                  })}
                </aside>

                <div style={styles.fishbotHistoryThread}>
                  <div style={styles.fishbotHistoryThreadHeader}>
                    <div>
                      <div style={styles.fishbotHistoryThreadTitle}>
                        Mesaje conversatie
                      </div>
                    </div>
                    <div style={styles.fishbotHistoryCount}>
                      {selectedFishbotConversation?.messages?.length || 0} mesaje
                    </div>
                  </div>

                  <div style={styles.fishbotHistoryMessages}>
                    {selectedFishbotConversation?.messages?.map((message) => {
                      const isUserMessage = message.sender === "user";

                      return (
                        <div
                          key={message.id}
                          style={{
                            ...styles.fishbotHistoryMessageRow,
                            ...(isUserMessage
                              ? styles.fishbotHistoryMessageRowUser
                              : styles.fishbotHistoryMessageRowBot),
                          }}
                        >
                          {!isUserMessage && (
                            <div style={styles.fishbotHistoryAvatar}>
                              <img
                                src={FISHBOT_PROFILE_IMAGE}
                                alt=""
                                style={styles.fishbotHistoryAvatarImage}
                              />
                            </div>
                          )}
                          <div
                            style={{
                              ...styles.fishbotHistoryBubble,
                              ...(isUserMessage
                                ? styles.fishbotHistoryBubbleUser
                                : styles.fishbotHistoryBubbleBot),
                            }}
                          >
                            <div
                              style={{
                                ...styles.fishbotHistoryTail,
                                ...(isUserMessage
                                  ? styles.fishbotHistoryTailUser
                                  : styles.fishbotHistoryTailBot),
                              }}
                            />
                            <div style={styles.fishbotHistorySender}>
                              {isUserMessage ? "Tu" : "FishBot"}
                            </div>
                            <div style={styles.fishbotHistoryText}>
                              {message.text}
                            </div>
                            <div style={styles.fishbotHistoryTime}>
                              {formatFishbotTime(message.created_at)}
                            </div>
                          </div>
                          {isUserMessage && (
                            <div style={styles.fishbotHistoryAvatar}>
                              {me?.profile_image_url ? (
                                <img
                                  src={me.profile_image_url}
                                  alt=""
                                  style={styles.fishbotHistoryAvatarImage}
                                />
                              ) : (
                                <span style={styles.fishbotHistoryAvatarFallback}>
                                  {(me?.username || me?.full_name || "U")
                                    .trim()
                                    .slice(0, 1)
                                    .toUpperCase() || "U"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeSection === SECTIONS.NOTIFICATIONS && (
          <section style={styles.panel}>
            {notificationsLoading && <p>Loading...</p>}
            {notificationsError && <p style={styles.err}>{notificationsError}</p>}
            {!notificationsLoading && !notificationsError && notifications.length === 0 && (
              <p style={styles.muted}>Nu ai notificări încă.</p>
            )}

            <div style={styles.notificationsWrap}>
              {visibleNotifications.map((notification) => (
                <div key={notification.id} style={styles.notificationRow}>
                  <div>
                    <div style={styles.notificationMessage}>{notification.message}</div>
                    <div style={styles.notificationDate}>
                      {formatOrderDate(notification.created_at)}
                    </div>
                  </div>
                  <span
                    style={
                      notification.is_read
                        ? styles.notificationReadBadge
                        : styles.notificationUnreadBadge
                    }
                  >
                    {notification.is_read ? "Citită" : "Necitită"}
                  </span>
                </div>
              ))}
              {notifications.length > 0 &&
                Array.from({
                  length: Math.max(
                    0,
                    NOTIFICATIONS_PER_PAGE - visibleNotifications.length
                  ),
                }).map((_, index) => (
                  <div
                    key={`notification-placeholder-${index}`}
                    style={{
                      ...styles.notificationRow,
                      ...styles.invisiblePlaceholder,
                    }}
                  >
                    <div>
                      <div style={styles.notificationMessage}>Placeholder</div>
                      <div style={styles.notificationDate}>Placeholder</div>
                    </div>
                    <span style={styles.notificationReadBadge}>Placeholder</span>
                  </div>
                ))}
            </div>

            {notifications.length > NOTIFICATIONS_PER_PAGE && (
              <div style={styles.pagination}>
                <button
                  type="button"
                  style={{
                    ...styles.paginationBtn,
                    ...(hoveredNotificationsPagerControl === "prev" &&
                    notificationsPage > 1
                      ? styles.paginationBtnHover
                      : {}),
                    ...(notificationsPage <= 1 ? styles.paginationBtnDisabled : {}),
                  }}
                  onClick={() => goToNotificationsPage(notificationsPage - 1)}
                  onMouseEnter={() => setHoveredNotificationsPagerControl("prev")}
                  onMouseLeave={() => setHoveredNotificationsPagerControl("")}
                  disabled={notificationsPage <= 1}
                >
                  Pagina anterioară
                </button>

                <div
                  ref={notificationsPageJumpRef}
                  style={{
                    ...styles.paginationPages,
                    ...(notificationsPageJumpOpen
                      ? styles.paginationPagesWithJump
                      : {}),
                  }}
                >
                  {getNotificationsPageItems().map((item, index) =>
                    typeof item === "number" ? (
                      <button
                        key={item}
                        type="button"
                        style={{
                          ...styles.paginationNumber,
                          ...(item === notificationsPage
                            ? styles.paginationNumberActive
                            : {}),
                        }}
                        onClick={() => goToNotificationsPage(item)}
                        aria-current={item === notificationsPage ? "page" : undefined}
                      >
                        {item}
                      </button>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        style={styles.paginationNumber}
                        onClick={() => {
                          setNotificationsPageJumpOpen(true);
                          setNotificationsPageJumpValue("");
                          setNotificationsPageJumpIndex(index);
                        }}
                      >
                        ...
                      </button>
                    )
                  )}
                  {notificationsPageJumpOpen && (
                    <div
                      style={{
                        ...styles.paginationJumpInline,
                        left: notificationsPageJumpIndex * 44 + 19,
                      }}
                    >
                      <input
                        value={notificationsPageJumpValue}
                        onChange={(event) =>
                          setNotificationsPageJumpValue(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            submitNotificationsPageJump();
                          }
                          if (event.key === "Escape") {
                            setNotificationsPageJumpOpen(false);
                            setNotificationsPageJumpValue("");
                          }
                        }}
                        style={styles.paginationJumpInput}
                        inputMode="numeric"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  style={{
                    ...styles.paginationBtn,
                    ...(hoveredNotificationsPagerControl === "next" &&
                    notificationsPage < totalNotificationsPages
                      ? styles.paginationBtnHover
                      : {}),
                    ...(notificationsPage >= totalNotificationsPages
                      ? styles.paginationBtnDisabled
                      : {}),
                  }}
                  onClick={() => goToNotificationsPage(notificationsPage + 1)}
                  onMouseEnter={() => setHoveredNotificationsPagerControl("next")}
                  onMouseLeave={() => setHoveredNotificationsPagerControl("")}
                  disabled={notificationsPage >= totalNotificationsPages}
                >
                  Pagina următoare
                </button>
              </div>
            )}
          </section>
        )}

        {activeSection === SECTIONS.STATS && (
          <section style={styles.panel}>
            <div style={styles.statsGrid}>
              <div style={styles.statBox}>
                <div style={styles.statValue}>{selectedYearStats.totalOrders}</div>
                <div style={styles.statLabel}>Comenzi plasate</div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statValue}>{selectedYearStats.totalItems}</div>
                <div style={styles.statLabel}>Produse cumpărate</div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statValue}>
                  {selectedYearStats.totalProductsValue.toFixed(2)} lei
                </div>
                <div style={styles.statLabel}>Valoare produse</div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statValue}>
                  {selectedYearStats.totalDiscounts.toFixed(2)} lei
                </div>
                <div style={styles.statLabel}>Economii din vouchere</div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statValue}>{selectedYearStats.vouchersUsed}</div>
                <div style={styles.statLabel}>Vouchere folosite</div>
              </div>
            </div>

            <div style={styles.chartCard}>
              <div style={styles.chartHeader}>
                <div>
                  <h3 style={styles.chartTitle}>
                    Total cheltuit in {safeStatsChartYear}
                  </h3>
                </div>
              </div>

              {stats.years.length === 0 ? (
                <p style={styles.muted}>Nu exista comenzi pentru grafic.</p>
              ) : (
                <>
                <div
                  key={safeStatsChartYear}
                  className="account-stats-chart-bars"
                  style={styles.chartBars}
                >
                  {visibleYearSpend.map((month) => {
                    const height =
                      month.total > 0
                        ? Math.max(
                            8,
                            Math.round((month.total / maxYearSpend) * 100)
                          )
                        : 0;

                    return (
                      <div key={month.key} style={styles.chartColumn}>
                        <div style={styles.chartValue}>
                          {month.total > 0 ? `${month.total.toFixed(2)} lei` : "0"}
                        </div>
                        <div
                          style={{
                            ...styles.chartTrack,
                            ...(month.total <= 0 ? styles.chartTrackEmpty : {}),
                          }}
                        >
                          <div
                            style={{
                              ...styles.chartBar,
                              height: `${height}%`,
                              ...(month.total <= 0 ? styles.chartBarEmpty : {}),
                            }}
                          />
                        </div>
                        <div style={styles.chartMonth}>{month.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={styles.chartNav}>
                  <button
                    type="button"
                    style={{
                      ...styles.chartNavBtn,
                      ...(currentYearIndex <= 0 ? styles.chartNavBtnDisabled : {}),
                    }}
                    onClick={() =>
                      setStatsChartYear(stats.years[Math.max(0, currentYearIndex - 1)])
                    }
                    disabled={currentYearIndex <= 0}
                    aria-label="Anul anterior"
                  >
                    {"<"}
                  </button>
                  <span style={styles.chartPageLabel}>
                    {safeStatsChartYear}
                  </span>
                  <button
                    type="button"
                    style={{
                      ...styles.chartNavBtn,
                      ...(currentYearIndex >= stats.years.length - 1
                        ? styles.chartNavBtnDisabled
                        : {}),
                    }}
                    onClick={() =>
                      setStatsChartYear(
                        stats.years[Math.min(stats.years.length - 1, currentYearIndex + 1)]
                      )
                    }
                    disabled={currentYearIndex >= stats.years.length - 1}
                    aria-label="Anul urmator"
                  >
                    {">"}
                  </button>
                </div>
                </>
              )}
            </div>

          </section>
        )}
      </div>

      {passwordResult && (
        <div className="account-password-modal-overlay" role="dialog" aria-modal="true">
          <div
            className={`account-password-modal ${
              passwordResult.type === "success" ? "success" : "error"
            }`}
          >
            <div className="account-password-modal-icon">
              {passwordResult.type === "success" ? "✓" : "!"}
            </div>
            <h2>{passwordResult.title}</h2>
            <p>{passwordResult.message}</p>
            <button type="button" onClick={() => setPasswordResult(null)}>
              Am înțeles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: 24,
  },
  header: {
    marginBottom: 20,
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
    marginBottom: 24,
  },
  menuCard: {
    minHeight: 132,
    borderRadius: 14,
    border: "1px solid rgba(96,165,250,0.16)",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    background:
      "linear-gradient(90deg, transparent, #3b82f6, #a855f7, transparent) top / 100% 2px no-repeat, linear-gradient(135deg, rgba(59,130,246,0.05), rgba(124,58,237,0.05)), #1e1e1e",
    color: "white",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    boxShadow:
      "0 4px 14px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,58,237,0.04) inset",
    transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
    padding: 14,
    boxSizing: "border-box",
  },
  menuCardHover: {
    transform: "scale(1.04)",
    borderColor: "rgba(96,165,250,0.34)",
    boxShadow:
      "0 10px 28px rgba(0,0,0,0.6), 0 0 20px rgba(80,160,255,0.25)",
  },
  menuCardActive: {
    transform: "scale(1.04)",
    borderColor: "rgba(96,165,250,0.48)",
    background:
      "linear-gradient(90deg, transparent, #3b82f6, #a855f7, transparent) top / 100% 2px no-repeat, linear-gradient(135deg, rgba(59,130,246,0.16), rgba(124,58,237,0.18)), #1e1e1e",
    boxShadow:
      "0 12px 30px rgba(0,0,0,0.65), 0 0 22px rgba(120,190,255,0.45), 0 0 42px rgba(120,190,255,0.28)",
  },
  menuCardTitle: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
    lineHeight: 1.2,
  },
  menuEmoji: {
    fontSize: 38,
    lineHeight: 1,
  },
  menuEmojiWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  menuBadge: {
    position: "absolute",
    top: -8,
    right: -16,
    minWidth: 22,
    height: 22,
    padding: "0 6px",
    borderRadius: 999,
    background: "#ef4444",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  contentWrap: {
    display: "grid",
  },
  panel: {
    background:
      "linear-gradient(90deg, transparent, #3b82f6, #a855f7, transparent) top / 100% 2px no-repeat, #1e1e1e",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(96,165,250,0.18)",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.35), 0 0 18px rgba(59,130,246,0.08)",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 24,
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 900,
    letterSpacing: 0,
  },
  form: {
    display: "grid",
    gap: 18,
  },
  row2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  row3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 14,
  },
  label: {
    display: "block",
    marginBottom: 8,
    color: "rgba(226,232,240,0.82)",
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.25,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 48,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    outline: "none",
    fontSize: 15,
  },
  inputDisabled: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 48,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.02)",
    color: "rgba(255,255,255,0.65)",
    outline: "none",
    cursor: "not-allowed",
    fontSize: 15,
  },
  primaryBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
    width: "fit-content",
    boxShadow:
      "0 0 18px rgba(59,130,246,0.24), 0 0 26px rgba(168,85,247,0.16)",
  },
  ok: {
    color: "#4ade80",
    margin: 0,
  },
  err: {
    color: "salmon",
  },
  muted: {
    opacity: 0.72,
  },
  ordersWrap: {
    display: "grid",
    gap: 12,
  },
  orderCardClickable: {
    borderRadius: 12,
    padding: 14,
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(124,58,237,0.06)), rgba(255,255,255,0.03)",
    border: "1px solid rgba(96,165,250,0.24)",
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.05) inset",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  orderCardHover: {
    transform: "scale(1.02)",
    boxShadow:
      "0 10px 28px rgba(0,0,0,0.6), 0 0 20px rgba(120,190,255,0.28)",
  },
  orderCardPlaceholder: {
    visibility: "hidden",
    pointerEvents: "none",
  },
  orderTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  orderTopRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  orderStatusBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
  },
  orderDate: {
    marginBottom: 10,
    opacity: 0.78,
    fontSize: 14,
  },
  orderTotal: {
    color: "#4ade80",
    fontWeight: 800,
  },
  orderItems: {
    display: "grid",
    gap: 8,
  },
  orderItemRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 16,
    minHeight: 86,
  },
  paginationPages: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
    paddingBottom: 48,
  },
  paginationPagesWithJump: {
  },
  paginationBtn: {
    minHeight: 38,
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.22)",
    outline: "none",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.55))",
    color: "#f8fafc",
    cursor: "pointer",
    fontWeight: 800,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(59,130,246,0.08)",
    transition:
      "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
  },
  paginationBtnHover: {
    transform: "translateY(-1px)",
    borderColor: "rgba(96,165,250,0.48)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(124,58,237,0.14))",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px rgba(59,130,246,0.18), 0 0 22px rgba(168,85,247,0.1)",
  },
  paginationBtnDisabled: {
    cursor: "not-allowed",
    opacity: 0.48,
  },
  paginationNumber: {
    width: 38,
    height: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.22)",
    outline: "none",
    background: "rgba(255,255,255,0.04)",
    color: "#f8fafc",
    cursor: "pointer",
    fontWeight: 900,
  },
  paginationNumberActive: {
    borderColor: "rgba(96,165,250,0.6)",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92), rgba(124,58,237,0.86))",
    boxShadow:
      "0 0 14px rgba(59,130,246,0.24), 0 0 22px rgba(168,85,247,0.16)",
  },
  paginationJumpInline: {
    position: "absolute",
    top: 46,
    width: 110,
    display: "flex",
    justifyContent: "center",
    transform: "translateX(-50%)",
  },
  paginationJumpInput: {
    width: 110,
    minHeight: 38,
    boxSizing: "border-box",
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.28)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    outline: "none",
    textAlign: "center",
    fontWeight: 800,
  },
  notificationsWrap: {
    display: "grid",
    gap: 12,
  },
  notificationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 12,
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(124,58,237,0.06)), rgba(255,255,255,0.03)",
    border: "1px solid rgba(96,165,250,0.24)",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.05) inset",
  },
  invisiblePlaceholder: {
    visibility: "hidden",
    pointerEvents: "none",
  },
  notificationMessage: {
    fontWeight: 700,
    lineHeight: 1.45,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  notificationDate: {
    marginTop: 6,
    opacity: 0.68,
    fontSize: 13,
  },
  notificationReadBadge: {
    flex: "0 0 auto",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: 12,
    fontWeight: 800,
  },
  notificationUnreadBadge: {
    flex: "0 0 auto",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(239,68,68,0.18)",
    color: "#fca5a5",
    border: "1px solid rgba(239,68,68,0.32)",
    fontSize: 12,
    fontWeight: 800,
  },
  fishbotHistoryLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 0.42fr) minmax(0, 1fr)",
    gap: 16,
    minHeight: 460,
  },
  fishbotHistoryList: {
    display: "grid",
    alignContent: "start",
    gap: 10,
    paddingRight: 4,
  },
  fishbotHistoryColumnTitle: {
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 6,
    color: "#f8fafc",
  },
  fishbotHistoryItem: {
    width: "100%",
    textAlign: "left",
    display: "grid",
    gap: 7,
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(96,165,250,0.2)",
    background: "rgba(255,255,255,0.035)",
    color: "white",
    cursor: "pointer",
    outline: "none",
  },
  fishbotHistoryItemActive: {
    borderColor: "rgba(96,165,250,0.52)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(124,58,237,0.12)), rgba(255,255,255,0.04)",
    boxShadow: "0 0 18px rgba(59,130,246,0.14)",
  },
  fishbotHistoryItemTitle: {
    fontWeight: 900,
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  fishbotHistoryItemMeta: {
    color: "rgba(226,232,240,0.62)",
    fontSize: 12,
    fontWeight: 700,
  },
  fishbotHistoryThread: {
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    borderRadius: 14,
    border: "1px solid rgba(96,165,250,0.18)",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.62), rgba(30,41,59,0.34))",
    overflow: "hidden",
  },
  fishbotHistoryThreadHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  fishbotHistoryThreadTitle: {
    fontWeight: 900,
    fontSize: 18,
  },
  fishbotHistoryThreadMeta: {
    marginTop: 4,
    color: "rgba(226,232,240,0.62)",
    fontSize: 13,
    fontWeight: 700,
  },
  fishbotHistoryCount: {
    flex: "0 0 auto",
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(96,165,250,0.22)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(226,232,240,0.78)",
    fontSize: 12,
    fontWeight: 900,
  },
  fishbotHistoryMessages: {
    display: "grid",
    alignContent: "start",
    gap: 14,
    padding: 16,
    maxHeight: 560,
    overflowY: "auto",
  },
  fishbotHistoryMessageRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 14,
  },
  fishbotHistoryMessageRowUser: {
    justifyContent: "flex-end",
  },
  fishbotHistoryMessageRowBot: {
    justifyContent: "flex-start",
  },
  fishbotHistoryBubble: {
    maxWidth: "76%",
    minWidth: 120,
    padding: "11px 13px 24px",
    borderRadius: 16,
    position: "relative",
    border: "1px solid rgba(96,165,250,0.18)",
  },
  fishbotHistoryBubbleUser: {
    background: "rgba(43,58,137,0.96)",
    borderTopRightRadius: 6,
  },
  fishbotHistoryBubbleBot: {
    background: "rgba(32,62,58,0.96)",
    borderTopLeftRadius: 6,
  },
  fishbotHistoryTail: {
    position: "absolute",
    bottom: 12,
    width: 0,
    height: 0,
    borderTop: "5px solid transparent",
    borderBottom: "5px solid transparent",
  },
  fishbotHistoryTailUser: {
    right: -8,
    borderLeft: "9px solid rgba(43,58,137,0.96)",
  },
  fishbotHistoryTailBot: {
    left: -8,
    borderRight: "9px solid rgba(32,62,58,0.96)",
  },
  fishbotHistorySender: {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.78,
    marginBottom: 6,
  },
  fishbotHistoryText: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    lineHeight: 1.45,
  },
  fishbotHistoryTime: {
    position: "absolute",
    right: 11,
    bottom: 7,
    color: "rgba(226,232,240,0.62)",
    fontSize: 11,
    fontWeight: 800,
  },
  fishbotHistoryAvatar: {
    width: 34,
    height: 34,
    flex: "0 0 34px",
    borderRadius: "50%",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(96,165,250,0.34)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(124,58,237,0.18))",
    boxShadow: "0 0 10px rgba(59,130,246,0.14)",
  },
  fishbotHistoryAvatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  fishbotHistoryAvatarFallback: {
    color: "#dbeafe",
    fontWeight: 900,
    fontSize: 13,
  },
  fishbotHistoryEmpty: {
    minHeight: 300,
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: 10,
    textAlign: "center",
  },
  fishbotHistoryEmptyIcon: {
    fontSize: 44,
  },
  fishbotHistoryEmptyTitle: {
    margin: 0,
    fontSize: 22,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  passwordForm: {
    display: "grid",
    maxWidth: 760,
    gap: 16,
  },
  passwordHint: {
    maxWidth: 680,
    margin: "0 0 20px",
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.5,
  },
  statBox: {
    borderRadius: 14,
    padding: 18,
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(124,58,237,0.06)), rgba(255,255,255,0.03)",
    border: "1px solid rgba(96,165,250,0.24)",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.05) inset",
  },
  statValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#4ade80",
  },
  statLabel: {
    marginTop: 6,
    opacity: 0.78,
  },
  chartCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 16,
    border: "1px solid rgba(96,165,250,0.24)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(124,58,237,0.06)), rgba(255,255,255,0.03)",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.05) inset",
  },
  chartHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  chartTitle: {
    margin: 0,
    fontSize: 20,
  },
  chartBars: {
    minHeight: 250,
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(42px, 1fr))",
    alignItems: "end",
    gap: 10,
    paddingTop: 10,
  },
  chartColumn: {
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "34px 170px auto",
    gap: 8,
    alignItems: "end",
  },
  chartValue: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    alignSelf: "end",
    overflowWrap: "anywhere",
  },
  chartTrack: {
    height: 170,
    display: "flex",
    alignItems: "end",
    borderRadius: 12,
    background: "rgba(15,23,42,0.38)",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  chartTrackEmpty: {
    background: "rgba(255,255,255,0.025)",
    borderColor: "rgba(255,255,255,0.04)",
  },
  chartBar: {
    width: "100%",
    minHeight: 8,
    borderRadius: "12px 12px 0 0",
    background: "linear-gradient(180deg, #60a5fa, #2563eb)",
    boxShadow: "0 0 18px rgba(96,165,250,0.18)",
  },
  chartBarEmpty: {
    minHeight: 0,
    background: "transparent",
    boxShadow: "none",
  },
  chartMonth: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    textTransform: "capitalize",
  },
  chartNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 16,
  },
  chartNavBtn: {
    width: 42,
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    border: "1px solid rgba(96,165,250,0.28)",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(124,58,237,0.12)), rgba(255,255,255,0.04)",
    color: "white",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
    transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
  },
  chartNavBtnDisabled: {
    opacity: 0.42,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  chartPageLabel: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: 800,
    minWidth: 150,
    textAlign: "center",
    textTransform: "capitalize",
  },
};
