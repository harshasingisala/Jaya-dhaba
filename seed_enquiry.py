import sqlite3
from datetime import datetime

conn = sqlite3.connect('backend/restaurant.db')
conn.execute("""
    INSERT INTO contact_messages (name, email, message, idempotency_key, request_hash, created_at) 
    VALUES (?, ?, ?, ?, ?, ?)
""", ('Harsha', 'harsha@example.com', 'Great food! Loving the heritage vibes.', 'test-key-1', 'hash-1', datetime.now().isoformat()))
conn.commit()
conn.close()
print("Seed successful.")
