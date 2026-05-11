import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import db


def reset_database():
    database_url = os.getenv("DATABASE_URL")
    print("Resetting Jaya Dhaba SQLite database...")
    with db.transaction(database_url) as conn:
        conn.execute("DELETE FROM payments")
        conn.execute("DELETE FROM order_items")
        conn.execute("DELETE FROM orders")
        conn.execute("DELETE FROM reservations")
        conn.execute("DELETE FROM audit_log")
        conn.execute("DELETE FROM daily_closures")
    print("Reset complete.")


if __name__ == "__main__":
    reset_database()
