from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional, Union
from pydantic import BaseModel, Field, EmailStr, conint, validator

# --- Auth ---
class LoginRequest(BaseModel):
    login: str
    password: str
    mfa_code: Optional[str] = None

class RegisterRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[0-9][0-9\s-]{7,14}$")
    password: str = Field(..., min_length=10)

# --- Menu ---
class MenuItemCreate(BaseModel):
    category_id: uuid.UUID
    name: str = Field(..., min_length=2, max_length=100)
    description: str = ""
    price: int = Field(..., gt=0) # In rupees
    image_url: str = ""
    dietary_tags: List[str] = []
    available: bool = True
    spice_level: int = Field(0, ge=0, le=5)

class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    available: Optional[bool] = None
    image_url: Optional[str] = None
    dietary_tags: Optional[List[str]] = None

# --- Orders ---
class OrderItemRequest(BaseModel):
    menu_item_id: uuid.UUID
    qty: int = Field(..., gt=0, le=99)
    special_note: str = ""

class OrderCreate(BaseModel):
    table_id: Optional[uuid.UUID] = None  # Optional for online/delivery orders
    items: List[OrderItemRequest] = Field(..., min_items=1)
    order_type: str = Field("dine_in", pattern="^(dine_in|pickup|delivery)$")
    guest_name: Optional[str] = ""
    guest_phone: Optional[str] = ""
    pickup_time: Optional[datetime] = None
    loyalty_points_to_redeem: int = 0

class OrderStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|confirmed|preparing|ready|served|cancelled)$")
    reason: Optional[str] = None

# --- Reservations ---
class ReservationCreate(BaseModel):
    table_id: uuid.UUID
    party_size: int = Field(..., gt=0, le=50)
    reserved_at: datetime
    duration_minutes: int = Field(120, ge=30, le=300)
    guest_name: str
    guest_phone: str
    celebration_type: Optional[str] = None

# --- Inventory ---
class InventoryUpdate(BaseModel):
    menu_item_id: conint(gt=0)
    delta: float
    reason: str

# --- Staff ---
class StaffCreate(BaseModel):
    email: EmailStr
    phone: str
    password: str = Field(..., min_length=10)
    role: str = Field("staff", pattern="^(staff|manager)$")

class ShiftRecord(BaseModel):
    staff_id: uuid.UUID
    action: str = Field(..., pattern="^(clock_in|clock_out)$")
    timestamp: Optional[datetime] = None

# --- Settings ---
class GSTSettingsUpdate(BaseModel):
    category_id: uuid.UUID
    cgst_rate: float = Field(..., ge=0, le=30)
    sgst_rate: float = Field(..., ge=0, le=30)
