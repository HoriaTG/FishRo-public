from datetime import datetime, time, timedelta
import os
from pathlib import Path
from uuid import uuid4
import json
import secrets
import string

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth import create_access_token, decode_access_token, hash_password, verify_password
from db import Base, engine
from app_constants import ORDER_STATUSES, PROMOTION_VALUES, TICKET_CREATE_COOLDOWN_HOURS
from chatbot_service import get_discounted_price, handle_assistant_chat
from dependencies import (
    get_current_user,
    get_db,
    get_optional_current_user,
    SESSION_COOKIE_MAX_AGE_SECONDS,
    SESSION_COOKIE_SAMESITE,
    SESSION_COOKIE_SECURE,
    require_admin,
    require_moderator_or_admin,
)
from models import (
    CartItemDB,
    FavoriteItemDB,
    FishbotConversationDB,
    FishbotMessageDB,
    LoginLogDB,
    NotificationDB,
    OrderDB,
    OrderItemDB,
    ProductDB,
    ReviewDB,
    TicketDB,
    TicketMessageDB,
    TicketReadStateDB,
    UserDB,
    VoucherDB,
    VoucherUsageDB,
    WishlistItemDB,
)
from schemas import (
    AssignableStaffRead,
    AssistantChatRequest,
    AssistantChatResponse,
    BannedSupportStatusRead,
    BannedTicketCreate,
    CartItemAdd,
    CartItemRead,
    CartItemUpdate,
    CartRead,
    DashboardUnreadCountRead,
    FishbotConversationArchiveCreate,
    FishbotConversationRead,
    FishbotMessageRead,
    LoginLogRead,
    ManualNotificationCreate,
    NotificationCountRead,
    NotificationMarkReadPayload,
    NotificationRead,
    OrderCreate,
    OrderRead,
    OrderStatusUpdate,
    PresenceUpdate,
    PasswordChange,
    ProductCreate,
    ProductRead,
    ProductReviewsRead,
    ProductUpdate,
    ReviewCreate,
    ReviewRead,
    TicketAssignPayload,
    TicketCreate,
    TicketCreateAvailabilityRead,
    TicketDetailRead,
    TicketListRead,
    TicketMessageCreate,
    TicketMessageRead,
    TicketUnreadCountRead,
    Token,
    UserBanUpdate,
    UserApprovalUpdate,
    UserCreate,
    UserLogin,
    UserRead,
    UserRoleUpdate,
    UserUpdate,
    VoucherApplyRequest,
    VoucherApplyResponse,
    VoucherCreate,
    VoucherRead,
)

app = FastAPI(title="Fishing App - SQLite")

SHIPPING_AMOUNT = 10.0
MIN_PRODUCT_TOTAL_AFTER_DISCOUNT = 1.0
MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024
MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
PRODUCT_IMAGES_DIR = (
    Path(__file__).resolve().parent.parent
    / "FishRo-Frontend"
    / "public"
    / "images"
    / "products"
)
PROFILE_IMAGES_DIR = (
    Path(__file__).resolve().parent.parent
    / "FishRo-Frontend"
    / "public"
    / "images"
    / "profiles"
)
PRODUCT_IMAGE_EXTENSIONS = ("jpg", "png", "webp", "jpeg")

DEFAULT_CORS_ORIGINS = "http://localhost:4173,http://localhost:5173,http://127.0.0.1:4173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def ensure_guest_orders_schema() -> None:
    with engine.begin() as connection:
        rows = connection.exec_driver_sql("PRAGMA table_info(orders)").fetchall()
        user_id_column = next((row for row in rows if row[1] == "user_id"), None)

        if not user_id_column or user_id_column[3] == 0:
            return

        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.exec_driver_sql(
            """
            CREATE TABLE orders_new (
                id INTEGER NOT NULL PRIMARY KEY,
                order_number VARCHAR NOT NULL,
                user_id INTEGER,
                total FLOAT NOT NULL,
                created_at DATETIME,
                status VARCHAR NOT NULL,
                first_name VARCHAR NOT NULL,
                last_name VARCHAR NOT NULL,
                address VARCHAR NOT NULL,
                phone VARCHAR NOT NULL,
                email VARCHAR NOT NULL,
                payment_method VARCHAR NOT NULL,
                UNIQUE (order_number),
                FOREIGN KEY(user_id) REFERENCES users (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            INSERT INTO orders_new (
                id, order_number, user_id, total, created_at, status,
                first_name, last_name, address, phone, email, payment_method
            )
            SELECT
                id, order_number, user_id, total, created_at, status,
                first_name, last_name, address, phone, email, payment_method
            FROM orders
            """
        )
        connection.exec_driver_sql("DROP TABLE orders")
        connection.exec_driver_sql("ALTER TABLE orders_new RENAME TO orders")
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_number ON orders (order_number)"
        )
        connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_orders_id ON orders (id)")
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")


ensure_guest_orders_schema()


def ensure_order_voucher_schema() -> None:
    order_columns = {
        "subtotal": "FLOAT NOT NULL DEFAULT 0",
        "discount_amount": "FLOAT NOT NULL DEFAULT 0",
        "shipping_amount": "FLOAT NOT NULL DEFAULT 0",
        "voucher_id": "INTEGER",
        "voucher_code": "VARCHAR",
    }

    with engine.begin() as connection:
        rows = connection.exec_driver_sql("PRAGMA table_info(orders)").fetchall()
        existing_columns = {row[1] for row in rows}

        for column_name, column_type in order_columns.items():
            if column_name not in existing_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE orders ADD COLUMN {column_name} {column_type}"
                )

        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_orders_voucher_id ON orders (voucher_id)"
        )


ensure_order_voucher_schema()


def ensure_user_profile_schema() -> None:
    profile_columns = {
        "current_session_id": "VARCHAR",
        "last_seen_at": "DATETIME",
        "presence_seen_at": "DATETIME",
        "ban_until": "DATETIME",
        "ban_permanent": "BOOLEAN NOT NULL DEFAULT 0",
        "ban_reason": "VARCHAR",
        "current_ban_key": "VARCHAR",
        "full_name": "VARCHAR",
        "phone": "VARCHAR",
        "address": "VARCHAR",
        "city": "VARCHAR",
        "county": "VARCHAR",
        "postal_code": "VARCHAR",
        "profile_image_url": "VARCHAR",
        "approval_status": "VARCHAR NOT NULL DEFAULT 'approved'",
        "approval_updated_at": "DATETIME",
    }

    with engine.begin() as connection:
        rows = connection.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        existing_columns = {row[1] for row in rows}

        for column_name, column_type in profile_columns.items():
            if column_name not in existing_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE users ADD COLUMN {column_name} {column_type}"
                )


ensure_user_profile_schema()


def ensure_ticket_ban_schema() -> None:
    with engine.begin() as connection:
        rows = connection.exec_driver_sql("PRAGMA table_info(tickets)").fetchall()
        existing_columns = {row[1] for row in rows}

        if "ban_key" not in existing_columns:
            connection.exec_driver_sql("ALTER TABLE tickets ADD COLUMN ban_key VARCHAR")

        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_tickets_ban_key ON tickets (ban_key)"
        )


ensure_ticket_ban_schema()


def ensure_favorites_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS favorite_items (
                id INTEGER NOT NULL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users (id),
                FOREIGN KEY(product_id) REFERENCES products (id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_favorite_items_id ON favorite_items (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_favorite_items_user_id ON favorite_items (user_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_favorite_items_product_id ON favorite_items (product_id)"
        )
        connection.exec_driver_sql(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_favorite_items_user_product
            ON favorite_items (user_id, product_id)
            """
        )


ensure_favorites_schema()


def ensure_wishlist_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS wishlist_items (
                id INTEGER NOT NULL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                created_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users (id),
                FOREIGN KEY(product_id) REFERENCES products (id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_wishlist_items_id ON wishlist_items (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_wishlist_items_user_id ON wishlist_items (user_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_wishlist_items_product_id ON wishlist_items (product_id)"
        )
        connection.exec_driver_sql(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_wishlist_items_user_product
            ON wishlist_items (user_id, product_id)
            """
        )


ensure_wishlist_schema()


def ensure_notifications_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER NOT NULL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                ticket_id INTEGER,
                message VARCHAR NOT NULL,
                created_at DATETIME,
                is_read BOOLEAN NOT NULL DEFAULT 0,
                read_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users (id),
                FOREIGN KEY(ticket_id) REFERENCES tickets (id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_notifications_id ON notifications (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_notifications_ticket_id ON notifications (ticket_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications (is_read)"
        )
        rows = connection.exec_driver_sql("PRAGMA table_info(notifications)").fetchall()
        existing_columns = {row[1] for row in rows}

        if "order_id" not in existing_columns:
            connection.exec_driver_sql("ALTER TABLE notifications ADD COLUMN order_id INTEGER")
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_notifications_order_id ON notifications (order_id)"
            )

        if "notification_type" not in existing_columns:
            connection.exec_driver_sql(
                "ALTER TABLE notifications ADD COLUMN notification_type VARCHAR NOT NULL DEFAULT 'general'"
            )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_notifications_notification_type ON notifications (notification_type)"
            )


ensure_notifications_schema()


def ensure_fishbot_conversations_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS fishbot_conversations (
                id INTEGER NOT NULL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title VARCHAR NOT NULL,
                created_at DATETIME,
                ended_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS fishbot_messages (
                id INTEGER NOT NULL PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                sender VARCHAR NOT NULL,
                message VARCHAR NOT NULL,
                products_json VARCHAR,
                created_at DATETIME,
                FOREIGN KEY(conversation_id) REFERENCES fishbot_conversations (id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_conversations_id ON fishbot_conversations (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_conversations_user_id ON fishbot_conversations (user_id)"
        )
        rows = connection.exec_driver_sql(
            "PRAGMA table_info(fishbot_conversations)"
        ).fetchall()
        existing_columns = {row[1] for row in rows}
        if "client_key" not in existing_columns:
            connection.exec_driver_sql(
                "ALTER TABLE fishbot_conversations ADD COLUMN client_key VARCHAR"
            )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_conversations_client_key ON fishbot_conversations (client_key)"
        )
        connection.exec_driver_sql(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_fishbot_conversations_user_client_key
            ON fishbot_conversations (user_id, client_key)
            WHERE client_key IS NOT NULL
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_conversations_created_at ON fishbot_conversations (created_at)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_conversations_ended_at ON fishbot_conversations (ended_at)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_messages_id ON fishbot_messages (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_messages_conversation_id ON fishbot_messages (conversation_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_fishbot_messages_created_at ON fishbot_messages (created_at)"
        )


ensure_fishbot_conversations_schema()


def ensure_login_logs_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS login_logs (
                id INTEGER NOT NULL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                ip_address VARCHAR NOT NULL,
                created_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users (id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_login_logs_id ON login_logs (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_login_logs_user_id ON login_logs (user_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_login_logs_created_at ON login_logs (created_at)"
        )


ensure_login_logs_schema()


def ensure_vouchers_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS vouchers (
                id INTEGER NOT NULL PRIMARY KEY,
                code VARCHAR NOT NULL,
                amount FLOAT NOT NULL,
                discount_type VARCHAR NOT NULL DEFAULT 'fixed',
                usage_type VARCHAR NOT NULL,
                created_at DATETIME,
                cancelled_at DATETIME,
                expires_at DATETIME,
                UNIQUE (code)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_vouchers_id ON vouchers (id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_vouchers_code ON vouchers (code)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_vouchers_created_at ON vouchers (created_at)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_vouchers_expires_at ON vouchers (expires_at)"
        )
        rows = connection.exec_driver_sql("PRAGMA table_info(vouchers)").fetchall()
        existing_columns = {row[1] for row in rows}

        if "cancelled_at" not in existing_columns:
            connection.exec_driver_sql("ALTER TABLE vouchers ADD COLUMN cancelled_at DATETIME")
        if "discount_type" not in existing_columns:
            connection.exec_driver_sql(
                "ALTER TABLE vouchers ADD COLUMN discount_type VARCHAR NOT NULL DEFAULT 'fixed'"
            )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_vouchers_cancelled_at ON vouchers (cancelled_at)"
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS voucher_usages (
                id INTEGER NOT NULL PRIMARY KEY,
                voucher_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                used_at DATETIME,
                FOREIGN KEY(voucher_id) REFERENCES vouchers (id),
                FOREIGN KEY(user_id) REFERENCES users (id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_voucher_usages_id ON voucher_usages (id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_voucher_usages_voucher_id ON voucher_usages (voucher_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_voucher_usages_user_id ON voucher_usages (user_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_voucher_usages_used_at ON voucher_usages (used_at)"
        )


ensure_vouchers_schema()


def generate_order_number() -> str:
    return f"RO-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"


def generate_ticket_number() -> str:
    return f"TCK-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"


def generate_voucher_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = "FR-" + "".join(secrets.choice(alphabet) for _ in range(10))
        exists = db.query(VoucherDB.id).filter(VoucherDB.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Nu am putut genera un cod unic")


def normalize_voucher_code(code: str | None) -> str:
    return (code or "").strip().upper()


def calculate_voucher_discount(voucher: VoucherDB, subtotal: float) -> float:
    product_total = max(float(subtotal or 0), 0)
    if voucher.discount_type == "percent":
        return round(product_total * (float(voucher.amount or 0) / 100), 2)
    return round(min(float(voucher.amount or 0), product_total), 2)


def ensure_minimum_product_total(subtotal: float, voucher_amount: float = 0.0) -> None:
    remaining_total = round(float(subtotal or 0) - float(voucher_amount or 0), 2)
    if remaining_total >= MIN_PRODUCT_TOTAL_AFTER_DISCOUNT:
        return

    needed_amount = round(MIN_PRODUCT_TOTAL_AFTER_DISCOUNT - remaining_total, 2)
    raise HTTPException(
        status_code=400,
        detail=(
            "Comanda minimă este de 1 leu. "
            f"Adaugă în coș produse de încă {needed_amount:.2f} lei "
            "pentru a putea aplica voucherul."
        ),
    )


def get_active_voucher_for_user(db: Session, code: str, user_id: int) -> VoucherDB:
    voucher_code = normalize_voucher_code(code)
    if not voucher_code:
        raise HTTPException(status_code=400, detail="Introdu codul voucherului")

    voucher = (
        db.query(VoucherDB)
        .options(joinedload(VoucherDB.usages))
        .filter(VoucherDB.code == voucher_code)
        .first()
    )
    if not voucher or voucher.cancelled_at or voucher.is_expired:
        raise HTTPException(status_code=400, detail="Voucherul nu exista sau nu mai este valabil")

    if voucher.usage_type == "single_use" and voucher.usage_count > 0:
        raise HTTPException(status_code=400, detail="Voucherul a fost deja folosit")

    user_usage = (
        db.query(VoucherUsageDB)
        .filter(VoucherUsageDB.voucher_id == voucher.id, VoucherUsageDB.user_id == user_id)
        .first()
    )
    if user_usage:
        raise HTTPException(status_code=400, detail="Ai folosit deja acest voucher")

    return voucher


def calculate_user_cart_total(db: Session, user_id: int) -> float:
    cart_items = (
        db.query(CartItemDB)
        .options(joinedload(CartItemDB.product))
        .filter(CartItemDB.user_id == user_id)
        .all()
    )

    total = 0.0
    for item in cart_items:
        if not item.product:
            continue
        total += get_discounted_price(item.product.price, getattr(item.product, "promotion", 0)) * item.quantity
    return round(total, 2)


def get_request_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "-"
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or "-"
    return request.client.host if request.client else "-"


def create_login_log(db: Session, user: UserDB, request: Request, created_at: datetime) -> None:
    db.add(
        LoginLogDB(
            user_id=user.id,
            ip_address=get_request_ip(request),
            created_at=created_at,
        )
    )


def attach_product_rating_summary(product: ProductDB, db: Session) -> ProductDB:
    reviews = db.query(ReviewDB).filter(ReviewDB.product_id == product.id).all()
    review_count = len(reviews)
    average_rating = (
        round(sum(review.rating for review in reviews) / review_count, 1)
        if review_count > 0
        else 0.0
    )

    product.average_rating = average_rating
    product.review_count = review_count
    return product


def user_has_purchased_product(db: Session, user_id: int, product_id: int) -> bool:
    purchased_item = (
        db.query(OrderItemDB.id)
        .join(OrderDB, OrderDB.id == OrderItemDB.order_id)
        .filter(
            OrderDB.user_id == user_id,
            OrderItemDB.product_id == product_id,
            OrderDB.status != "anulata",
        )
        .first()
    )
    return purchased_item is not None


def serialize_review(review: ReviewDB, current_user: UserDB | None = None) -> ReviewRead:
    return ReviewRead(
        id=review.id,
        product_id=review.product_id,
        user_id=review.user_id,
        username=review.user.username if review.user else "-",
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
        updated_at=review.updated_at,
        is_mine=bool(current_user and current_user.id == review.user_id),
    )


def build_product_reviews_response(
    product_id: int,
    db: Session,
    current_user: UserDB | None = None,
) -> ProductReviewsRead:
    reviews = (
        db.query(ReviewDB)
        .options(joinedload(ReviewDB.user))
        .filter(ReviewDB.product_id == product_id)
        .order_by(ReviewDB.updated_at.desc(), ReviewDB.created_at.desc(), ReviewDB.id.desc())
        .all()
    )

    total_reviews = len(reviews)
    average_rating = (
        round(sum(review.rating for review in reviews) / total_reviews, 2)
        if total_reviews > 0
        else 0.0
    )

    has_purchased = False
    can_review = False

    if current_user:
        has_purchased = user_has_purchased_product(db, current_user.id, product_id)
        can_review = has_purchased

    return ProductReviewsRead(
        average_rating=average_rating,
        total_reviews=total_reviews,
        has_purchased=has_purchased,
        can_review=can_review,
        reviews=[serialize_review(review, current_user) for review in reviews],
    )


def build_cart_response(db: Session, current_user: UserDB) -> CartRead:
    cart_items = (
        db.query(CartItemDB)
        .options(joinedload(CartItemDB.product))
        .filter(CartItemDB.user_id == current_user.id)
        .all()
    )

    changed = False
    result_items = []
    total = 0.0

    for item in cart_items:
        product = item.product

        if not product or product.quantity <= 0:
            db.delete(item)
            changed = True
            continue

        if item.quantity > product.quantity:
            item.quantity = product.quantity
            changed = True

        discounted_price = get_discounted_price(product.price, getattr(product, "promotion", 0))
        line_total = discounted_price * item.quantity
        total += line_total

        result_items.append(
            CartItemRead(
                id=item.id,
                product_id=product.id,
                product_name=product.name,
                product_code=product.code,
                unit_price=discounted_price,
                quantity=item.quantity,
                stock=product.quantity,
                image_url=f"/images/products/{product.code}.jpg",
                unavailable=False,
            )
        )

    if changed:
        db.commit()

    return CartRead(items=result_items, total=total)


def build_favorites_response(db: Session, current_user: UserDB) -> list[ProductRead]:
    favorite_items = (
        db.query(FavoriteItemDB)
        .options(joinedload(FavoriteItemDB.product))
        .filter(FavoriteItemDB.user_id == current_user.id)
        .order_by(FavoriteItemDB.id.desc())
        .all()
    )

    changed = False
    products = []

    for item in favorite_items:
        if not item.product:
            db.delete(item)
            changed = True
            continue

        products.append(attach_product_rating_summary(item.product, db))

    if changed:
        db.commit()

    return products


def build_wishlist_response(db: Session, current_user: UserDB) -> list[ProductRead]:
    wishlist_items = (
        db.query(WishlistItemDB)
        .options(joinedload(WishlistItemDB.product))
        .filter(WishlistItemDB.user_id == current_user.id)
        .order_by(WishlistItemDB.id.desc())
        .all()
    )

    changed = False
    products = []

    for item in wishlist_items:
        if not item.product or item.product.quantity > 0:
            db.delete(item)
            changed = True
            continue

        products.append(attach_product_rating_summary(item.product, db))

    if changed:
        db.commit()

    return products


def notify_wishlist_users_if_restocked(
    db: Session,
    product: ProductDB,
    previous_quantity: int,
) -> int:
    if previous_quantity > 0 or product.quantity <= 0:
        return 0

    wishlist_items = (
        db.query(WishlistItemDB)
        .filter(WishlistItemDB.product_id == product.id)
        .all()
    )
    if not wishlist_items:
        return 0

    now = datetime.utcnow()
    for item in wishlist_items:
        db.add(
            NotificationDB(
                user_id=item.user_id,
                ticket_id=None,
                order_id=None,
                notification_type="wishlist_stock",
                message=f'Produsul „{product.name}” este din nou în stoc.',
                created_at=now,
                is_read=False,
            )
        )
        db.delete(item)

    return len(wishlist_items)


def detect_product_image_extension(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def delete_profile_image(user_id: int) -> None:
    for extension in PRODUCT_IMAGE_EXTENSIONS:
        image_path = PROFILE_IMAGES_DIR / f"user-{user_id}.{extension}"
        if image_path.exists():
            image_path.unlink()


def delete_product_image_slot(code: str, position: int) -> None:
    suffix = "" if position == 0 else f"_{position}"
    for extension in PRODUCT_IMAGE_EXTENSIONS:
        image_path = PRODUCT_IMAGES_DIR / f"{code}{suffix}.{extension}"
        if image_path.exists():
            image_path.unlink()


def delete_all_product_images(code: str) -> None:
    for position in range(7):
        delete_product_image_slot(code, position)


def can_access_ticket(ticket: TicketDB, current_user: UserDB) -> bool:
    if current_user.role in ["moderator", "admin"]:
        return True
    return ticket.user_id == current_user.id


def clear_expired_ban(user: UserDB, db: Session, now: datetime | None = None) -> bool:
    if user.ban_permanent:
        return False

    current_time = now or datetime.utcnow()
    if user.ban_until and user.ban_until <= current_time:
        user.ban_until = None
        user.ban_reason = None
        user.current_ban_key = None
        db.commit()
        return True

    return False


def is_user_banned(user: UserDB, db: Session, now: datetime | None = None) -> bool:
    clear_expired_ban(user, db, now)
    return bool(user.ban_permanent or (user.ban_until and user.ban_until > (now or datetime.utcnow())))


def get_current_ban_ticket(db: Session, user: UserDB) -> TicketDB | None:
    if not user.current_ban_key:
        return None

    return (
        db.query(TicketDB)
        .filter(
            TicketDB.user_id == user.id,
            TicketDB.category == "ban",
            TicketDB.ban_key == user.current_ban_key,
        )
        .order_by(TicketDB.created_at.desc(), TicketDB.id.desc())
        .first()
    )


def get_ban_token_expiry_minutes(user: UserDB) -> int:
    if user.ban_permanent or not user.ban_until:
        return 24 * 60

    remaining_seconds = max(0, int((user.ban_until - datetime.utcnow()).total_seconds()))
    return max(5, (remaining_seconds // 60) + 5)


def get_user_from_ban_token(db: Session, ban_token: str) -> UserDB:
    token_payload = decode_access_token(ban_token)
    if not token_payload or token_payload.get("purpose") != "banned_ticket":
        raise HTTPException(status_code=401, detail="Token invalid")

    user = db.query(UserDB).filter(UserDB.id == int(token_payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not is_user_banned(user, db):
        raise HTTPException(status_code=400, detail="Contul nu mai este suspendat")

    if token_payload.get("ban_key") != user.current_ban_key:
        raise HTTPException(status_code=401, detail="Token invalid pentru suspendarea curenta")

    return user


def build_ban_detail(user: UserDB, db: Session) -> dict:
    if not user.current_ban_key:
        user.current_ban_key = uuid4().hex
        db.commit()
        db.refresh(user)

    support_ticket = get_current_ban_ticket(db, user)
    ban_token = create_access_token(
        data={
            "sub": str(user.id),
            "purpose": "banned_ticket",
            "ban_key": user.current_ban_key,
        },
        expires_minutes=get_ban_token_expiry_minutes(user),
    )
    return {
        "code": "account_banned",
        "message": "Contul este suspendat.",
        "username": user.username,
        "email": user.email,
        "ban_permanent": bool(user.ban_permanent),
        "ban_until": f"{user.ban_until.isoformat()}Z" if user.ban_until else None,
        "ban_reason": user.ban_reason,
        "ban_token": ban_token,
        "support_ticket_id": support_ticket.id if support_ticket else None,
    }


def get_session_cookie_name(session_id: str) -> str:
    return f"fishro_session_{session_id}"


def get_ticket_or_404(ticket_id: int, db: Session) -> TicketDB:
    ticket = (
        db.query(TicketDB)
        .options(
            joinedload(TicketDB.user),
            joinedload(TicketDB.assigned_to_user),
            joinedload(TicketDB.messages).joinedload(TicketMessageDB.sender),
        )
        .filter(TicketDB.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Tichetul nu exista")
    return ticket


def serialize_ticket_message(message: TicketMessageDB) -> TicketMessageRead:
    return TicketMessageRead(
        id=message.id,
        ticket_id=message.ticket_id,
        sender_id=message.sender_id,
        sender_username=message.sender.username if message.sender else "-",
        sender_role=message.sender.role if message.sender else "user",
        sender_profile_image_url=message.sender.profile_image_url if message.sender else None,
        message=message.message,
        created_at=message.created_at,
    )


def ticket_has_unread_for_user(ticket: TicketDB, current_user: UserDB, db: Session) -> bool:
    latest_message_query = db.query(TicketMessageDB).filter(TicketMessageDB.ticket_id == ticket.id)

    if current_user.role in ["moderator", "admin"]:
        latest_message_query = latest_message_query.filter(
            ~TicketMessageDB.sender.has(UserDB.role.in_(["moderator", "admin"]))
        )

    latest_message = latest_message_query.order_by(TicketMessageDB.id.desc()).first()

    if not latest_message:
        return False

    if current_user.role in ["moderator", "admin"]:
        staff_start = current_user.staff_notifications_start_at
        if staff_start and latest_message.created_at and latest_message.created_at < staff_start:
            return False

        if ticket.staff_last_read_message_id is None:
            return True

        return ticket.staff_last_read_message_id < latest_message.id

    if latest_message.sender_id == current_user.id:
        return False

    state = (
        db.query(TicketReadStateDB)
        .filter(
            TicketReadStateDB.ticket_id == ticket.id,
            TicketReadStateDB.user_id == current_user.id,
        )
        .first()
    )

    if not state or state.last_read_message_id is None:
        return True

    return state.last_read_message_id < latest_message.id


def get_ticket_unread_kind(ticket: TicketDB, current_user: UserDB, db: Session) -> str | None:
    if not ticket_has_unread_for_user(ticket, current_user, db):
        return None

    if current_user.role in ["moderator", "admin"]:
        has_staff_message = (
            db.query(TicketMessageDB.id)
            .filter(
                TicketMessageDB.ticket_id == ticket.id,
                TicketMessageDB.sender.has(UserDB.role.in_(["moderator", "admin"])),
            )
            .first()
            is not None
        )

        return "message" if has_staff_message else "ticket"

    return "message"


def serialize_ticket_list(ticket: TicketDB, current_user: UserDB, db: Session) -> TicketListRead:
    assigned_to_user_id = None
    assigned_to_username = None

    if current_user.role in ["moderator", "admin"]:
        assigned_to_user_id = ticket.assigned_to_user_id
        assigned_to_username = ticket.assigned_to_user.username if ticket.assigned_to_user else None

    has_unread = ticket_has_unread_for_user(ticket, current_user, db)

    return TicketListRead(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        user_id=ticket.user_id,
        username=ticket.user.username if ticket.user else "-",
        category=ticket.category,
        status=ticket.status,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        last_message_at=ticket.last_message_at,
        has_unread=has_unread,
        unread_kind=get_ticket_unread_kind(ticket, current_user, db) if has_unread else None,
        assigned_to_user_id=assigned_to_user_id,
        assigned_to_username=assigned_to_username,
    )


def serialize_ticket_detail(ticket: TicketDB, current_user: UserDB) -> TicketDetailRead:
    assigned_to_user_id = None
    assigned_to_username = None

    if current_user.role in ["moderator", "admin"]:
        assigned_to_user_id = ticket.assigned_to_user_id
        assigned_to_username = ticket.assigned_to_user.username if ticket.assigned_to_user else None

    return TicketDetailRead(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        user_id=ticket.user_id,
        username=ticket.user.username if ticket.user else "-",
        category=ticket.category,
        status=ticket.status,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        last_message_at=ticket.last_message_at,
        assigned_to_user_id=assigned_to_user_id,
        assigned_to_username=assigned_to_username,
        messages=[serialize_ticket_message(message) for message in ticket.messages],
    )


def create_ticket_reply_notification(
    db: Session,
    ticket: TicketDB,
    recipient_id: int,
    created_at: datetime,
) -> None:
    category = ticket.category or "alta"
    message = f"Ai primit un răspuns la tichetul tău categoria {category}."

    db.add(
        NotificationDB(
            user_id=recipient_id,
            ticket_id=ticket.id,
            notification_type="ticket",
            message=message,
            created_at=created_at,
            is_read=False,
        )
    )


def serialize_fishbot_message(message: FishbotMessageDB) -> FishbotMessageRead:
    products = []
    if message.products_json:
        try:
            products = json.loads(message.products_json)
        except json.JSONDecodeError:
            products = []

    return FishbotMessageRead(
        id=message.id,
        sender=message.sender,
        text=message.message,
        created_at=message.created_at,
        products=products,
    )


def serialize_fishbot_conversation(
    conversation: FishbotConversationDB,
) -> FishbotConversationRead:
    return FishbotConversationRead(
        id=conversation.id,
        client_key=conversation.client_key,
        title=conversation.title,
        created_at=conversation.created_at,
        ended_at=conversation.ended_at,
        messages=[
            serialize_fishbot_message(message)
            for message in conversation.messages
        ],
    )


def create_staff_order_notifications(db: Session, order: OrderDB, created_at: datetime) -> None:
    staff_users = db.query(UserDB).filter(UserDB.role.in_(["moderator", "admin"])).all()
    message = f"Comandă nouă {order.order_number} în valoare de {order.total:.2f} lei."

    for staff_user in staff_users:
        db.add(
            NotificationDB(
                user_id=staff_user.id,
                order_id=order.id,
                notification_type="order",
                message=message,
                created_at=created_at,
                is_read=False,
            )
        )


def mark_staff_order_notifications_read(db: Session, order_id: int, read_at: datetime) -> None:
    notifications = (
        db.query(NotificationDB)
        .filter(
            NotificationDB.order_id == order_id,
            NotificationDB.notification_type == "order",
            NotificationDB.is_read == False,  # noqa: E712
        )
        .all()
    )

    for notification in notifications:
        notification.is_read = True
        notification.read_at = read_at


def mark_staff_ticket_notifications_read(db: Session, ticket_id: int, read_at: datetime) -> None:
    notifications = (
        db.query(NotificationDB)
        .join(UserDB, UserDB.id == NotificationDB.user_id)
        .filter(
            NotificationDB.ticket_id == ticket_id,
            NotificationDB.notification_type == "ticket",
            NotificationDB.is_read == False,  # noqa: E712
            UserDB.role.in_(["moderator", "admin"]),
        )
        .all()
    )

    for notification in notifications:
        notification.is_read = True
        notification.read_at = read_at


def count_unread_staff_order_notifications(db: Session, current_user: UserDB) -> int:
    if current_user.role not in ["moderator", "admin"]:
        return 0

    return (
        db.query(NotificationDB)
        .filter(
            NotificationDB.user_id == current_user.id,
            NotificationDB.notification_type == "order",
            NotificationDB.is_read == False,  # noqa: E712
        )
        .count()
    )


def get_order_status_label(status: str) -> str:
    labels = {
        "trimisa": "a fost trimisă",
        "confirmata": "a fost confirmată",
        "in_tranzit": "este în tranzit",
        "livrata": "a fost livrată",
        "anulata": "a fost anulată",
    }
    return labels.get(status, f"are statusul {status or '-'}")


def create_order_status_notification(
    db: Session,
    order: OrderDB,
    new_status: str,
    created_at: datetime,
) -> None:
    if not order.user_id:
        return

    message = f"Comanda {order.order_number} {get_order_status_label(new_status)}."

    db.add(
        NotificationDB(
            user_id=order.user_id,
            ticket_id=None,
            order_id=order.id,
            notification_type="order_status",
            message=message,
            created_at=created_at,
            is_read=False,
        )
    )


def get_or_create_read_state(ticket_id: int, user_id: int, db: Session) -> TicketReadStateDB:
    state = (
        db.query(TicketReadStateDB)
        .filter(
            TicketReadStateDB.ticket_id == ticket_id,
            TicketReadStateDB.user_id == user_id,
        )
        .first()
    )
    if state:
        return state

    state = TicketReadStateDB(ticket_id=ticket_id, user_id=user_id, last_read_message_id=None)
    db.add(state)
    db.flush()
    return state


def mark_ticket_as_read(ticket: TicketDB, current_user: UserDB, db: Session) -> None:
    if not ticket.messages:
        return

    state = get_or_create_read_state(ticket.id, current_user.id, db)
    latest_message_id = max(message.id for message in ticket.messages)
    if state.last_read_message_id != latest_message_id:
        state.last_read_message_id = latest_message_id
        db.commit()


def mark_ticket_as_read_for_staff(ticket: TicketDB, current_user: UserDB, db: Session) -> None:
    if not ticket.messages:
        return

    latest_message = max(ticket.messages, key=lambda message: message.id)

    if ticket.staff_last_read_message_id != latest_message.id:
        ticket.staff_last_read_message_id = latest_message.id
        db.commit()


def count_unread_tickets_for_user(db: Session, current_user: UserDB) -> int:
    latest_messages_query = db.query(
        TicketMessageDB.ticket_id.label("ticket_id"),
        func.max(TicketMessageDB.id).label("latest_message_id"),
    )

    if current_user.role in ["moderator", "admin"]:
        latest_messages_query = latest_messages_query.filter(
            ~TicketMessageDB.sender.has(UserDB.role.in_(["moderator", "admin"]))
        )

    latest_subquery = latest_messages_query.group_by(TicketMessageDB.ticket_id).subquery()

    query = (
        db.query(TicketDB.id)
        .join(latest_subquery, latest_subquery.c.ticket_id == TicketDB.id)
        .join(TicketMessageDB, TicketMessageDB.id == latest_subquery.c.latest_message_id)
    )

    if current_user.role in ["moderator", "admin"]:
        if current_user.staff_notifications_start_at is not None:
            query = query.filter(
                TicketMessageDB.created_at >= current_user.staff_notifications_start_at
            )

        query = query.filter(
            (TicketDB.staff_last_read_message_id.is_(None))
            | (TicketDB.staff_last_read_message_id < TicketMessageDB.id)
        )

        return query.distinct().count()

    query = query.outerjoin(
        TicketReadStateDB,
        (TicketReadStateDB.ticket_id == TicketDB.id)
        & (TicketReadStateDB.user_id == current_user.id),
    )

    query = query.filter(TicketDB.user_id == current_user.id)
    query = query.filter(TicketMessageDB.sender_id != current_user.id)
    query = query.filter(
        (TicketReadStateDB.last_read_message_id.is_(None))
        | (TicketReadStateDB.last_read_message_id < TicketMessageDB.id)
    )

    return query.distinct().count()


def get_ticket_create_availability(db: Session, current_user: UserDB) -> TicketCreateAvailabilityRead:
    if current_user.role in ["moderator", "admin"]:
        return TicketCreateAvailabilityRead(
            can_create=True,
            remaining_seconds=0,
            next_allowed_at=None,
        )

    latest_ticket = (
        db.query(TicketDB)
        .filter(TicketDB.user_id == current_user.id)
        .order_by(TicketDB.created_at.desc(), TicketDB.id.desc())
        .first()
    )

    if not latest_ticket or not latest_ticket.created_at:
        return TicketCreateAvailabilityRead(
            can_create=True,
            remaining_seconds=0,
            next_allowed_at=None,
        )

    next_allowed_at = latest_ticket.created_at + timedelta(hours=TICKET_CREATE_COOLDOWN_HOURS)
    now = datetime.utcnow()

    if now >= next_allowed_at:
        return TicketCreateAvailabilityRead(
            can_create=True,
            remaining_seconds=0,
            next_allowed_at=next_allowed_at,
        )

    remaining_seconds = int((next_allowed_at - now).total_seconds())
    return TicketCreateAvailabilityRead(
        can_create=False,
        remaining_seconds=max(0, remaining_seconds),
        next_allowed_at=next_allowed_at,
    )


# -------------------- PRODUCTS --------------------
@app.post("/products", response_model=ProductRead)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    if payload.promotion not in PROMOTION_VALUES:
        raise HTTPException(status_code=400, detail="Promotie invalida")

    existing = db.query(ProductDB).filter(ProductDB.code == payload.code).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Exista deja un produs cu acest cod.",
        )

    product = ProductDB(
        code=payload.code,
        name=payload.name,
        category=payload.category,
        price=payload.price,
        quantity=payload.quantity,
        promotion=payload.promotion,
        description=payload.description,
        tech_details=payload.tech_details,
        video_url=payload.video_url,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@app.get("/products", response_model=list[ProductRead])
def get_products(db: Session = Depends(get_db)):
    products = db.query(ProductDB).all()
    return [attach_product_rating_summary(product, db) for product in products]


@app.get("/products/{product_id}", response_model=ProductRead)
def get_product_by_id(product_id: int, db: Session = Depends(get_db)):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu exista")
    return attach_product_rating_summary(product, db)


@app.put("/products/{product_id}/images/{position}")
async def upload_product_image(
    product_id: int,
    position: int,
    request: Request,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    if position < 0 or position > 6:
        raise HTTPException(
            status_code=400,
            detail="Poziția imaginii trebuie să fie între 0 și 6",
        )

    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu există")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_PRODUCT_IMAGE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Imaginea depășește limita de 8 MB",
                )
        except ValueError:
            pass

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Fișierul imagine este gol")
    if len(data) > MAX_PRODUCT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Imaginea depășește limita de 8 MB")

    extension = detect_product_image_extension(data)
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Format invalid. Sunt acceptate JPG, PNG și WEBP.",
        )

    PRODUCT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    delete_product_image_slot(product.code, position)

    suffix = "" if position == 0 else f"_{position}"
    filename = f"{product.code}{suffix}.{extension}"
    destination = PRODUCT_IMAGES_DIR / filename
    temporary = PRODUCT_IMAGES_DIR / f".{filename}.uploading"

    try:
        temporary.write_bytes(data)
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()

    return {
        "ok": True,
        "filename": filename,
        "url": f"/images/products/{filename}",
        "position": position,
    }


@app.delete("/products/{product_id}/images")
def clear_product_images(
    product_id: int,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu există")

    delete_all_product_images(product.code)
    return {"ok": True}


@app.get("/products/{product_id}/reviews", response_model=ProductReviewsRead)
def get_product_reviews(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB | None = Depends(get_optional_current_user),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu exista")

    return build_product_reviews_response(
        product_id=product_id,
        db=db,
        current_user=current_user,
    )


@app.post("/products/{product_id}/reviews", response_model=ReviewRead)
def create_or_update_product_review(
    product_id: int,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu exista")

    clean_comment = (payload.comment or "").strip()

    now = datetime.utcnow()

    existing_review = (
        db.query(ReviewDB)
        .filter(
            ReviewDB.product_id == product_id,
            ReviewDB.user_id == current_user.id,
        )
        .first()
    )

    if existing_review:
        existing_review.rating = payload.rating
        existing_review.comment = clean_comment
        existing_review.updated_at = now
        db.commit()

        saved_review = (
            db.query(ReviewDB)
            .options(joinedload(ReviewDB.user))
            .filter(ReviewDB.id == existing_review.id)
            .first()
        )
        return serialize_review(saved_review, current_user)

    if not user_has_purchased_product(db, current_user.id, product_id):
        raise HTTPException(
            status_code=403,
            detail="Poți lăsa o recenzie doar după ce ai cumpărat produsul",
        )

    review = ReviewDB(
        product_id=product_id,
        user_id=current_user.id,
        rating=payload.rating,
        comment=clean_comment,
        created_at=now,
        updated_at=now,
    )
    db.add(review)
    db.commit()

    saved_review = (
        db.query(ReviewDB)
        .options(joinedload(ReviewDB.user))
        .filter(ReviewDB.id == review.id)
        .first()
    )
    return serialize_review(saved_review, current_user)


@app.patch("/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produs inexistent")

    data = payload.model_dump(exclude_unset=True)
    previous_quantity = product.quantity

    if "promotion" in data and data["promotion"] not in PROMOTION_VALUES:
        raise HTTPException(status_code=400, detail="Promotie invalida")

    for key, value in data.items():
        setattr(product, key, value)

    notify_wishlist_users_if_restocked(db, product, previous_quantity)
    db.commit()
    db.refresh(product)
    return product


@app.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produs inexistent")

    db.query(WishlistItemDB).filter(WishlistItemDB.product_id == product_id).delete(
        synchronize_session=False
    )
    delete_all_product_images(product.code)
    db.delete(product)
    db.commit()
    return {"ok": True}


# -------------------- AUTH --------------------
ACCOUNT_REAPPLICATION_WAIT = timedelta(days=14)


@app.post("/auth/register", response_model=UserRead)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing_email = db.query(UserDB).filter(UserDB.email == payload.email).first()
    if existing_email:
        if existing_email.approval_status == "pending":
            raise HTTPException(
                status_code=409,
                detail="Există deja o cerere în curs de analiză pentru această adresă de email.",
            )

        if existing_email.approval_status != "rejected":
            raise HTTPException(status_code=400, detail="Email already registered")

        rejected_at = existing_email.approval_updated_at or datetime.utcnow()
        retry_at = rejected_at + ACCOUNT_REAPPLICATION_WAIT
        now = datetime.utcnow()

        if now < retry_at:
            remaining_hours = max(
                1,
                int((retry_at - now).total_seconds() + 3599) // 3600,
            )
            remaining_days, extra_hours = divmod(remaining_hours, 24)
            wait_parts = []
            if remaining_days:
                wait_parts.append(
                    f"{remaining_days} {'zi' if remaining_days == 1 else 'zile'}"
                )
            if extra_hours:
                wait_parts.append(
                    f"{extra_hours} {'oră' if extra_hours == 1 else 'ore'}"
                )

            raise HTTPException(
                status_code=429,
                detail=(
                    "Poți trimite o nouă cerere la 14 zile după respingere. "
                    f"Mai ai de așteptat {' și '.join(wait_parts)}."
                ),
            )

        username_owner = (
            db.query(UserDB)
            .filter(
                UserDB.username == payload.username,
                UserDB.id != existing_email.id,
            )
            .first()
        )
        if username_owner:
            raise HTTPException(status_code=400, detail="Username already taken")

        existing_email.username = payload.username
        existing_email.hashed_password = hash_password(payload.password)
        existing_email.approval_status = "pending"
        existing_email.approval_updated_at = now
        existing_email.current_session_id = None
        existing_email.last_seen_at = None
        existing_email.presence_seen_at = None
        db.commit()
        db.refresh(existing_email)
        return existing_email

    existing_username = db.query(UserDB).filter(UserDB.username == payload.username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = UserDB(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role="user",
        approval_status="pending",
        approval_updated_at=datetime.utcnow(),
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=Token)
def login(
    payload: UserLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.query(UserDB).filter(UserDB.email == payload.email).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if user.approval_status == "pending":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "account_pending",
                "message": "Contul tău este în curs de analiză și așteaptă aprobarea administratorului.",
            },
        )

    if user.approval_status == "rejected":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "account_rejected",
                "message": "Ne pare rău, cererea de creare a contului a fost respinsă.",
            },
        )

    if is_user_banned(user, db):
        raise HTTPException(status_code=403, detail=build_ban_detail(user, db))

    session_id = uuid4().hex
    now = datetime.utcnow()
    user.current_session_id = session_id
    user.last_seen_at = now
    user.presence_seen_at = now
    create_login_log(db, user, request, now)
    db.commit()

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role,
            "session_id": session_id,
            "purpose": "session",
        }
    )
    response.set_cookie(
        key=get_session_cookie_name(session_id),
        value=access_token,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        max_age=SESSION_COOKIE_MAX_AGE_SECONDS,
    )

    return {
        "access_token": session_id,
        "token_type": "bearer",
    }


@app.get("/auth/me", response_model=UserRead)
def me(current_user: UserDB = Depends(get_current_user)):
    return current_user


@app.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    session_id = request.headers.get("X-Session-Id")
    if not session_id:
        auth_header = request.headers.get("Authorization") or ""
        if auth_header.lower().startswith("bearer "):
            session_id = auth_header.split(" ", 1)[1].strip()

    if session_id:
        user = db.query(UserDB).filter(UserDB.current_session_id == session_id).first()
        if user:
            user.current_session_id = None
            user.last_seen_at = None
            user.presence_seen_at = None
            db.commit()
        response.delete_cookie(
            key=get_session_cookie_name(session_id),
            secure=SESSION_COOKIE_SECURE,
            samesite=SESSION_COOKIE_SAMESITE,
        )

    return {"ok": True}


@app.post("/auth/presence")
def update_presence(
    payload: PresenceUpdate,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    now = datetime.utcnow()
    previous_status = current_user.presence_status
    current_user.presence_seen_at = now
    if payload.visible:
        current_user.last_seen_at = now
        if previous_status == "offline":
            create_login_log(db, current_user, request, now)
        if current_user.current_session_id:
            access_token = create_access_token(
                data={
                    "sub": str(current_user.id),
                    "role": current_user.role,
                    "session_id": current_user.current_session_id,
                    "purpose": "session",
                }
            )
            response.set_cookie(
                key=get_session_cookie_name(current_user.current_session_id),
                value=access_token,
                httponly=True,
                secure=SESSION_COOKIE_SECURE,
                samesite=SESSION_COOKIE_SAMESITE,
                max_age=SESSION_COOKIE_MAX_AGE_SECONDS,
            )
    db.commit()
    return {"ok": True, "presence_status": current_user.presence_status}


@app.patch("/auth/me", response_model=UserRead)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    current_user.full_name = (payload.full_name or "").strip() or None
    current_user.phone = (payload.phone or "").strip() or None
    current_user.address = (payload.address or "").strip() or None
    current_user.city = (payload.city or "").strip() or None
    current_user.county = (payload.county or "").strip() or None
    current_user.postal_code = (payload.postal_code or "").strip() or None

    db.commit()
    db.refresh(current_user)
    return current_user


@app.put("/auth/me/profile-image", response_model=UserRead)
async def upload_profile_image(
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_PROFILE_IMAGE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Imaginea depășește limita de 5 MB",
                )
        except ValueError:
            pass

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Fișierul imagine este gol")
    if len(data) > MAX_PROFILE_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Imaginea depășește limita de 5 MB")

    extension = detect_product_image_extension(data)
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Format invalid. Sunt acceptate JPG, PNG și WEBP.",
        )

    PROFILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    delete_profile_image(current_user.id)

    filename = f"user-{current_user.id}.{extension}"
    destination = PROFILE_IMAGES_DIR / filename
    temporary = PROFILE_IMAGES_DIR / f".{filename}.uploading"

    try:
        temporary.write_bytes(data)
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()

    current_user.profile_image_url = f"/images/profiles/{filename}?v={uuid4().hex}"
    db.commit()
    db.refresh(current_user)
    return current_user


@app.delete("/auth/me/profile-image", response_model=UserRead)
def remove_profile_image(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    delete_profile_image(current_user.id)
    current_user.profile_image_url = None
    db.commit()
    db.refresh(current_user)
    return current_user


@app.patch("/auth/me/password")
def change_my_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Parola actuală este incorectă.")

    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Parola nouă trebuie să fie diferită de parola actuală.",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Parola a fost schimbată cu succes."}


@app.get("/dashboard/users", response_model=list[UserRead])
def get_dashboard_users(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    query = db.query(UserDB).filter(UserDB.approval_status == "approved")
    users = query.all()
    now = datetime.utcnow()
    for user in users:
        clear_expired_ban(user, db, now)

    role_order = {"admin": 0, "moderator": 1, "user": 2}
    return sorted(
        users,
        key=lambda user: (
            role_order.get(user.role, 99),
            (user.username or "").lower(),
            user.id,
        ),
    )


@app.get("/dashboard/user-approvals", response_model=list[UserRead])
def get_pending_user_approvals(
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    return (
        db.query(UserDB)
        .filter(
            UserDB.role == "user",
            UserDB.approval_status == "pending",
        )
        .order_by(UserDB.id.asc())
        .all()
    )


@app.patch("/dashboard/user-approvals/{user_id}", response_model=UserRead)
def update_user_approval(
    user_id: int,
    payload: UserApprovalUpdate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilizatorul nu există")
    if target.role != "user":
        raise HTTPException(status_code=400, detail="Doar conturile de utilizator necesită aprobare")
    if target.approval_status != "pending":
        raise HTTPException(status_code=409, detail="Cererea a fost deja procesată")

    now = datetime.utcnow()
    target.approval_status = "approved" if payload.action == "approve" else "rejected"
    target.approval_updated_at = now
    target.current_session_id = None
    target.last_seen_at = None
    target.presence_seen_at = None

    if payload.action == "approve":
        db.add(
            NotificationDB(
                user_id=target.id,
                notification_type="account_approved",
                message="Contul dvs. a fost aprobat.",
                created_at=now,
                is_read=False,
            )
        )

    db.commit()
    db.refresh(target)
    return target


@app.get("/dashboard/users/{user_id}/login-logs", response_model=list[LoginLogRead])
def get_user_login_logs(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role == "moderator" and target.role != "user":
        raise HTTPException(status_code=403, detail="Moderatorii pot vedea doar logurile userilor")

    return (
        db.query(LoginLogDB)
        .filter(LoginLogDB.user_id == user_id)
        .order_by(LoginLogDB.created_at.desc(), LoginLogDB.id.desc())
        .all()
    )


@app.patch("/dashboard/users/{user_id}/ban", response_model=UserRead)
def update_user_ban(
    user_id: int,
    payload: UserBanUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "admin":
        raise HTTPException(status_code=403, detail="Adminii nu pot fi suspendati")

    if current_user.role == "moderator" and target.role != "user":
        raise HTTPException(status_code=403, detail="Moderatorii pot suspenda doar useri obisnuiti")

    now = datetime.utcnow()
    durations = {
        "2m": timedelta(minutes=2),
        "1h": timedelta(hours=1),
        "12h": timedelta(hours=12),
        "24h": timedelta(hours=24),
    }

    if payload.ban_type == "none":
        target.ban_until = None
        target.ban_permanent = False
        target.ban_reason = None
        target.current_ban_key = None
    elif payload.ban_type == "permanent":
        target.ban_until = None
        target.ban_permanent = True
        target.ban_reason = (payload.reason or "").strip() or None
        target.current_ban_key = uuid4().hex
    else:
        target.ban_until = now + durations[payload.ban_type]
        target.ban_permanent = False
        target.ban_reason = (payload.reason or "").strip() or None
        target.current_ban_key = uuid4().hex

    db.commit()
    db.refresh(target)
    return target


@app.patch("/dashboard/users/{user_id}/role", response_model=UserRead)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "admin":
        raise HTTPException(status_code=403, detail="Adminii nu isi pot modifica gradele intre ei")

    target.role = payload.role
    if payload.role == "moderator" and target.staff_notifications_start_at is None:
        target.staff_notifications_start_at = datetime.utcnow()

    db.commit()
    db.refresh(target)
    return target


@app.post("/dashboard/users/{user_id}/notifications", response_model=NotificationRead)
def send_manual_user_notification(
    user_id: int,
    payload: ManualNotificationCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Nu poti trimite notificari staff-ului")

    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    notification = NotificationDB(
        user_id=target.id,
        ticket_id=None,
        order_id=None,
        notification_type="manual",
        message=clean_message,
        created_at=datetime.utcnow(),
        is_read=False,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


@app.post("/dashboard/users/notifications/all")
def send_manual_all_users_notification(
    payload: ManualNotificationCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    targets = db.query(UserDB).filter(UserDB.role == "user").all()
    now = datetime.utcnow()

    for target in targets:
        db.add(
            NotificationDB(
                user_id=target.id,
                ticket_id=None,
                order_id=None,
                notification_type="manual",
                message=clean_message,
                created_at=now,
                is_read=False,
            )
        )

    db.commit()
    return {"ok": True, "sent": len(targets)}


@app.post("/vouchers/apply", response_model=VoucherApplyResponse)
def apply_voucher_preview(
    payload: VoucherApplyRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    subtotal = calculate_user_cart_total(db, current_user.id)
    if subtotal <= 0:
        raise HTTPException(status_code=400, detail="Cosul este gol")

    voucher = get_active_voucher_for_user(db, payload.code, current_user.id)
    discount_amount = calculate_voucher_discount(voucher, subtotal)
    ensure_minimum_product_total(subtotal, discount_amount)
    products_total = round(max(subtotal - discount_amount, 0), 2)

    return VoucherApplyResponse(
        code=voucher.code,
        amount=round(float(voucher.amount), 2),
        discount_type=voucher.discount_type,
        discount_amount=discount_amount,
        subtotal=subtotal,
        shipping_amount=SHIPPING_AMOUNT,
        total=round(products_total + SHIPPING_AMOUNT, 2),
        usage_type=voucher.usage_type,
        expires_at=voucher.expires_at,
    )


@app.get("/dashboard/vouchers", response_model=list[VoucherRead])
def get_vouchers(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    return (
        db.query(VoucherDB)
        .options(joinedload(VoucherDB.usages))
        .order_by(VoucherDB.created_at.desc(), VoucherDB.id.desc())
        .all()
    )


@app.post("/dashboard/vouchers", response_model=VoucherRead)
def create_voucher(
    payload: VoucherCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    now = datetime.utcnow()
    expires_at = datetime.combine(payload.expires_on, time(23, 59, 59))
    if expires_at < now:
        raise HTTPException(status_code=400, detail="Data expirarii nu poate fi in trecut")

    voucher = VoucherDB(
        code=generate_voucher_code(db),
        amount=round(float(payload.amount), 2),
        discount_type=payload.discount_type,
        usage_type=payload.usage_type,
        created_at=now,
        expires_at=expires_at,
    )
    db.add(voucher)
    db.commit()
    db.refresh(voucher)
    return voucher


@app.patch("/dashboard/vouchers/{voucher_id}/cancel", response_model=VoucherRead)
def cancel_voucher(
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    voucher = (
        db.query(VoucherDB)
        .options(joinedload(VoucherDB.usages))
        .filter(VoucherDB.id == voucher_id)
        .first()
    )
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucherul nu exista")

    if not voucher.cancelled_at:
        voucher.cancelled_at = datetime.utcnow()
        db.commit()
        db.refresh(voucher)

    return voucher


# -------------------- CART --------------------
@app.get("/cart", response_model=CartRead)
def get_cart(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return build_cart_response(db, current_user)


@app.post("/cart/items", response_model=CartRead)
def add_cart_item(
    payload: CartItemAdd,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    product = db.query(ProductDB).filter(ProductDB.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu exista")

    if product.quantity <= 0:
        raise HTTPException(status_code=400, detail="Produs indisponibil")

    qty = max(1, payload.quantity)

    existing = (
        db.query(CartItemDB)
        .filter(CartItemDB.user_id == current_user.id, CartItemDB.product_id == payload.product_id)
        .first()
    )

    if existing:
        existing.quantity = min(existing.quantity + qty, product.quantity)
    else:
        db.add(
            CartItemDB(
                user_id=current_user.id,
                product_id=payload.product_id,
                quantity=min(qty, product.quantity),
            )
        )

    db.commit()
    return build_cart_response(db, current_user)


@app.patch("/cart/items/{product_id}", response_model=CartRead)
def update_cart_item(
    product_id: int,
    payload: CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    item = (
        db.query(CartItemDB)
        .filter(CartItemDB.user_id == current_user.id, CartItemDB.product_id == product_id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Produsul nu este in cos")

    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        db.delete(item)
        db.commit()
        return build_cart_response(db, current_user)

    if payload.quantity <= 0:
        db.delete(item)
        db.commit()
        return build_cart_response(db, current_user)

    item.quantity = min(payload.quantity, max(0, product.quantity))

    if item.quantity <= 0:
        db.delete(item)

    db.commit()
    return build_cart_response(db, current_user)


@app.delete("/cart/items/{product_id}", response_model=CartRead)
def delete_cart_item(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    item = (
        db.query(CartItemDB)
        .filter(CartItemDB.user_id == current_user.id, CartItemDB.product_id == product_id)
        .first()
    )

    if item:
        db.delete(item)
        db.commit()

    return build_cart_response(db, current_user)


@app.delete("/cart/clear", response_model=CartRead)
def clear_cart_endpoint(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    db.query(CartItemDB).filter(CartItemDB.user_id == current_user.id).delete()
    db.commit()
    return CartRead(items=[], total=0.0)


# -------------------- FAVORITES --------------------
@app.get("/favorites", response_model=list[ProductRead])
def get_favorites(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return build_favorites_response(db, current_user)


@app.get("/favorites/ids", response_model=list[int])
def get_favorite_ids(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    rows = (
        db.query(FavoriteItemDB.product_id)
        .filter(FavoriteItemDB.user_id == current_user.id)
        .all()
    )
    return [row[0] for row in rows]


@app.post("/favorites/{product_id}", response_model=ProductRead)
def add_favorite(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu exista")

    existing = (
        db.query(FavoriteItemDB)
        .filter(FavoriteItemDB.user_id == current_user.id, FavoriteItemDB.product_id == product_id)
        .first()
    )

    if not existing:
        db.add(FavoriteItemDB(user_id=current_user.id, product_id=product_id))
        db.commit()

    return attach_product_rating_summary(product, db)


@app.delete("/favorites/{product_id}")
def delete_favorite(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    item = (
        db.query(FavoriteItemDB)
        .filter(FavoriteItemDB.user_id == current_user.id, FavoriteItemDB.product_id == product_id)
        .first()
    )

    if item:
        db.delete(item)
        db.commit()

    return {"ok": True}


# -------------------- WISHLIST --------------------
@app.get("/wishlist", response_model=list[ProductRead])
def get_wishlist(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return build_wishlist_response(db, current_user)


@app.get("/wishlist/ids", response_model=list[int])
def get_wishlist_ids(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    rows = (
        db.query(WishlistItemDB.product_id)
        .join(ProductDB, ProductDB.id == WishlistItemDB.product_id)
        .filter(
            WishlistItemDB.user_id == current_user.id,
            ProductDB.quantity <= 0,
        )
        .all()
    )
    return [row[0] for row in rows]


@app.post("/wishlist/{product_id}", response_model=ProductRead)
def add_to_wishlist(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    product = db.query(ProductDB).filter(ProductDB.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produsul nu exista")
    if product.quantity > 0:
        raise HTTPException(
            status_code=400,
            detail="Wishlist-ul este disponibil doar pentru produse cu stoc epuizat",
        )

    existing = (
        db.query(WishlistItemDB)
        .filter(
            WishlistItemDB.user_id == current_user.id,
            WishlistItemDB.product_id == product_id,
        )
        .first()
    )
    if not existing:
        db.add(
            WishlistItemDB(
                user_id=current_user.id,
                product_id=product_id,
                created_at=datetime.utcnow(),
            )
        )
        db.commit()

    return attach_product_rating_summary(product, db)


@app.delete("/wishlist/{product_id}")
def delete_from_wishlist(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    item = (
        db.query(WishlistItemDB)
        .filter(
            WishlistItemDB.user_id == current_user.id,
            WishlistItemDB.product_id == product_id,
        )
        .first()
    )
    if item:
        db.delete(item)
        db.commit()

    return {"ok": True}


# -------------------- ORDERS --------------------
@app.post("/orders", response_model=OrderRead)
def create_order(
    order: OrderCreate,
    db: Session = Depends(get_db),
    current_user: UserDB | None = Depends(get_optional_current_user),
):
    cart_items = []

    if current_user:
        cart_items = (
            db.query(CartItemDB)
            .options(joinedload(CartItemDB.product))
            .filter(CartItemDB.user_id == current_user.id)
            .all()
        )
    else:
        for item in order.items:
            product = db.query(ProductDB).filter(ProductDB.id == item.product_id).first()
            if product:
                cart_items.append(
                    type(
                        "GuestCartItem",
                        (),
                        {"product": product, "quantity": item.quantity},
                    )()
                )

    if not cart_items:
        raise HTTPException(status_code=400, detail="Cosul este gol")

    subtotal = 0.0
    order_items = []

    for item in cart_items:
        product = item.product

        if not product:
            continue

        if product.quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Stoc insuficient pentru produsul {product.name}",
            )

        discounted_price = get_discounted_price(product.price, getattr(product, "promotion", 0))
        line_total = discounted_price * item.quantity
        subtotal += line_total

        order_item = OrderItemDB(
            product_id=product.id,
            product_name=product.name,
            product_code=product.code,
            unit_price=discounted_price,
            quantity=item.quantity,
            line_total=line_total,
        )
        order_items.append(order_item)

        product.quantity -= item.quantity

    subtotal = round(subtotal, 2)
    voucher = None
    discount_amount = 0.0
    voucher_code = normalize_voucher_code(order.voucher_code)

    if voucher_code:
        if not current_user:
            raise HTTPException(
                status_code=401,
                detail="Trebuie sa fii autentificat pentru a folosi un voucher",
            )
        voucher = get_active_voucher_for_user(db, voucher_code, current_user.id)
        discount_amount = calculate_voucher_discount(voucher, subtotal)
        ensure_minimum_product_total(subtotal, discount_amount)
    else:
        ensure_minimum_product_total(subtotal)

    products_total = round(max(subtotal - discount_amount, 0), 2)
    total = round(products_total + SHIPPING_AMOUNT, 2)

    new_order = OrderDB(
        order_number=generate_order_number(),
        user_id=current_user.id if current_user else None,
        total=total,
        subtotal=subtotal,
        discount_amount=discount_amount,
        shipping_amount=SHIPPING_AMOUNT,
        voucher_id=voucher.id if voucher else None,
        voucher_code=voucher.code if voucher else None,
        created_at=datetime.utcnow(),
        status="trimisa",
        first_name=order.first_name,
        last_name=order.last_name,
        address=order.address,
        phone=order.phone,
        email=order.email,
        payment_method=order.payment_method,
    )

    db.add(new_order)
    db.flush()

    for oi in order_items:
        oi.order_id = new_order.id
        db.add(oi)

    if voucher and current_user:
        db.add(
            VoucherUsageDB(
                voucher_id=voucher.id,
                user_id=current_user.id,
                used_at=datetime.utcnow(),
            )
        )

    create_staff_order_notifications(db, new_order, datetime.utcnow())

    if current_user:
        db.query(CartItemDB).filter(CartItemDB.user_id == current_user.id).delete()
    db.commit()

    saved_order = (
        db.query(OrderDB)
        .options(joinedload(OrderDB.items), joinedload(OrderDB.user))
        .filter(OrderDB.id == new_order.id)
        .first()
    )

    return saved_order


@app.get("/orders/my", response_model=list[OrderRead])
def get_my_orders(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return (
        db.query(OrderDB)
        .options(joinedload(OrderDB.items), joinedload(OrderDB.user))
        .filter(OrderDB.user_id == current_user.id)
        .order_by(OrderDB.id.desc())
        .all()
    )


@app.get("/orders", response_model=list[OrderRead])
def get_all_orders(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    return (
        db.query(OrderDB)
        .options(joinedload(OrderDB.items), joinedload(OrderDB.user))
        .order_by(OrderDB.id.desc())
        .all()
    )


@app.get("/orders/{order_id}", response_model=OrderRead)
def get_order_by_id(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    order = (
        db.query(OrderDB)
        .options(joinedload(OrderDB.items), joinedload(OrderDB.user))
        .filter(OrderDB.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Comanda nu exista")

    is_staff = current_user.role in ["moderator", "admin"]
    is_owner = order.user_id == current_user.id

    if not is_staff and not is_owner:
        raise HTTPException(status_code=403, detail="Nu ai acces la aceasta comanda")

    return order


@app.patch("/orders/{order_id}/status", response_model=OrderRead)
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    if payload.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Status invalid")

    order = (
        db.query(OrderDB)
        .options(joinedload(OrderDB.items), joinedload(OrderDB.user))
        .filter(OrderDB.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Comanda nu exista")

    previous_status = order.status
    final_statuses = {"anulata", "livrata"}

    if previous_status in final_statuses and payload.status != previous_status:
        raise HTTPException(
            status_code=400,
            detail="Comanda are un status final si nu mai poate fi modificata",
        )

    if previous_status != "anulata" and payload.status == "anulata":
        for item in order.items:
            product = db.query(ProductDB).filter(ProductDB.id == item.product_id).first()
            if product:
                previous_quantity = product.quantity
                product.quantity += item.quantity
                notify_wishlist_users_if_restocked(db, product, previous_quantity)

    status_changed = previous_status != payload.status
    order.status = payload.status

    if status_changed:
        create_order_status_notification(db, order, payload.status, datetime.utcnow())
        mark_staff_order_notifications_read(db, order.id, datetime.utcnow())

    db.commit()
    db.refresh(order)
    return order


# -------------------- TICKETS --------------------
@app.get("/tickets/create-availability", response_model=TicketCreateAvailabilityRead)
def get_ticket_create_availability_endpoint(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return get_ticket_create_availability(db, current_user)


@app.post("/tickets", response_model=TicketDetailRead)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    availability = get_ticket_create_availability(db, current_user)
    if not availability.can_create:
        hours = availability.remaining_seconds // 3600
        minutes = (availability.remaining_seconds % 3600) // 60
        seconds = availability.remaining_seconds % 60
        raise HTTPException(
            status_code=400,
            detail=(
                "Poți deschide un nou tichet peste "
                f"{hours:02d}:{minutes:02d}:{seconds:02d}."
            ),
        )

    now = datetime.utcnow()
    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    ticket = TicketDB(
        ticket_number=generate_ticket_number(),
        user_id=current_user.id,
        category=payload.category,
        status="open",
        created_at=now,
        updated_at=now,
        last_message_at=now,
        assigned_to_user_id=None,
    )
    db.add(ticket)
    db.flush()

    message = TicketMessageDB(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=clean_message,
        created_at=now,
    )
    db.add(message)
    db.flush()

    owner_state = TicketReadStateDB(
        ticket_id=ticket.id,
        user_id=current_user.id,
        last_read_message_id=message.id,
    )
    db.add(owner_state)
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, current_user)


@app.get("/tickets/banned-support/status", response_model=BannedSupportStatusRead)
def get_banned_support_status(
    ban_token: str,
    db: Session = Depends(get_db),
):
    user = get_user_from_ban_token(db, ban_token)
    ticket = get_current_ban_ticket(db, user)

    return BannedSupportStatusRead(
        ticket=serialize_ticket_detail(ticket, user) if ticket else None,
        can_create=ticket is None,
        next_allowed_at=None,
    )


@app.post("/tickets/banned-support", response_model=TicketDetailRead)
def create_banned_support_ticket(
    payload: BannedTicketCreate,
    db: Session = Depends(get_db),
):
    user = get_user_from_ban_token(db, payload.ban_token)

    existing_ticket = get_current_ban_ticket(db, user)
    if existing_ticket:
        raise HTTPException(status_code=400, detail="Ai deja un tichet pentru suspendare.")

    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    now = datetime.utcnow()
    ticket = TicketDB(
        ticket_number=generate_ticket_number(),
        user_id=user.id,
        category="ban",
        ban_key=user.current_ban_key,
        status="open",
        created_at=now,
        updated_at=now,
        last_message_at=now,
        assigned_to_user_id=None,
    )
    db.add(ticket)
    db.flush()

    message = TicketMessageDB(
        ticket_id=ticket.id,
        sender_id=user.id,
        message=clean_message,
        created_at=now,
    )
    db.add(message)
    db.flush()

    owner_state = TicketReadStateDB(
        ticket_id=ticket.id,
        user_id=user.id,
        last_read_message_id=message.id,
    )
    db.add(owner_state)
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, user)


@app.get("/tickets/banned-support/{ticket_id}", response_model=TicketDetailRead)
def get_banned_support_ticket(
    ticket_id: int,
    ban_token: str,
    db: Session = Depends(get_db),
):
    user = get_user_from_ban_token(db, ban_token)
    ticket = get_ticket_or_404(ticket_id, db)
    if (
        ticket.user_id != user.id
        or ticket.category != "ban"
        or ticket.ban_key != user.current_ban_key
    ):
        raise HTTPException(status_code=403, detail="Nu ai acces la acest tichet")

    mark_ticket_as_read(ticket, user, db)
    refreshed_ticket = get_ticket_or_404(ticket_id, db)
    return serialize_ticket_detail(refreshed_ticket, user)


@app.post("/tickets/banned-support/{ticket_id}/messages", response_model=TicketDetailRead)
def add_banned_support_message(
    ticket_id: int,
    payload: BannedTicketCreate,
    db: Session = Depends(get_db),
):
    user = get_user_from_ban_token(db, payload.ban_token)
    ticket = get_ticket_or_404(ticket_id, db)
    if (
        ticket.user_id != user.id
        or ticket.category != "ban"
        or ticket.ban_key != user.current_ban_key
    ):
        raise HTTPException(status_code=403, detail="Nu ai acces la acest tichet")

    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Tichetul este inchis")

    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    now = datetime.utcnow()
    message = TicketMessageDB(
        ticket_id=ticket.id,
        sender_id=user.id,
        message=clean_message,
        created_at=now,
    )
    db.add(message)
    db.flush()

    ticket.updated_at = now
    ticket.last_message_at = now
    sender_state = get_or_create_read_state(ticket.id, user.id, db)
    sender_state.last_read_message_id = message.id
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, user)


@app.get("/tickets/my", response_model=list[TicketListRead])
def get_my_tickets(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    tickets = (
        db.query(TicketDB)
        .options(joinedload(TicketDB.user), joinedload(TicketDB.assigned_to_user))
        .filter(TicketDB.user_id == current_user.id)
        .order_by(TicketDB.last_message_at.desc(), TicketDB.id.desc())
        .all()
    )
    return [serialize_ticket_list(ticket, current_user, db) for ticket in tickets]


@app.get("/tickets", response_model=list[TicketListRead])
def get_all_tickets(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    tickets = (
        db.query(TicketDB)
        .options(joinedload(TicketDB.user), joinedload(TicketDB.assigned_to_user))
        .order_by(TicketDB.last_message_at.desc(), TicketDB.id.desc())
        .all()
    )
    return [serialize_ticket_list(ticket, current_user, db) for ticket in tickets]


@app.patch("/tickets/{ticket_id}/mark-read", response_model=TicketDetailRead)
def mark_ticket_read_for_staff(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    ticket = get_ticket_or_404(ticket_id, db)
    now = datetime.utcnow()
    latest_user_message = (
        db.query(TicketMessageDB)
        .filter(
            TicketMessageDB.ticket_id == ticket.id,
            ~TicketMessageDB.sender.has(UserDB.role.in_(["moderator", "admin"])),
        )
        .order_by(TicketMessageDB.id.desc())
        .first()
    )

    if latest_user_message:
        ticket.staff_last_read_message_id = latest_user_message.id

    mark_staff_ticket_notifications_read(db, ticket.id, now)
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, current_user)


@app.get("/tickets/unread-count", response_model=TicketUnreadCountRead)
def get_unread_ticket_count(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return TicketUnreadCountRead(count=count_unread_tickets_for_user(db, current_user))


# -------------------- NOTIFICATIONS --------------------
@app.get("/notifications", response_model=list[NotificationRead])
def get_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    query = db.query(NotificationDB).filter(NotificationDB.user_id == current_user.id)

    if unread_only:
        query = query.filter(NotificationDB.is_read == False)  # noqa: E712

    return query.order_by(NotificationDB.created_at.desc(), NotificationDB.id.desc()).all()


@app.get("/notifications/unread-count", response_model=NotificationCountRead)
def get_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    count = (
        db.query(NotificationDB)
        .filter(NotificationDB.user_id == current_user.id, NotificationDB.is_read == False)  # noqa: E712
        .count()
    )
    return NotificationCountRead(count=count)


@app.get("/dashboard/unread-count", response_model=DashboardUnreadCountRead)
def get_dashboard_unread_count(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    tickets = count_unread_tickets_for_user(db, current_user)
    orders = count_unread_staff_order_notifications(db, current_user)
    approvals = (
        db.query(UserDB)
        .filter(UserDB.role == "user", UserDB.approval_status == "pending")
        .count()
        if current_user.role == "admin"
        else 0
    )
    return DashboardUnreadCountRead(
        tickets=tickets,
        orders=orders,
        approvals=approvals,
        total=tickets + orders + approvals,
    )


@app.patch("/notifications/mark-read", response_model=NotificationCountRead)
def mark_notifications_read(
    payload: NotificationMarkReadPayload,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    now = datetime.utcnow()
    notifications = (
        db.query(NotificationDB)
        .filter(
            NotificationDB.user_id == current_user.id,
            NotificationDB.id.in_(payload.ids),
            NotificationDB.is_read == False,  # noqa: E712
        )
        .all()
    )

    for notification in notifications:
        notification.is_read = True
        notification.read_at = now

    db.commit()
    count = (
        db.query(NotificationDB)
        .filter(NotificationDB.user_id == current_user.id, NotificationDB.is_read == False)  # noqa: E712
        .count()
    )
    return NotificationCountRead(count=count)


@app.get("/tickets/assignable-users", response_model=list[AssignableStaffRead])
def get_assignable_users(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    return (
        db.query(UserDB)
        .filter(UserDB.role.in_(["moderator", "admin"]))
        .order_by(UserDB.role.asc(), UserDB.username.asc())
        .all()
    )


@app.get("/tickets/{ticket_id}", response_model=TicketDetailRead)
def get_ticket_detail(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    ticket = get_ticket_or_404(ticket_id, db)

    if not can_access_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Nu ai acces la acest tichet")

    if current_user.role not in ["moderator", "admin"]:
        mark_ticket_as_read(ticket, current_user, db)

    refreshed_ticket = get_ticket_or_404(ticket_id, db)
    return serialize_ticket_detail(refreshed_ticket, current_user)


@app.post("/tickets/{ticket_id}/messages", response_model=TicketDetailRead)
def add_ticket_message(
    ticket_id: int,
    payload: TicketMessageCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    ticket = get_ticket_or_404(ticket_id, db)

    if not can_access_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Nu ai acces la acest tichet")

    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Tichetul este inchis")

    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    now = datetime.utcnow()
    message = TicketMessageDB(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=clean_message,
        created_at=now,
    )
    db.add(message)
    db.flush()

    ticket.updated_at = now
    ticket.last_message_at = now

    if current_user.role in ["moderator", "admin"]:
        if ticket.assigned_to_user_id is not None:
            latest_user_message = (
                db.query(TicketMessageDB)
                .filter(
                    TicketMessageDB.ticket_id == ticket.id,
                    ~TicketMessageDB.sender.has(UserDB.role.in_(["moderator", "admin"])),
                )
                .order_by(TicketMessageDB.id.desc())
                .first()
            )
            if latest_user_message:
                ticket.staff_last_read_message_id = latest_user_message.id
        if ticket.user_id != current_user.id:
            create_ticket_reply_notification(db, ticket, ticket.user_id, now)
    else:
        sender_state = get_or_create_read_state(ticket.id, current_user.id, db)
        sender_state.last_read_message_id = message.id

        staff_users = (
            db.query(UserDB)
            .filter(UserDB.role.in_(["moderator", "admin"]))
            .all()
        )
        for staff_user in staff_users:
            create_ticket_reply_notification(db, ticket, staff_user.id, now)

    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, current_user)


@app.patch("/tickets/{ticket_id}/assign", response_model=TicketDetailRead)
def assign_ticket(
    ticket_id: int,
    payload: TicketAssignPayload,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    ticket = get_ticket_or_404(ticket_id, db)

    if ticket.status == "closed":
        raise HTTPException(
            status_code=400,
            detail="Tichetul este inchis. Redeschide tichetul inainte sa schimbi responsabilul.",
        )

    if payload.assigned_to_user_id is None:
        ticket.assigned_to_user_id = None
        ticket.updated_at = datetime.utcnow()
        db.commit()
        saved_ticket = get_ticket_or_404(ticket.id, db)
        return serialize_ticket_detail(saved_ticket, current_user)

    staff_user = (
        db.query(UserDB)
        .filter(
            UserDB.id == payload.assigned_to_user_id,
            UserDB.role.in_(["moderator", "admin"]),
        )
        .first()
    )

    if not staff_user:
        raise HTTPException(status_code=404, detail="Responsabilul selectat nu exista")

    ticket.assigned_to_user_id = staff_user.id
    ticket.updated_at = datetime.utcnow()
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, current_user)


@app.patch("/tickets/{ticket_id}/close", response_model=TicketDetailRead)
def close_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    ticket = get_ticket_or_404(ticket_id, db)
    now = datetime.utcnow()
    latest_user_message = (
        db.query(TicketMessageDB)
        .filter(
            TicketMessageDB.ticket_id == ticket.id,
            ~TicketMessageDB.sender.has(UserDB.role.in_(["moderator", "admin"])),
        )
        .order_by(TicketMessageDB.id.desc())
        .first()
    )

    ticket.status = "closed"
    ticket.updated_at = now
    if latest_user_message:
        ticket.staff_last_read_message_id = latest_user_message.id
    mark_staff_ticket_notifications_read(db, ticket.id, now)
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, current_user)


@app.patch("/tickets/{ticket_id}/reopen", response_model=TicketDetailRead)
def reopen_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_moderator_or_admin),
):
    ticket = get_ticket_or_404(ticket_id, db)
    now = datetime.utcnow()
    ticket.status = "open"
    ticket.updated_at = now
    db.commit()

    saved_ticket = get_ticket_or_404(ticket.id, db)
    return serialize_ticket_detail(saved_ticket, current_user)


@app.post("/assistant/chat", response_model=AssistantChatResponse)
def assistant_chat(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
    current_user: UserDB | None = Depends(get_optional_current_user),
):
    return handle_assistant_chat(
        payload=payload,
        db=db,
        current_user=current_user,
        build_cart_response=build_cart_response,
    )


@app.get("/assistant/conversations", response_model=list[FishbotConversationRead])
def get_fishbot_conversations(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    conversations = (
        db.query(FishbotConversationDB)
        .options(joinedload(FishbotConversationDB.messages))
        .filter(FishbotConversationDB.user_id == current_user.id)
        .order_by(
            FishbotConversationDB.ended_at.desc(),
            FishbotConversationDB.id.desc(),
        )
        .all()
    )
    return [serialize_fishbot_conversation(conversation) for conversation in conversations]


@app.post("/assistant/conversations", response_model=FishbotConversationRead)
def save_fishbot_conversation(
    payload: FishbotConversationArchiveCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    messages = [
        message
        for message in payload.messages
        if message.text and message.text.strip()
    ]
    if not messages:
        raise HTTPException(status_code=400, detail="Conversatia nu contine mesaje")

    first_user_message = next(
        (message for message in messages if message.sender == "user"),
        None,
    )
    if not first_user_message:
        raise HTTPException(status_code=400, detail="Conversatia nu contine mesaje de la user")

    created_at = payload.created_at or messages[0].created_at or datetime.utcnow()
    ended_at = payload.ended_at or messages[-1].created_at or created_at
    title = (payload.title or first_user_message.text or "Conversatie FishBot").strip()
    title = title[:120]

    conversation = None
    client_key = payload.client_key.strip()[:120] if payload.client_key else None
    if client_key:
        conversation = (
            db.query(FishbotConversationDB)
            .filter(
                FishbotConversationDB.user_id == current_user.id,
                FishbotConversationDB.client_key == client_key,
            )
            .first()
        )

    if conversation:
        conversation.title = title
        conversation.created_at = created_at
        conversation.ended_at = ended_at
        db.query(FishbotMessageDB).filter(
            FishbotMessageDB.conversation_id == conversation.id
        ).delete()
    else:
        conversation = FishbotConversationDB(
            user_id=current_user.id,
            client_key=client_key,
            title=title,
            created_at=created_at,
            ended_at=ended_at,
        )
        db.add(conversation)
        db.flush()

    for message in messages:
        products_json = None
        if message.products:
            products_json = json.dumps(
                [
                    product.model_dump()
                    if hasattr(product, "model_dump")
                    else product.dict()
                    for product in message.products
                ],
                ensure_ascii=False,
            )

        db.add(
            FishbotMessageDB(
                conversation_id=conversation.id,
                sender=message.sender,
                message=message.text.strip(),
                products_json=products_json,
                created_at=message.created_at or created_at,
            )
        )

    db.commit()

    saved = (
        db.query(FishbotConversationDB)
        .options(joinedload(FishbotConversationDB.messages))
        .filter(FishbotConversationDB.id == conversation.id)
        .first()
    )
    return serialize_fishbot_conversation(saved)
