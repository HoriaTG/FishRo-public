from datetime import datetime, timedelta

from sqlalchemy import Boolean, Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from db import Base


class ProductDB(Base):
    __tablename__ = "products"

    code = Column(String, unique=True, index=True, nullable=False)
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    promotion = Column(Integer, nullable=False, default=0)
    description = Column(String, nullable=True)
    tech_details = Column(String, nullable=True)
    video_url = Column(String, nullable=True)

    reviews = relationship(
        "ReviewDB",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ReviewDB.updated_at.desc()",
    )


class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    approval_status = Column(String, nullable=False, default="approved", index=True)
    approval_updated_at = Column(DateTime, nullable=True)
    staff_notifications_start_at = Column(DateTime, nullable=True)
    current_session_id = Column(String, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    presence_seen_at = Column(DateTime, nullable=True)
    ban_until = Column(DateTime, nullable=True)
    ban_permanent = Column(Boolean, nullable=False, default=False)
    ban_reason = Column(String, nullable=True)
    current_ban_key = Column(String, nullable=True)
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    county = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    profile_image_url = Column(String, nullable=True)

    reviews = relationship("ReviewDB", back_populates="user")
    login_logs = relationship("LoginLogDB", back_populates="user")

    @property
    def is_online(self) -> bool:
        return self.presence_status == "online"

    @property
    def presence_status(self) -> str:
        if not self.current_session_id or not self.last_seen_at:
            return "offline"

        now = datetime.utcnow()
        if self.last_seen_at >= now - timedelta(seconds=45):
            return "online"
        if self.presence_seen_at and self.presence_seen_at >= now - timedelta(seconds=90):
            return "idle"
        return "offline"


class OrderDB(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    total = Column(Float, nullable=False, default=0)
    subtotal = Column(Float, nullable=False, default=0)
    discount_amount = Column(Float, nullable=False, default=0)
    shipping_amount = Column(Float, nullable=False, default=0)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=True, index=True)
    voucher_code = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="trimisa")

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, nullable=False)
    payment_method = Column(String, nullable=False)

    user = relationship("UserDB")
    voucher = relationship("VoucherDB", foreign_keys=[voucher_id])
    items = relationship("OrderItemDB", back_populates="order")


class OrderItemDB(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)

    product_name = Column(String, nullable=False)
    product_code = Column(String, nullable=False)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    line_total = Column(Float, nullable=False)

    order = relationship("OrderDB", back_populates="items")


class CartItemDB(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1)

    user = relationship("UserDB")
    product = relationship("ProductDB")


class FavoriteItemDB(Base):
    __tablename__ = "favorite_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)

    user = relationship("UserDB")
    product = relationship("ProductDB")


class WishlistItemDB(Base):
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=True)

    user = relationship("UserDB")
    product = relationship("ProductDB")


class ReviewDB(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    comment = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    product = relationship("ProductDB", back_populates="reviews")
    user = relationship("UserDB", back_populates="reviews")


class TicketDB(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String, nullable=False)
    ban_key = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="open")
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    last_message_at = Column(DateTime, nullable=True)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    staff_last_read_message_id = Column(Integer, nullable=True)

    user = relationship("UserDB", foreign_keys=[user_id])
    assigned_to_user = relationship("UserDB", foreign_keys=[assigned_to_user_id])

    messages = relationship(
        "TicketMessageDB",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketMessageDB.created_at",
    )
    read_states = relationship(
        "TicketReadStateDB",
        back_populates="ticket",
        cascade="all, delete-orphan",
    )


class TicketMessageDB(Base):
    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=True)

    ticket = relationship("TicketDB", back_populates="messages")
    sender = relationship("UserDB")


class TicketReadStateDB(Base):
    __tablename__ = "ticket_read_states"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    last_read_message_id = Column(Integer, nullable=True)

    ticket = relationship("TicketDB", back_populates="read_states")
    user = relationship("UserDB")


class NotificationDB(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    notification_type = Column(String, nullable=False, default="general", index=True)
    message = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime, nullable=True)

    user = relationship("UserDB")
    ticket = relationship("TicketDB")
    order = relationship("OrderDB")


class FishbotConversationDB(Base):
    __tablename__ = "fishbot_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    client_key = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=True, index=True)
    ended_at = Column(DateTime, nullable=True, index=True)

    user = relationship("UserDB")
    messages = relationship(
        "FishbotMessageDB",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="FishbotMessageDB.created_at",
    )


class FishbotMessageDB(Base):
    __tablename__ = "fishbot_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("fishbot_conversations.id"),
        nullable=False,
        index=True,
    )
    sender = Column(String, nullable=False)
    message = Column(String, nullable=False)
    products_json = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=True, index=True)

    conversation = relationship("FishbotConversationDB", back_populates="messages")


class LoginLogDB(Base):
    __tablename__ = "login_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ip_address = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=True, index=True)

    user = relationship("UserDB", back_populates="login_logs")


class VoucherDB(Base):
    __tablename__ = "vouchers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    amount = Column(Float, nullable=False)
    discount_type = Column(String, nullable=False, default="fixed")
    usage_type = Column(String, nullable=False, default="single_use")
    created_at = Column(DateTime, nullable=True, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    cancelled_at = Column(DateTime, nullable=True, index=True)

    usages = relationship("VoucherUsageDB", back_populates="voucher")

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_at and self.expires_at <= datetime.utcnow())

    @property
    def usage_count(self) -> int:
        return len(self.usages or [])

    @property
    def is_used(self) -> bool:
        return self.usage_type == "single_use" and self.usage_count > 0

    @property
    def is_valid(self) -> bool:
        return not self.cancelled_at and not self.is_expired and not self.is_used

    @property
    def status(self) -> str:
        if self.cancelled_at:
            return "anulat"
        if self.is_expired:
            return "expirat"
        if self.is_used:
            return "folosit"
        return "nefolosit"


class VoucherUsageDB(Base):
    __tablename__ = "voucher_usages"

    id = Column(Integer, primary_key=True, index=True)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    used_at = Column(DateTime, nullable=True, index=True)

    voucher = relationship("VoucherDB", back_populates="usages")
    user = relationship("UserDB")
