import os
import sys
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("FLASK_SECRET_KEY", "f" * 80)
os.environ.setdefault("JWT_SECRET_KEY", "j" * 80)
os.environ.setdefault("DB_ENCRYPTION_KEY", "u-37XjK9_XyU_XyU_XyU_XyU_XyU_XyU_XyU_XyU=")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db
from models import Base, User, MenuCategory, MenuItem, RestaurantTable
from app import create_app
from utils.crypto import hash_password

@pytest.fixture
def app():
    db_dir = Path.cwd() / ".test-dbs"
    db_dir.mkdir(exist_ok=True)
    db_path = db_dir / f"{uuid.uuid4().hex}.sqlite3"
    db_url = f"sqlite:///{db_path}"
    
    test_app = create_app({
        "TESTING": True,
        "DATABASE_URL": db_url,
        "RAZORPAY_KEY_ID": "test_razorpay_key_id",
        "RAZORPAY_KEY_SECRET": "test-razorpay-secret",
        "RAZORPAY_WEBHOOK_SECRET": "test-webhook-secret",
    })
    
    with test_app.app_context():
        # Initialize database
        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        
        # Seed basic data
        Session = sessionmaker(bind=engine)
        session = Session()
        
        # Admin user
        admin = User(
            email="admin@example.com",
            password_hash=hash_password("AdminPass123!"),
            role="owner"
        )
        session.add(admin)
        
        # Category & Item
        cat = MenuCategory(name="Mains", cgst_rate=2.5, sgst_rate=2.5)
        session.add(cat)
        session.flush()
        
        item = MenuItem(
            category_id=cat.id,
            name="Biryani",
            price=500,
            available=True
        )
        session.add(item)
        
        # Table
        table = RestaurantTable(table_number="T1", qr_token="test-table", active=True)
        session.add(table)
        
        session.commit()
        session.close()
        engine.dispose()

    yield test_app
    
    db.engine.dispose()
    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            pass

@pytest.fixture
def client(app):
    return app.test_client()

def get_csrf(client):
    resp = client.get("/api/csrf-token")
    return resp.get_json()["data"]["csrfToken"]

def csrf_headers(client):
    return {"X-CSRF-Token": get_csrf(client)}


def auth_headers(client, email="admin@example.com", password="AdminPass123!", extra=None):
    csrf = get_csrf(client)
    resp = client.post("/api/auth/login", 
                      json={"login": email, "password": password},
                      headers={"X-CSRF-Token": csrf})
    data = resp.get_json()["data"]
    headers = {
        "Authorization": f"Bearer {data['access_token']}",
        "X-CSRF-Token": csrf
    }
    if extra:
        headers.update(extra)
    return headers


@pytest.fixture
def admin_headers(client):
    return auth_headers(client)


@pytest.fixture
def seeded_menu(app):
    with db.get_db() as session:
        table = session.execute(select(RestaurantTable).filter_by(active=True)).scalar_one()
        item = session.execute(select(MenuItem).filter_by(available=True)).scalar_one()
        return table.qr_token, str(item.id)


def order_payload(client, loyalty_points=0):
    with db.get_db() as session:
        item = session.execute(select(MenuItem).filter_by(available=True)).scalar_one()
        item_id = str(item.id)
    payload = {
        "table_token": "test-table",
        "guest_name": "Test Guest",
        "items": [{"menu_item_id": item_id, "qty": 1}],
        "order_type": "dine_in",
    }
    if loyalty_points:
        payload["loyalty_points_to_redeem"] = loyalty_points
    return payload


def create_order(client, key=None):
    key = key or uuid.uuid4().hex
    resp = client.post(
        "/api/orders",
        json=order_payload(client),
        headers=auth_headers(client, extra={"Idempotency-Key": key}),
    )
    assert resp.status_code in (200, 201), resp.get_data(as_text=True)
    return resp.get_json()
