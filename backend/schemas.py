from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, Literal
from datetime import date, datetime


ProductCategory = Literal[
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
]

TicketCategory = Literal[
    "comanda",
    "produs",
    "plata",
    "livrare",
    "ban",
    "alta",
]

TicketStatus = Literal["open", "closed"]

OrderStatus = Literal["trimisa", "confirmata", "in_tranzit", "livrata", "anulata"]


class ProductCreate(BaseModel):
    code: str = Field(..., min_length=1)
    name: str
    category: ProductCategory
    price: float
    quantity: int = 0
    promotion: int = 0
    description: str | None = None
    tech_details: str | None = None
    video_url: str | None = None


class ProductRead(BaseModel):
    id: int
    code: str
    name: str
    category: ProductCategory
    price: float
    quantity: int
    promotion: int = 0
    description: str | None = None
    tech_details: str | None = None
    video_url: str | None = None
    average_rating: float = 0.0
    review_count: int = 0

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str
    approval_status: Literal["pending", "approved", "rejected"] = "approved"
    approval_updated_at: datetime | None = None
    ban_until: datetime | None = None
    ban_permanent: bool = False
    ban_reason: str | None = None
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    county: str | None = None
    postal_code: str | None = None
    profile_image_url: str | None = None
    is_online: bool = False
    presence_status: Literal["online", "idle", "offline"] = "offline"

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    county: str | None = None
    postal_code: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)


class PresenceUpdate(BaseModel):
    visible: bool = True


class Token(BaseModel):
    access_token: str
    token_type: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserBanUpdate(BaseModel):
    ban_type: Literal["none", "2m", "1h", "12h", "24h", "permanent"]
    reason: str | None = None


class UserRoleUpdate(BaseModel):
    role: Literal["user", "moderator"]


class UserApprovalUpdate(BaseModel):
    action: Literal["approve", "reject"]


VoucherUsageType = Literal["single_use", "unlimited"]
VoucherDiscountType = Literal["fixed", "percent"]


class VoucherCreate(BaseModel):
    discount_type: VoucherDiscountType = "fixed"
    amount: float = Field(..., gt=0)
    expires_on: date
    usage_type: VoucherUsageType

    @field_validator("amount")
    @classmethod
    def validate_amount_for_discount_type(cls, value: float, info):
        discount_type = info.data.get("discount_type", "fixed")
        if discount_type == "percent" and int(value) not in {10, 20, 30, 40, 50}:
            raise ValueError("Procentul voucherului trebuie sa fie 10, 20, 30, 40 sau 50")
        return value


class VoucherRead(BaseModel):
    id: int
    code: str
    amount: float
    discount_type: VoucherDiscountType = "fixed"
    usage_type: VoucherUsageType
    created_at: datetime | None = None
    expires_at: datetime | None = None
    cancelled_at: datetime | None = None
    status: str = "nefolosit"
    is_valid: bool = True
    usage_count: int = 0

    class Config:
        from_attributes = True


class VoucherApplyRequest(BaseModel):
    code: str = Field(..., min_length=1)


class VoucherApplyResponse(BaseModel):
    code: str
    amount: float
    discount_type: VoucherDiscountType = "fixed"
    discount_amount: float
    subtotal: float
    shipping_amount: float
    total: float
    usage_type: VoucherUsageType
    expires_at: datetime | None = None


class BannedTicketCreate(BaseModel):
    ban_token: str
    category: TicketCategory = "ban"
    message: str = Field(..., min_length=1)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[ProductCategory] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    promotion: Optional[int] = None
    description: Optional[str] = None
    tech_details: Optional[str] = None
    video_url: Optional[str] = None


class OrderCreateItem(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1)


class OrderCreate(BaseModel):
    first_name: str
    last_name: str
    address: str
    phone: str
    email: str
    payment_method: Literal["card", "ramburs"]
    voucher_code: str | None = None
    items: list[OrderCreateItem] = []


class OrderItemRead(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_code: str
    unit_price: float
    quantity: int
    line_total: float

    class Config:
        from_attributes = True


class OrderRead(BaseModel):
    id: int
    order_number: str
    user_id: int | None = None
    total: float
    subtotal: float = 0
    discount_amount: float = 0
    shipping_amount: float = 0
    voucher_code: str | None = None
    status: OrderStatus
    created_at: datetime | None = None

    first_name: str | None = None
    last_name: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    payment_method: str | None = None

    user: UserRead | None = None
    items: list[OrderItemRead]

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class CartItemAdd(BaseModel):
    product_id: int
    quantity: int = 1


class CartItemUpdate(BaseModel):
    quantity: int


class CartItemRead(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_code: str
    unit_price: float
    quantity: int
    stock: int
    image_url: str | None = None
    unavailable: bool

    class Config:
        from_attributes = True


class CartRead(BaseModel):
    items: list[CartItemRead]
    total: float


class ReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class ReviewRead(BaseModel):
    id: int
    product_id: int
    user_id: int
    username: str
    rating: int
    comment: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_mine: bool = False


class ProductReviewsRead(BaseModel):
    average_rating: float
    total_reviews: int
    has_purchased: bool
    can_review: bool
    reviews: list[ReviewRead]


class TicketCreate(BaseModel):
    category: TicketCategory
    message: str = Field(..., min_length=1)


class TicketMessageCreate(BaseModel):
    message: str = Field(..., min_length=1)


class TicketMessageRead(BaseModel):
    id: int
    ticket_id: int
    sender_id: int
    sender_username: str
    sender_role: str
    sender_profile_image_url: str | None = None
    message: str
    created_at: datetime | None = None


class TicketListRead(BaseModel):
    id: int
    ticket_number: str
    user_id: int
    username: str
    category: str
    status: TicketStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_message_at: datetime | None = None
    has_unread: bool = False
    unread_kind: str | None = None
    assigned_to_user_id: int | None = None
    assigned_to_username: str | None = None


class TicketDetailRead(BaseModel):
    id: int
    ticket_number: str
    user_id: int
    username: str
    category: str
    status: TicketStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_message_at: datetime | None = None
    assigned_to_user_id: int | None = None
    assigned_to_username: str | None = None
    messages: list[TicketMessageRead]


class BannedSupportStatusRead(BaseModel):
    ticket: TicketDetailRead | None = None
    can_create: bool = True
    next_allowed_at: datetime | None = None


class TicketUnreadCountRead(BaseModel):
    count: int


class NotificationRead(BaseModel):
    id: int
    user_id: int
    ticket_id: int | None = None
    order_id: int | None = None
    notification_type: str = "general"
    message: str
    created_at: datetime | None = None
    is_read: bool = False
    read_at: datetime | None = None

    class Config:
        from_attributes = True


class NotificationCountRead(BaseModel):
    count: int


class DashboardUnreadCountRead(BaseModel):
    tickets: int
    orders: int
    approvals: int = 0
    total: int


class NotificationMarkReadPayload(BaseModel):
    ids: list[int]


class ManualNotificationCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)


class LoginLogRead(BaseModel):
    id: int
    user_id: int
    ip_address: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class TicketAssignPayload(BaseModel):
    assigned_to_user_id: int | None = None


class AssignableStaffRead(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True


class TicketCreateAvailabilityRead(BaseModel):
    can_create: bool
    remaining_seconds: int
    next_allowed_at: datetime | None = None


class AssistantContextProduct(BaseModel):
    id: int
    name: str
    category: str
    price: float
    discounted_price: float
    promotion: int = 0
    image_url: str | None = None


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context_products: list[AssistantContextProduct] = []
    focused_product: AssistantContextProduct | None = None


class AssistantProductSuggestion(BaseModel):
    id: int
    name: str
    category: str
    price: float
    discounted_price: float
    promotion: int = 0
    image_url: str | None = None

    class Config:
        from_attributes = True


class AssistantChatResponse(BaseModel):
    reply: str
    intent: str
    requires_login: bool = False
    suggestions: list[str] = []
    products: list[AssistantProductSuggestion] = []


class FishbotMessageArchiveCreate(BaseModel):
    sender: str
    text: str
    created_at: datetime | None = None
    products: list[AssistantProductSuggestion] = []


class FishbotConversationArchiveCreate(BaseModel):
    client_key: str | None = None
    title: str | None = None
    created_at: datetime | None = None
    ended_at: datetime | None = None
    messages: list[FishbotMessageArchiveCreate]


class FishbotMessageRead(BaseModel):
    id: int
    sender: str
    text: str
    created_at: datetime | None = None
    products: list[AssistantProductSuggestion] = []


class FishbotConversationRead(BaseModel):
    id: int
    client_key: str | None = None
    title: str
    created_at: datetime | None = None
    ended_at: datetime | None = None
    messages: list[FishbotMessageRead] = []
