import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env", override=False)
load_dotenv(Path(__file__).resolve().parent / ".env.local", override=True)
from app import create_app
from realtime import socketio

app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") == "development"
    host = os.environ.get("HOST") or ("127.0.0.1" if debug else "0.0.0.0")
    print(f"Jaya Dhaba backend starting on {host}:{port}")
    socketio.run(app, debug=debug, port=port, host=host)
