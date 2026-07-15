import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { askFishBot, getToken, saveFishbotConversation } from "../api";
import "./ChatWidget.css";

const FISHBOT_ACTIVE_CONVERSATION_KEY = "fishro.fishbot.activeConversation";
const FISHBOT_HISTORY_EVENT = "fishro-fishbot-history-updated";

function formatConversationDate() {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function formatMessageTime(value) {
  return new Intl.DateTimeFormat("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value || Date.now()));
}

const QUICK_ACTIONS = [
  "Arată-mi promoțiile",
  "Ce recomanzi pentru începători?",
  "Ce recomanzi pentru pescuit la crap?",
  "Produse sub 200 lei",
  "Cum mă autentific?",
  "Cum comand?",
  "Cum deschid un tichet?",
  "Am tichete deschise?",
  "Ce am în coș?",
  "Care este ultima mea comandă?",
];

const FISHBOT_PROFILE_IMAGE = "/images/profiles/fishbot-profile.png";

function hasUserMessage(messages) {
  return messages.some((message) => message.sender === "user");
}

function toIsoDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function createFishbotClientKey() {
  return `fishbot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function archiveFishbotConversation(messages, clientKey) {
  if (!Array.isArray(messages) || !hasUserMessage(messages)) return;
  if (!getToken()) return;

  const firstUserMessage = messages.find((message) => message.sender === "user");
  const lastMessage = messages[messages.length - 1];
  await saveFishbotConversation({
    clientKey,
    title: firstUserMessage?.text?.slice(0, 80) || "Conversatie FishBot",
    createdAt: toIsoDate(messages[0]?.createdAt),
    endedAt: toIsoDate(lastMessage?.createdAt),
    messages: messages.map((message) => ({
      sender: message.sender,
      text: message.text || "",
      created_at: toIsoDate(message.createdAt),
      products: message.products || [],
    })),
  });
  localStorage.removeItem(FISHBOT_ACTIVE_CONVERSATION_KEY);
  window.dispatchEvent(new Event(FISHBOT_HISTORY_EVENT));
}

function normalizeActionText(text) {
  return text.toLowerCase().trim();
}

function isLoginAction(text) {
  const normalized = normalizeActionText(text);
  return (
    normalized === "autentifică-te" ||
    normalized === "autentifica-te" ||
    normalized === "mergi la autentificare" ||
    normalized === "autentificare" ||
    normalized === "cum ma autentific?" ||
    normalized === "cum mă autentific?" ||
    normalized === "login"
  );
}

export default function ChatWidget({ me }) {
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const widgetRef = useRef(null);
  const conversationClientKeyRef = useRef(createFishbotClientKey());
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      text:
        "Salut, sunt FishBot. Poți alege una dintre întrebările rapide sau îmi poți scrie direct ce cauți.",
      products: [],
      requiresLogin: false,
      createdAt: Date.now(),
    },
  ]);

  const conversationDate = useMemo(() => formatConversationDate(), []);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(FISHBOT_ACTIVE_CONVERSATION_KEY) || "null"
      );
      if (saved?.clientKey) {
        conversationClientKeyRef.current = saved.clientKey;
      }
      if (saved?.messages && saved.ownerId && !me?.id) {
        return;
      }

      if (
        saved?.messages &&
        (!saved.ownerId || Number(saved.ownerId) === Number(me.id))
      ) {
        archiveFishbotConversation(
          saved.messages,
          saved.clientKey || conversationClientKeyRef.current
        ).catch(() => {});
      } else if (saved?.messages && saved.ownerId && me?.id) {
        localStorage.removeItem(FISHBOT_ACTIVE_CONVERSATION_KEY);
      }
    } catch {
      localStorage.removeItem(FISHBOT_ACTIVE_CONVERSATION_KEY);
    }
  }, [me?.id]);

  useEffect(() => {
    if (!hasUserMessage(messages)) {
      localStorage.removeItem(FISHBOT_ACTIVE_CONVERSATION_KEY);
      return;
    }

    localStorage.setItem(
      FISHBOT_ACTIVE_CONVERSATION_KEY,
      JSON.stringify({
        ownerId: me?.id || null,
        clientKey: conversationClientKeyRef.current,
        messages,
        updatedAt: Date.now(),
      })
    );

    archiveFishbotConversation(messages, conversationClientKeyRef.current).catch(() => {});
  }, [messages, me?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      const target = event.target;

      if (!widgetRef.current?.contains(target)) {
        setIsQuickActionsOpen(false);
        setIsOpen(false);
        return;
      }

      if (
        isQuickActionsOpen &&
        target instanceof Element &&
        !target.closest(".fishbot-quick-zone")
      ) {
        setIsQuickActionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, isQuickActionsOpen]);

  async function sendMessage(rawText) {
    const text = rawText.trim();
    if (!text || isTyping) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      products: [],
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    try {
      const response = await askFishBot(text);

      const botMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: response.reply,
        products: response.products || [],
        requiresLogin: response.requires_login || false,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-error-${Date.now()}`,
          sender: "bot",
          text:
            error.message ||
            "A apărut o problemă temporară. Încearcă din nou puțin mai târziu.",
          products: [],
          requiresLogin: false,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleQuickAction(text) {
    if (isLoginAction(text)) {
      navigate("/login");
      setIsOpen(false);
      return;
    }

    setIsQuickActionsOpen(false);
    sendMessage(text);
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(inputText);
  }

  function handleProductClick(productId) {
    navigate(`/products/${productId}`);
    setIsOpen(false);
  }

  function handleLoginClick() {
    navigate("/login");
    setIsOpen(false);
  }

  function renderMessageAvatar(message) {
    const isUser = message.sender === "user";
    const imageUrl = isUser ? me?.profile_image_url : FISHBOT_PROFILE_IMAGE;
    const fallbackText = isUser
      ? (me?.username || me?.full_name || "U").trim().slice(0, 1).toUpperCase()
      : "F";

    return (
      <div className={`fishbot-avatar ${isUser ? "user-avatar" : "bot-avatar"}`}>
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <span>{fallbackText || "U"}</span>
        )}
      </div>
    );
  }

  return (
    <>
      {!isOpen && (
        <button
          className="fishbot-launcher"
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Deschide FishBot"
        >
          <span className="fishbot-launcher-icon">💬</span>
          <span className="fishbot-launcher-text">FishBot</span>
        </button>
      )}

      {isOpen && (
        <div
          ref={widgetRef}
          className="fishbot-widget"
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="fishbot-header">
            <div>
              <div className="fishbot-title">FishBot</div>
              <div className="fishbot-subtitle">Asistentul tău FishRo</div>
            </div>

            <button
              type="button"
              className="fishbot-close"
              onClick={() => setIsOpen(false)}
              aria-label="Închide chatul"
            >
              ✕
            </button>
          </div>

          <div className="fishbot-body">
            <div className="fishbot-date-divider">
              <span>{conversationDate}</span>
            </div>

            {messages.map((message) => (
              <div
                key={message.id}
                className={`fishbot-message-row ${
                  message.sender === "user" ? "from-user" : "from-bot"
                }`}
              >
                {message.sender === "bot" && renderMessageAvatar(message)}
                <div
                  className={`fishbot-message-bubble ${
                    message.sender === "user" ? "user-bubble" : "bot-bubble"
                  }`}
                >
                  <div className="fishbot-message-text">{message.text}</div>

                  {message.requiresLogin && !getToken() && (
                    <button
                      type="button"
                      className="fishbot-login-btn"
                      onClick={handleLoginClick}
                    >
                      Mergi la autentificare
                    </button>
                  )}

                  {message.products?.length > 0 && (
                    <div className="fishbot-products">
                      {message.products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="fishbot-product-card"
                          onClick={() => handleProductClick(product.id)}
                        >
                          <div className="fishbot-product-name">{product.name}</div>
                          <div className="fishbot-product-meta">{product.category}</div>

                          {product.promotion > 0 ? (
                            <div className="fishbot-product-price-wrap">
                              <span className="fishbot-product-old-price">
                                {Number(product.price).toFixed(2)} lei
                              </span>
                              <span className="fishbot-product-price">
                                {Number(product.discounted_price).toFixed(2)} lei
                              </span>
                              <span className="fishbot-product-badge">
                                -{product.promotion}%
                              </span>
                            </div>
                          ) : (
                            <div className="fishbot-product-price">
                              {Number(product.discounted_price).toFixed(2)} lei
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="fishbot-message-time">
                    {formatMessageTime(message.createdAt)}
                  </div>
                </div>
                {message.sender === "user" && renderMessageAvatar(message)}
              </div>
            ))}

            {isTyping && (
              <div className="fishbot-message-row from-bot">
                <div className="fishbot-avatar bot-avatar">
                  <img src={FISHBOT_PROFILE_IMAGE} alt="" />
                </div>
                <div className="fishbot-message-bubble bot-bubble fishbot-typing">
                  FishBot scrie...
                </div>
              </div>
            )}
          </div>

          <div className="fishbot-footer">
            <div className="fishbot-quick-row fishbot-quick-zone">
              <button
                type="button"
                className={`fishbot-quick-toggle ${
                  isQuickActionsOpen ? "is-open" : ""
                }`}
                onClick={() => setIsQuickActionsOpen((prev) => !prev)}
                aria-label="Întrebări rapide"
                aria-expanded={isQuickActionsOpen}
              >
                ?
              </button>
            </div>

            {isQuickActionsOpen && (
              <div className="fishbot-footer-actions fishbot-quick-zone">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="fishbot-footer-chip"
                    onClick={() => handleQuickAction(action)}
                    disabled={isTyping}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}

            <form className="fishbot-input-form" onSubmit={handleSubmit}>
              <input
                type="text"
                className="fishbot-input"
                placeholder="Scrie o întrebare..."
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                disabled={isTyping}
              />

              <button
                type="submit"
                className="fishbot-send-btn"
                disabled={isTyping || !inputText.trim()}
              >
                Trimite
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
