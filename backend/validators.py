from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Type, TypeVar, Union

from flask import request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError as PydanticValidationError, field_validator, model_validator


T = TypeVar("T", bound=BaseModel)


class ValidationError(Exception):
    def __init__(self, message: str, field: str | None = None, status: int = 400):
        super().__init__(message)
        self.message = message
        self.field = field
        self.status = status


def validate_schema(schema: Type[T], data: Optional[Dict[str, Any]] = None) -> T:
    if data is None:
        data = request.get_json(silent=True)
        if data is None:
            raise ValidationError("Request body must be valid JSON")
    
    try:
        return schema.model_validate(data)
    except PydanticValidationError as e:
        # Standardize the first error
        error = e.errors()[0]
        field = " -> ".join(str(p) for p in error["loc"])
        message = error["msg"]
        raise ValidationError(f"{field}: {message}", field=field)


# Common Schemas

class LoginSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    mfa_code: Optional[str] = Field(None, min_length=6, max_length=6)

    @field_validator("login")
    @classmethod
    def normalize_login(cls, value: str) -> str:
        value = value.strip().lower()
        if "\x00" in value:
            raise ValueError("Invalid characters")
        return value

    @field_validator("password")
    @classmethod
    def reject_password_nulls(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("Invalid characters")
        return value


class RegisterSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, pattern=r"^(?:\+91)?[6-9][0-9]{9}$")
    password: str = Field(..., min_length=10)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return value.lower().strip() if value else value

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return re.sub(r"[\s-]", "", value.strip())

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if not re.search(r"[A-Z]", value):
            raise ValueError("Password must include an uppercase letter")
        if not re.search(r"[a-z]", value):
            raise ValueError("Password must include a lowercase letter")
        if not re.search(r"\d", value):
            raise ValueError("Password must include a number")
        return value

    @model_validator(mode="after")
    def validate_one_of(self):
        if not self.email and not self.phone:
            raise ValueError("Either email or phone must be provided")
        return self


def sanitize_html(text: str) -> str:
    return html.escape(text, quote=True)


def clean_text(text: str) -> str:
    # Remove control characters
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text).strip()
    # Normalize whitespace
    cleaned = re.sub(r"[ \t\r\n]+", " ", cleaned)
    return sanitize_html(cleaned)


def body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        raise ValidationError("Heritage request body missing or invalid JSON")
    return data


def integer(v: Any, name: str, min_val: Optional[int] = None, max_val: Optional[int] = None, required: bool = True) -> int:
    if v is None:
        if required:
            raise ValidationError(f"{name} is required", name)
        return 0
    try:
        val = int(v)
        if min_val is not None and val < min_val:
            raise ValidationError(f"{name} too low", name)
        if max_val is not None and val > max_val:
            raise ValidationError(f"{name} too high", name)
        return val
    except (ValueError, TypeError):
        raise ValidationError(f"{name} must be an integer", name)


def raw_text(v: Any, name: str, max_length: int = 500, required: bool = True, allow_empty: bool = False) -> str:
    if v is None:
        if required:
            raise ValidationError(f"{name} is required", name)
        return ""
    text = str(v).strip()
    if not text and not allow_empty:
        raise ValidationError(f"{name} cannot be empty", name)
    if len(text) > max_length:
        raise ValidationError(f"{name} exceeds length limit", name)
    return clean_text(text)


def boolean(v: Any, name: str, required: bool = True) -> bool:
    if v is None:
        if required:
            raise ValidationError(f"{name} is required", name)
        return False
    return bool(v)


def email(v: Any, name: str = "email", required: bool = True) -> str:
    if v is None:
        if required:
            raise ValidationError(f"{name} is required", name)
        return ""
    from email_validator import validate_email, EmailNotValidError
    try:
        email_info = validate_email(str(v), check_deliverability=False)
        return email_info.normalized
    except EmailNotValidError:
        raise ValidationError(f"Invalid {name}", name)


def phone(v: Any, name: str = "phone", required: bool = True) -> str:
    if v is None:
        if required:
            raise ValidationError(f"{name} is required", name)
        return ""
    p = str(v).strip()
    if not re.match(r"^\+?[0-9\s-]{10,20}$", p):
        raise ValidationError(f"Invalid {name} format", name)
    return p


def idempotency_key(v: Any) -> str:
    if not v:
        raise ValidationError("Idempotency-Key header required")
    return str(v).strip()


def request_hash(v: Any) -> str:
    return str(v).strip()


def reject_unknown(data: dict, allowed: set):
    unknown = set(data.keys()) - allowed
    if unknown:
        raise ValidationError(f"Unknown fields: {', '.join(unknown)}")


def tags(v: Any, name: str = "tags", required: bool = True) -> list:
    if v is None:
        if required:
            raise ValidationError(f"{name} is required", name)
        return []
    if not isinstance(v, list):
        raise ValidationError(f"{name} must be a list", name)
    return [clean_text(str(x)) for x in v[:20]]


def url(v: Any, name: str, required: bool = True) -> str:
    if not v:
        if required:
            raise ValidationError(f"{name} is required", name)
        return ""
    u = str(v).strip()
    if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", u):
        raise ValidationError(f"Invalid {name} URL", name)
    return u


def iso_datetime(v: Any, name: str, required: bool = True) -> datetime:
    if not v:
        if required:
            raise ValidationError(f"{name} is required", name)
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise ValidationError(f"Invalid {name} format (ISO required)", name)
