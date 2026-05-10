import sys
import os
sys.path.append(os.getcwd())
from app import create_app
from db import init_db

app = create_app()
with app.app_context():
    print("Initializing database...")
    init_db()
    print("Database initialized successfully.")
