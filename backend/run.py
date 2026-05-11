import os

from app import create_app

app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in {"1", "true", "yes", "on"}
    print(f"Jaya Dhaba backend starting on port {port}")
    app.run(debug=debug, port=port, host="0.0.0.0")
