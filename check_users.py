import sqlite3
import json

try:
    conn = sqlite3.connect('backend/restaurant.db') # db.py says restaurant.db by default
    conn.row_factory = sqlite3.Row
    users = conn.execute("SELECT id, email, phone, role FROM users").fetchall()
    print(json.dumps([dict(user) for user in users], indent=2))
    conn.close()
except Exception as e:
    print(f"Error: {e}")
