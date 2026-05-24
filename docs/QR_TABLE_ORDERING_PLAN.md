# QR Table Ordering System

## Recommended Stack

Use the current Jaya Dhaba stack instead of starting a separate project:

- Frontend: React 18 + Vite + Tailwind CSS
- Backend: Flask + SQLAlchemy
- Database: PostgreSQL in production, SQLite for local development
- Realtime: existing Socket.IO/SSE broadcast layer
- Auth: existing admin JWT login and role protection
- QR codes: Python `qrcode` package already installed in the backend
- Hosting: Vercel for frontend, Render for backend, Supabase Postgres or Render Postgres for production database

Best hosted database choice: Supabase Postgres.

Why: it is beginner-friendly, managed, easy to back up, works well with the existing Postgres-compatible backend, and keeps the door open for Supabase realtime later. For this app, the current Flask realtime layer can continue to push live order updates to the admin dashboard.

## Current Project Fit

The repo already has most of the foundation:

- `frontend/src/pages/Admin.jsx` has protected admin routes.
- `frontend/src/pages/Admin/views/OrdersManager.jsx` already shows live orders and stats.
- `backend/routes/orders.py` already creates orders, saves items, updates status, archives served orders, and broadcasts live updates.
- `backend/routes/menu.py` already serves menu data and supports table QR tokens.
- `backend/routes/admin.py` already includes initial table and QR endpoints.
- `backend/models.py` already has `RestaurantTable`, `Order`, `OrderItem`, `MenuCategory`, and `MenuItem`.

The remaining QR table work should reuse these pieces and add the missing polished surfaces.

## Target Folder Structure

```text
Jaya Dhaba/
  backend/
    models.py
    schemas.py
    routes/
      admin.py              # table CRUD, QR generation, stats/settings
      menu.py               # public menu and table lookup
      orders.py             # customer order creation, admin order updates
    services/
      table_sessions.py     # one-active-order-per-table helpers
    database/
      migrations/
        003_table_ordering.sql
    scripts/
      generate_table_qrs.py # optional CLI bulk QR export

  frontend/
    src/
      App.jsx
      api/
        index.js            # table QR/admin APIs added here
      pages/
        TableMenu.jsx       # mobile customer ordering page for /menu?table=3
        Admin/
          views/
            QRTableManager.jsx # admin table count + QR download/print page
            OrdersManager.jsx  # existing live order dashboard
      components/
        table-ordering/
          TableMenuHeader.jsx
          TableMenuCategories.jsx
          TableCartSheet.jsx
          OrderSuccess.jsx
        Admin/
          AdminSidebar.jsx

  docs/
    QR_TABLE_ORDERING_PLAN.md
    QR_TABLE_ORDERING_SETUP.md
```

## URL Design

Customer-facing URLs:

```text
https://jayadhaba.online/menu?table=3
https://jayadhaba.online/menu?table_token=<secure-token>
```

Admin-facing URLs:

```text
https://jayadhaba.online/admin/tables
https://jayadhaba.online/admin/orders
```

Recommended QR payload:

```text
https://jayadhaba.online/menu?table=3
```

The backend should map table number `3` to the real `tables` row and its secure `qr_token`. The public order submit should send the resolved `table_token` or `table_id` to avoid trusting only the visible number.

## Database Shape

Existing tables are enough for the first version:

```sql
tables
  id uuid primary key
  qr_token varchar unique not null
  label varchar not null
  capacity int default 4
  active boolean default true

orders
  id uuid primary key
  table_id uuid references tables(id)
  status varchar not null default 'pending'
  subtotal int not null
  tax int not null
  total int not null
  guest_name varchar
  order_type varchar default 'dine_in'
  source varchar default 'customer'
  created_at timestamp
  served_at timestamp
  is_archived boolean default false

order_items
  order_id uuid references orders(id)
  menu_item_id uuid references menu_items(id)
  qty int not null
  unit_price int not null
```

For one active order per table, enforce it in backend logic:

- Before creating a dine-in table order, check for an unarchived order for that table whose status is not `served` or `cancelled`.
- If one exists, return it or block the new order with a clear message.
- When admin marks a table free, archive/clear the served order for that table.

A later migration can add a partial unique index in PostgreSQL for stronger protection.

## API Plan

Public:

```text
GET  /api/menu?table=3
GET  /api/menu?table_token=<token>
GET  /api/tables/resolve?table=3
POST /api/orders
```

Admin:

```text
GET    /api/admin/tables
POST   /api/admin/tables/bulk
PATCH  /api/admin/tables/<table_id>
POST   /api/admin/tables/<table_id>/qr-code
POST   /api/admin/tables/qr-codes
PATCH  /api/admin/tables/<table_id>/clear
GET    /api/admin/orders
PATCH  /api/admin/orders/bulk-status
PATCH  /api/admin/orders/bulk-archive
GET    /api/admin/orders/stats
```

## Implementation Steps

1. Add this stack and folder plan.
2. Fix table endpoints to use UUID table IDs consistently.
3. Add table-number lookup so `/menu?table=3` works.
4. Add backend bulk table creation and QR generation.
5. Add customer `TableMenu.jsx` with mobile-first cart and optional customer name.
6. Add admin `QRTableManager.jsx` for table count, QR download, and print.
7. Wire admin sidebar and routes.
8. Tighten one-active-order-per-table behavior.
9. Add setup/deployment docs.
10. Run backend tests and frontend build.

