import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool

from models import Base, User, MenuCategory, RestaurantTable, MenuItem
from utils.encryption import Encryptor
from utils.crypto import hash_password

# Constants for status/roles
ORDER_STATUSES = ("pending", "confirmed", "preparing", "ready", "served", "cancelled")
PAYMENT_STATUSES = ("pending", "completed", "failed", "refunded")
RESERVATION_STATUSES = ("pending", "confirmed", "cancelled")
ROLES = ("customer", "staff", "manager", "owner")
SERVICE_TYPES = ("dine_in", "pickup", "delivery")

# Encryption setup
ENCRYPTION_KEY = os.getenv("DB_ENCRYPTION_KEY", "development-encryption-key-32bytes!!")
encryptor = Encryptor(ENCRYPTION_KEY)

# Database Engine Setup
DATABASE_URL = os.getenv("DATABASE_URL") or (
    "sqlite:///restaurant.db" if os.getenv("FLASK_ENV") == "testing" else ""
)
engine = None
SessionLocal = None
db_session = None


def configure(database_url: str):
    global DATABASE_URL, engine, SessionLocal, db_session
    DATABASE_URL = database_url
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required; production must use Supabase Postgres")
    app_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    if app_env not in {"development", "dev", "local", "test", "testing"} and DATABASE_URL.startswith("sqlite"):
        raise RuntimeError("SQLite is forbidden outside tests; set DATABASE_URL to Supabase Postgres")
    if DATABASE_URL.startswith("postgresql"):
        postgres_pool_size = 10 if app_env == "production" else 20
        postgres_max_overflow = 5 if app_env == "production" else 40
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=postgres_pool_size,
            max_overflow=postgres_max_overflow,
            pool_timeout=30,
        )
    else:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=1,
            max_overflow=0,
            pool_timeout=30,
            poolclass=QueuePool,
            connect_args={"check_same_thread": False, "timeout": 30},
        )

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db_session = scoped_session(SessionLocal)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_user(conn, *, email: str, phone: str | None, password: str, role: str = "customer"):
    user_id = uuid.uuid4().hex
    conn.execute(
        """
        INSERT INTO users (id, email, phone, password_hash, role, loyalty_points, mfa_enabled,
                           login_attempts, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)
        """,
        (user_id, email, phone, hash_password(password), role, utc_now()),
    )
    return user_id


@contextmanager
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(seed: bool = True):
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_compatibility()
    _ensure_settings_schema()
    _ensure_order_lifecycle_schema()
    _ensure_contact_submissions_schema()
    _ensure_order_number_counter()
    if engine.dialect.name == "postgresql":
        return
    if seed:
        seed_db()


def _ensure_order_number_counter():
    with engine.begin() as conn:
        max_order_number = conn.execute(text("SELECT COALESCE(MAX(order_number), 0) FROM orders")).scalar() or 0
        if engine.dialect.name == "postgresql":
            conn.execute(
                text(
                    """
                    INSERT INTO order_number_counter (name, next_value)
                    VALUES ('orders', :next_value)
                    ON CONFLICT (name) DO UPDATE
                    SET next_value = GREATEST(order_number_counter.next_value, EXCLUDED.next_value)
                    """
                ),
                {"next_value": int(max_order_number) + 1},
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO order_number_counter (name, next_value)
                    VALUES ('orders', :next_value)
                    ON CONFLICT(name) DO UPDATE
                    SET next_value = MAX(order_number_counter.next_value, excluded.next_value)
                    """
                ),
                {"next_value": int(max_order_number) + 1},
            )


def _ensure_contact_submissions_schema():
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS contact_submissions (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(200) NOT NULL,
                    phone VARCHAR(20),
                    subject VARCHAR(200),
                    message TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    is_read BOOLEAN DEFAULT FALSE
                )
            """))
            return

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS contact_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(200) NOT NULL,
                phone VARCHAR(20),
                subject VARCHAR(200),
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_read INTEGER DEFAULT 0
            )
        """))


def _ensure_settings_schema():
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE settings ADD COLUMN IF NOT EXISTS upi_id VARCHAR(120) NOT NULL DEFAULT ''"))
            return

        columns = [row[1] for row in conn.execute(text("PRAGMA table_info(settings)")).fetchall()]
        if "upi_id" not in columns:
            conn.execute(text("ALTER TABLE settings ADD COLUMN upi_id VARCHAR(120) NOT NULL DEFAULT ''"))


def _ensure_order_lifecycle_schema():
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false"))
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ"))
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ"))
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ"))
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'customer'"))
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT ''"))
            conn.execute(text("UPDATE orders SET status = 'pending' WHERE status IS NULL"))
            return

        columns = [row[1] for row in conn.execute(text("PRAGMA table_info(orders)")).fetchall()]
        if "is_archived" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0"))
        if "archived_at" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN archived_at DATETIME"))
        if "preparing_at" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN preparing_at DATETIME"))
        if "served_at" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN served_at DATETIME"))
        if "source" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'customer'"))
        if "payment_method" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT ''"))
        conn.execute(text("UPDATE orders SET status = 'pending' WHERE status IS NULL"))


def _ensure_sqlite_compatibility():
    if engine.dialect.name != "sqlite":
        return

    def _needs_rewrite(table_name: str, columns: dict[str, bool]) -> bool:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        if not rows:
            return False
        for col_name, allow_null in columns.items():
            row = next((row for row in rows if row[1] == col_name), None)
            if row is None:
                continue
            if int(row[3]) == 1 and allow_null:
                return True
        return False

    def _rewrite_table(create_sql: str, table_name: str, indexes: list[str]) -> None:
        old_columns = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()]
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text(f"DROP TABLE IF EXISTS {table_name}_new"))
        conn.execute(text(create_sql))
        new_columns = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name}_new)")).fetchall()]
        common_columns = [column for column in old_columns if column in new_columns]
        quoted_columns = ", ".join(f'"{column}"' for column in common_columns)
        conn.execute(text(f"INSERT INTO {table_name}_new ({quoted_columns}) SELECT {quoted_columns} FROM {table_name}"))
        conn.execute(text(f"DROP TABLE {table_name}"))
        conn.execute(text(f"ALTER TABLE {table_name}_new RENAME TO {table_name}"))
        for index_sql in indexes:
            conn.execute(text(index_sql))
        conn.execute(text("PRAGMA foreign_keys=ON"))

    with engine.begin() as conn:
        if _needs_rewrite("audit_log", {"user_id": True}):
            _rewrite_table(
                """
                    CREATE TABLE IF NOT EXISTS audit_log_new (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        user_id CHAR(32) REFERENCES users(id) ON DELETE SET NULL,
                        action VARCHAR(100) NOT NULL,
                        entity_type VARCHAR(50) NOT NULL,
                        entity_id VARCHAR(100) NOT NULL,
                        payload JSON NOT NULL,
                        ip_address VARCHAR(45) NOT NULL,
                        user_agent TEXT NOT NULL,
                        created_at DATETIME NOT NULL
                    )
                """,
                "audit_log",
                [
                    "CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id)",
                    "CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id)",
                    "CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC)",
                ],
            )

        if _needs_rewrite("orders", {"user_id": True, "table_id": True}):
            _rewrite_table(
                """
                    CREATE TABLE IF NOT EXISTS orders_new (
                        id CHAR(32) NOT NULL,
                        order_number INTEGER NOT NULL,
                        user_id CHAR(32) REFERENCES users(id),
                        table_id CHAR(32) REFERENCES tables(id),
                        status VARCHAR(20) NOT NULL,
                        prep_stage VARCHAR(20) NOT NULL,
                        occasion VARCHAR(50) NOT NULL,
                        idempotency_key VARCHAR(100) NOT NULL,
                        version INTEGER NOT NULL,
                        subtotal INTEGER NOT NULL,
                        tax INTEGER NOT NULL,
                        total INTEGER NOT NULL,
                        loyalty_discount INTEGER NOT NULL,
                        guest_name VARCHAR(100) NOT NULL,
                        guest_phone VARCHAR(20) NOT NULL,
                        public_token_hash VARCHAR(255) NOT NULL,
                        order_type VARCHAR(20) NOT NULL,
                        pickup_time DATETIME,
                        status_history JSON NOT NULL,
                        confirmed_at DATETIME,
                        served_at DATETIME,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        PRIMARY KEY (id),
                        UNIQUE (order_number),
                        UNIQUE (idempotency_key),
                        FOREIGN KEY(user_id) REFERENCES users (id),
                        FOREIGN KEY(table_id) REFERENCES tables (id)
                    )
                """,
                "orders",
                [
                    "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at)",
                ],
            )

        if _needs_rewrite("chat_log", {"user_id": True}):
            _rewrite_table(
                """
                    CREATE TABLE IF NOT EXISTS chat_log_new (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        user_id CHAR(32) REFERENCES users(id),
                        session_id VARCHAR(120) NOT NULL,
                        role VARCHAR(20) NOT NULL,
                        message TEXT NOT NULL,
                        created_at DATETIME NOT NULL
                    )
                """,
                "chat_log",
                [
                    "CREATE INDEX IF NOT EXISTS idx_chat_log_session ON chat_log (session_id)",
                ],
            )

        max_price = conn.execute(text("SELECT COALESCE(MAX(price), 0) FROM menu_items")).scalar() or 0
        if int(max_price) > 1000:
            conn.execute(text("UPDATE menu_items SET price = CAST(ROUND(price / 100.0) AS INTEGER)"))
            conn.execute(text("UPDATE order_items SET unit_price = CAST(ROUND(unit_price / 100.0) AS INTEGER)"))
            conn.execute(text("""
                UPDATE orders
                SET subtotal = CAST(ROUND(subtotal / 100.0) AS INTEGER),
                    tax = CAST(ROUND(tax / 100.0) AS INTEGER),
                    total = CAST(ROUND(total / 100.0) AS INTEGER)
            """))
            conn.execute(text("UPDATE payments SET amount = CAST(ROUND(amount / 100.0) AS INTEGER)"))

        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_order_id "
            "ON payments (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL"
        ))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                tagline VARCHAR(160) NOT NULL,
                hours VARCHAR(120) NOT NULL,
                contact VARCHAR(40) NOT NULL,
                status VARCHAR(40) NOT NULL,
                address VARCHAR(240) NOT NULL,
                tax_rate INTEGER NOT NULL,
                currency VARCHAR(10) NOT NULL,
                upi_id VARCHAR(120) NOT NULL DEFAULT '',
                updated_at DATETIME NOT NULL
            )
        """))
        conn.execute(text("""
            INSERT INTO settings
            (id, name, tagline, hours, contact, status, address, tax_rate, currency, updated_at)
            VALUES
            (1, 'Jaya Dhaba', 'Heritage Restored. Flavor Perfected.',
             '11:00 AM - 11:00 PM', '07386185823', 'open',
             'East Marredpally, Secunderabad', 5, 'INR', CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO NOTHING
        """))


def seed_db():
    with get_db() as db:
        # 1. Seed Tables
        tables_data = [
            ("table-1", "Table 1", 4),
            ("table-2", "Table 2", 4),
            ("family-table", "Family Table", 8),
        ]
        for token, label, capacity in tables_data:
            exists = db.execute(select(RestaurantTable).filter_by(qr_token=token)).scalar_one_or_none()
            if not exists:
                db.add(RestaurantTable(qr_token=token, label=label, capacity=capacity))

        # 2. Seed Categories
        categories_data = [
            ("Starters", 10, 2.5, 2.5),
            ("Biryani", 20, 2.5, 2.5),
            ("Curries", 30, 2.5, 2.5),
            ("Breads", 40, 2.5, 2.5),
            ("Rice", 50, 2.5, 2.5),
            ("Beverages", 60, 2.5, 2.5),
            ("Desserts", 70, 2.5, 2.5),
        ]
        for name, order, cgst, sgst in categories_data:
            exists = db.execute(select(MenuCategory).filter_by(name=name)).scalar_one_or_none()
            if not exists:
                db.add(MenuCategory(name=name, display_order=order, cgst_rate=cgst, sgst_rate=sgst))
        
        db.commit()

        # Map for menu items
        cat_map = {c.name: c.id for c in db.execute(select(MenuCategory)).scalars()}

        # 3. Seed Menu Items
        menu_data = [
            ("chicken65", "Starters", "Chicken 65", "Spicy fried chicken tempered with curry leaves.", 160, "/chicken.png", ["non-veg", "spicy"]),
            ("paneer-tikka", "Starters", "Paneer Tikka", "Charcoal-grilled paneer with dhaba masala.", 150, "/paneer.png", ["vegetarian"]),
            ("veg-manchurian", "Starters", "Veg Manchurian Dry", "Crispy veg bites in soy-garlic glaze.", 120, "/kofta.png", ["vegetarian"]),
            ("chilli-chicken", "Starters", "Chilli Chicken", "Indo-Chinese chicken with peppers.", 170, "/chicken.png", ["non-veg"]),
            ("masala-papad", "Starters", "Masala Papad", "Crisp papad topped with onion, tomato and lime.", 80, "/naan.png", ["vegetarian"]),
            ("veg-biryani", "Biryani", "Veg Dum Biryani", "Dum rice with seasonal vegetables and saffron.", 150, "/biryani.png", ["vegetarian"]),
            ("chicken-biryani", "Biryani", "Chicken Biryani", "Hyderabadi dum biryani with tender chicken.", 220, "/biryani.png", ["best-seller"]),
            ("mutton-biryani", "Biryani", "Mutton Biryani", "Slow-cooked mutton dum biryani.", 280, "/biryani.png", ["premium"]),
            ("egg-biryani", "Biryani", "Egg Biryani", "Fragrant rice layered with boiled eggs and masala.", 170, "/biryani.png", ["spicy"]),
            ("family-biryani", "Biryani", "Chicken Family Pack Biryani", "Generous chicken biryani pack for sharing.", 520, "/biryani.png", ["family"]),
            ("butter-chicken", "Curries", "Butter Chicken", "Creamy tomato gravy with tandoori chicken.", 240, "/mutton.png", ["non-veg"]),
            ("chicken-curry", "Curries", "Dhaba Chicken Curry", "Home-style chicken curry with robust masala.", 210, "/chicken.png", ["spicy"]),
            ("mutton-rogan", "Curries", "Mutton Rogan Josh", "Rich mutton curry with Kashmiri spices.", 270, "/mutton.png", ["premium"]),
            ("paneer-butter", "Curries", "Paneer Butter Masala", "Paneer cubes in creamy makhani gravy.", 190, "/paneer.png", ["vegetarian"]),
            ("dal-tadka", "Curries", "Dal Tadka", "Yellow dal tempered with ghee, garlic and cumin.", 130, "/kofta.png", ["vegetarian"]),
            ("tandoori-roti", "Breads", "Tandoori Roti", "Whole wheat roti from the tandoor.", 25, "/naan.png", ["vegetarian"]),
            ("butter-naan", "Breads", "Butter Naan", "Soft naan brushed with butter.", 45, "/naan.png", ["vegetarian"]),
            ("garlic-naan", "Breads", "Garlic Naan", "Naan topped with garlic and coriander.", 55, "/naan.png", ["vegetarian"]),
            ("plain-paratha", "Breads", "Plain Paratha", "Layered tawa paratha.", 45, "/naan.png", ["vegetarian"]),
            ("rumali-roti", "Breads", "Rumali Roti", "Thin soft roti folded fresh.", 35, "/naan.png", ["vegetarian"]),
            ("jeera-rice", "Rice", "Jeera Rice", "Basmati rice tossed with cumin.", 110, "/biryani.png", ["vegetarian"]),
            ("plain-rice", "Rice", "Plain Rice", "Steamed rice for curry pairings.", 90, "/biryani.png", ["vegetarian"]),
            ("curd-rice", "Rice", "Curd Rice", "Cooling curd rice with tempering.", 100, "/biryani.png", ["vegetarian"]),
            ("veg-fried-rice", "Rice", "Veg Fried Rice", "Wok-tossed rice with vegetables.", 130, "/biryani.png", ["vegetarian"]),
            ("egg-fried-rice", "Rice", "Egg Fried Rice", "Fried rice with egg and spring onion.", 140, "/biryani.png", ["egg"]),
            ("sweet-lassi", "Beverages", "Sweet Lassi", "Thick chilled yogurt drink.", 70, "/lassi.png", ["vegetarian"]),
            ("rose-lassi", "Beverages", "Rose Lassi", "Cooling lassi with rose syrup.", 80, "/lassi.png", ["vegetarian"]),
            ("buttermilk", "Beverages", "Masala Buttermilk", "Spiced chaas with roasted cumin.", 50, "/lassi.png", ["vegetarian"]),
            ("lime-soda", "Beverages", "Fresh Lime Soda", "Sweet or salted lime soda.", 60, "/lassi.png", ["vegetarian"]),
            ("tea", "Beverages", "Irani Chai", "Strong tea with milk and cardamom.", 30, "/lassi.png", ["vegetarian"]),
            ("double-meetha", "Desserts", "Double Ka Meetha", "Hyderabadi bread dessert with rabdi.", 100, "/double.png", ["vegetarian"]),
            ("kheer", "Desserts", "Jaya Special Kheer", "Rice pudding with saffron and cardamom.", 90, "/kheer.png", ["vegetarian"]),
            ("gulab-jamun", "Desserts", "Gulab Jamun", "Warm milk-solid dumplings in syrup.", 80, "/kheer.png", ["vegetarian"]),
            ("qubani", "Desserts", "Qubani Ka Meetha", "Apricot dessert with cream.", 120, "/double.png", ["vegetarian"]),
            ("ice-cream", "Desserts", "Vanilla Ice Cream", "Classic vanilla scoop.", 70, "/kheer.png", ["vegetarian"]),
        ]
        canonical_names = set()
        for client_id, cat_name, name, desc, price, img, tags in menu_data:
            canonical_names.add(name)
            exists = db.execute(select(MenuItem).filter_by(name=name)).scalar_one_or_none()
            if exists:
                exists.category_id = cat_map[cat_name]
                exists.description = desc
                exists.price = price
                exists.image_url = img
                exists.dietary_tags = tags
                exists.available = True
                exists.deleted_at = None
            else:
                db.add(MenuItem(
                    category_id=cat_map[cat_name],
                    name=name,
                    description=desc,
                    price=price,
                    image_url=img,
                    dietary_tags=tags,
                    available=True
                ))

        legacy_demo_names = {
            "Hyderabadi Haleem",
            "Malai Kofta - Golden Heritage",
            "Tandoori Chicken",
            "Special Double Ka Meetha",
        }
        for item in db.execute(select(MenuItem).where(MenuItem.name.in_(legacy_demo_names))).scalars():
            if item.name not in canonical_names:
                item.available = False
                item.deleted_at = utc_now()

        # 4. Bootstrap Admin
        admin_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@jayadhaba.in")
        admin_pass = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", "Admin@1234")
        exists = db.execute(select(User).filter_by(email=admin_email)).scalar_one_or_none()
        if not exists:
            db.add(User(
                email=admin_email,
                password_hash=hash_password(admin_pass),
                role="owner"
            ))

        db.commit()


from sqlalchemy import text

# Compatibility Layers for legacy code
class LegacyConn:
    """
    Wraps SQLAlchemy Connection to support legacy raw SQL with ? placeholders.
    Handles transaction lifecycle: begin() is automatic via engine.begin(),
    commit/rollback are explicit.
    """
    def __init__(self, conn):
        self.conn = conn
        self._in_transaction = True

    def execute(self, sql, params=None):
        if isinstance(sql, str):
            # Convert ? placeholders to :p0, :p1, ... named params for SQLAlchemy
            if params and isinstance(params, (list, tuple)) and '?' in sql:
                new_sql = sql
                param_dict = {}
                for i, val in enumerate(params):
                    # Replace only the first ? each time
                    new_sql = new_sql.replace('?', f':p{i}', 1)
                    param_dict[f'p{i}'] = val
                sql = text(new_sql)
                params = param_dict
            else:
                sql = text(sql)
                if params is None:
                    params = {}
        res = self.conn.execute(sql, params or {})
        return LegacyResult(res)

    def commit(self):
        """Commit the transaction. Called explicitly by legacy code."""
        if self._in_transaction:
            self.conn.commit()
            self._in_transaction = False

    def rollback(self):
        """Rollback the transaction. For explicit error recovery."""
        if self._in_transaction:
            self.conn.rollback()
            self._in_transaction = False


class LegacyResult:
    """Wraps SQLAlchemy result to support both iteration and .fetchone()/.fetchall()"""
    def __init__(self, result):
        self._result = result
        self._mappings = None

    def _get_mappings(self):
        if self._mappings is None:
            try:
                self._mappings = self._result.mappings().all()
            except Exception:
                self._mappings = []
        return self._mappings

    def fetchone(self):
        rows = self._get_mappings()
        return rows[0] if rows else None

    def fetchall(self):
        return self._get_mappings()

    @property
    def lastrowid(self):
        try:
            return self._result.lastrowid
        except Exception:
            return None

    def __iter__(self):
        return iter(self._get_mappings())

    def __len__(self):
        return len(self._get_mappings())

@contextmanager
def connect(url: str = None) -> Generator:
    """Read-only connection. Auto-commits after context exit."""
    with engine.connect() as conn:
        yield LegacyConn(conn)

@contextmanager
def transaction(url: str = None) -> Generator:
    """Transactional connection. Auto-commits on success, auto-rollbacks on exception."""
    with engine.begin() as conn:
        legacy = LegacyConn(conn)
        try:
            yield legacy
            # Implicit commit() happens on context exit if no exception
        except Exception:
            # Implicit rollback() happens on exception
            raise

def run_write(operation_func):
    """Execute operation with automatic transaction handling."""
    try:
        return operation_func()
    except Exception as e:
        raise e


class LegacyResult:
    """Wraps SQLAlchemy result to support both iteration and .fetchone()/.fetchall()"""
    def __init__(self, result):
        self._result = result
        self._mappings = None

    def _get_mappings(self):
        if self._mappings is None:
            try:
                self._mappings = self._result.mappings().all()
            except Exception:
                self._mappings = []
        return self._mappings

    def fetchone(self):
        rows = self._get_mappings()
        return rows[0] if rows else None

    def fetchall(self):
        return self._get_mappings()

    @property
    def lastrowid(self):
        try:
            return self._result.lastrowid
        except Exception:
            return None

    def __iter__(self):
        return iter(self._get_mappings())

    def __len__(self):
        return len(self._get_mappings())

@contextmanager
def connect(url: str = None) -> Generator:
    with engine.connect() as conn:
        yield LegacyConn(conn)

def atomic_write(func, url: str = None):
    with engine.begin() as conn:
        return func(LegacyConn(conn))

@contextmanager
def transaction(url: str = None) -> Generator:
    with engine.begin() as conn:
        yield LegacyConn(conn)

def run_write(operation_func):
    try:
        return operation_func()
    except Exception as e:
        raise e

def select(val):
    # Compatibility with SQLAlchemy select
    from sqlalchemy import select as sa_select
    return sa_select(text(str(val)) if isinstance(val, (int, str)) else val)

def encode_json(obj):
    import json
    return json.dumps(obj)

def decode_json(val, fallback=None):
    import json
    if not val: return fallback
    try: return json.loads(val)
    except: return fallback

# Helper for encryption
def encrypt_pii(data: str) -> str:
    return encryptor.encrypt(data)

def decrypt_pii(data: str) -> str:
    return encryptor.decrypt(data)

def backup_db():
    # Basic backup logic for SQLite/Postgres
    import shutil
    from datetime import datetime
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backups")
    os.makedirs(backup_dir, exist_ok=True)
    
    if "sqlite" in DATABASE_URL:
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if os.path.exists(db_path):
            shutil.copy2(db_path, os.path.join(backup_dir, f"backup_{timestamp}.db"))
            return True
    
    # For Postgres, we'd normally use pg_dump, but we'll just log the intent here
    # or implement a more complex logic if needed.
    return False
