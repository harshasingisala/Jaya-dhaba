import uuid
from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table as SqlTable,
    Text,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="customer")  # owner, manager, staff, customer
    loyalty_points: Mapped[int] = mapped_column(Integer, default=0)
    
    # Auth Hardening
    mfa_secret: Mapped[str] = mapped_column(String(32), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    refresh_token_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Metadata for Layer 5
    ip_address: Mapped[str] = mapped_column(String(45))
    user_agent: Mapped[str] = mapped_column(Text)
    device_fingerprint: Mapped[str] = mapped_column(String(255))
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="sessions")


class MenuCategory(Base):
    __tablename__ = "menu_categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # GST Logic
    cgst_rate: Mapped[float] = mapped_column(Float, default=2.5)  # Percentage
    sgst_rate: Mapped[float] = mapped_column(Float, default=2.5)  # Percentage

    items = relationship("MenuItem", back_populates="category")


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_categories.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(Integer)  # In rupees
    image_url: Mapped[str] = mapped_column(String(500), default="")
    dietary_tags: Mapped[list] = mapped_column(JSON, default=list)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Detailed Info
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    chef_note: Mapped[str] = mapped_column(Text, default="")
    spice_level: Mapped[int] = mapped_column(Integer, default=0)
    calories: Mapped[int] = mapped_column(Integer, default=0)
    protein_g: Mapped[float] = mapped_column(Float, default=0.0)
    carbs_g: Mapped[float] = mapped_column(Float, default=0.0)
    fat_g: Mapped[float] = mapped_column(Float, default=0.0)
    model_url: Mapped[str] = mapped_column(String(500), default="")
    video_url: Mapped[str] = mapped_column(String(500), default="")
    pairing_ids: Mapped[list] = mapped_column(JSON, default=list)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    category = relationship("MenuCategory", back_populates="items")
    inventory = relationship("InventoryItem", back_populates="menu_item")


class RestaurantTable(Base):
    __tablename__ = "tables"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    qr_token: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(50))
    capacity: Mapped[int] = mapped_column(Integer, default=4)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    @property
    def table_number(self) -> str:
        return self.label

    @table_number.setter
    def table_number(self, value: str) -> None:
        self.label = value


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_number: Mapped[int] = mapped_column(Integer, unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    table_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tables.id"), nullable=True)  # Optional for online/delivery orders
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, confirmed, preparing, ready, served, cancelled
    prep_stage: Mapped[str] = mapped_column(String(20), default="placed") # placed, prepping, plating, served
    occasion: Mapped[str] = mapped_column(String(50), default="") # birthday, anniversary, etc.
    
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True)
    version: Mapped[int] = mapped_column(Integer, default=1)  # Optimistic Locking
    
    # Financials (in rupees)
    subtotal: Mapped[int] = mapped_column(Integer)
    tax: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    loyalty_discount: Mapped[int] = mapped_column(Integer, default=0)
    
    # Guest Info (if not logged in)
    guest_name: Mapped[str] = mapped_column(String(100), default="")
    guest_phone: Mapped[str] = mapped_column(String(20), default="")
    
    public_token_hash: Mapped[str] = mapped_column(String(255))
    order_type: Mapped[str] = mapped_column(String(20), default="dine_in")  # dine_in, pickup, delivery
    source: Mapped[str] = mapped_column(String(20), default="customer")
    payment_method: Mapped[str] = mapped_column(String(20), default="")
    pickup_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    status_history: Mapped[list] = mapped_column(JSON, default=list)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    preparing_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    served_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship(back_populates="orders")
    table = relationship("RestaurantTable")
    items: Mapped[List["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order")

    def to_dict(self):
        return {
            "id": str(self.id),
            "order_number": self.order_number,
            "status": self.status,
            "is_archived": bool(self.is_archived),
            "subtotal": int(self.subtotal or 0),
            "tax": int(self.tax or 0),
            "total": int(self.total or 0),
            "items": [
                {
                    "name": item.menu_item.name if item.menu_item else "",
                    "qty": item.qty,
                    "unit_price": item.unit_price,
                    "special_note": item.special_note,
                }
                for item in self.items
            ],
            "customer_name": self.guest_name,
            "customer_phone": self.guest_phone,
            "guest_name": self.guest_name,
            "guest_phone": self.guest_phone,
            "order_type": self.order_type,
            "source": self.source,
            "payment_method": self.payment_method,
            "table_id": str(self.table_id) if self.table_id else None,
            "table_label": self.table.label if self.table else None,
            "table": self.table.label if self.table else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "preparing_at": self.preparing_at.isoformat() if self.preparing_at else None,
            "served_at": self.served_at.isoformat() if self.served_at else None,
            "archived_at": self.archived_at.isoformat() if self.archived_at else None,
        }


class OrderNumberCounter(Base):
    __tablename__ = "order_number_counter"

    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    menu_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.id"))
    qty: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    special_note: Mapped[str] = mapped_column(Text, default="")
    is_addon: Mapped[bool] = mapped_column(Boolean, default=False)
    addon_added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), unique=True)
    
    # Gateway specific
    razorpay_payment_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=True)
    razorpay_order_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=True)
    stripe_payment_intent_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=True)
    stripe_event_id: Mapped[str] = mapped_column(String(100), nullable=True)
    
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, completed, failed, refunded
    failure_reason: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order: Mapped["Order"] = relationship(back_populates="payment")


class LoyaltyLedger(Base):
    __tablename__ = "loyalty_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"))
    delta: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(100)) # earn, redeem, adjust
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    menu_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.id"), unique=True)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    reorder_level: Mapped[float] = mapped_column(Float, default=10.0)
    unit: Mapped[str] = mapped_column(String(20), default="units") # units, kg, ltr
    
    menu_item = relationship("MenuItem", back_populates="inventory")


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory_items.id"))
    delta: Mapped[float] = mapped_column(Float)
    type: Mapped[str] = mapped_column(String(20))  # addition, deduction, correction
    reason: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    # Request Info
    ip_address: Mapped[str] = mapped_column(String(45))
    user_agent: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20))  # percentage, fixed
    value: Mapped[int] = mapped_column(Integer)
    min_order_value: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    usage_limit: Mapped[int] = mapped_column(Integer)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    table_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tables.id"))
    party_size: Mapped[int] = mapped_column(Integer)
    reserved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=120)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, confirmed, cancelled
    guest_name: Mapped[str] = mapped_column(String(120))
    guest_phone: Mapped[str] = mapped_column(String(40))
    celebration_type: Mapped[str] = mapped_column(String(50))
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True)
    request_hash: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DishRating(Base):
    __tablename__ = "dish_ratings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"))
    menu_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int] = mapped_column(Integer)  # 1-5
    comment: Mapped[str] = mapped_column(Text)
    photo_url: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Voucher(Base):
    __tablename__ = "vouchers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    initial_value: Mapped[int] = mapped_column(Integer)
    current_value: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    referrer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    referral_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Optional fields for reward tracking
    reward_card_id: Mapped[str] = mapped_column(String(100), unique=True)
    reward_type: Mapped[str] = mapped_column(String(50))
    reward_claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    reward_redeemed: Mapped[bool] = mapped_column(Boolean, default=False)
    redeemed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    redeemed_by_admin: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)


class SiteSetting(Base):
    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PricingRule(Base):
    __tablename__ = "pricing_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    days_of_week: Mapped[list] = mapped_column(JSON, default=list) # [0,1,2,3,4,5,6]
    start_time: Mapped[str] = mapped_column(String(10)) # "HH:MM"
    end_time: Mapped[str] = mapped_column(String(10)) # "HH:MM"
    discount_type: Mapped[str] = mapped_column(String(20)) # percentage, fixed
    discount_value: Mapped[int] = mapped_column(Integer)
    applies_to: Mapped[str] = mapped_column(String(20)) # all, category, item
    applies_to_ids: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PairingRule(Base):
    __tablename__ = "pairing_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trigger_item_id: Mapped[int] = mapped_column(Integer)
    trigger_category: Mapped[str] = mapped_column(String(100))
    suggested_item_ids: Mapped[list] = mapped_column(JSON, default=list)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(Integer, index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ChatLog(Base):
    __tablename__ = "chat_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    session_id: Mapped[str] = mapped_column(String(120), index=True)
    role: Mapped[str] = mapped_column(String(20)) # user, assistant
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DailyClosure(Base):
    __tablename__ = "daily_closures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    revenue: Mapped[int] = mapped_column(Integer, default=0)
    orders: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
