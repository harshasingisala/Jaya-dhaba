import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import engine
from models import Base

def run_migration():
    print("Starting database migration...")
    Base.metadata.create_all(bind=engine)
    print("Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
