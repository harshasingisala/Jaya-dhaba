from .admin import bp as admin_bp
from .auth import bp as auth_bp
from .chat import bp as chat_bp
from .menu import bp as menu_bp
from .orders import bp as orders_bp
from .kitchen import bp as kitchen_bp
from .tables import bp as tables_bp
from .waiter import bp as waiter_bp
from .payments import bp as payments_bp
from .qr_sessions import bp as qr_sessions_bp
from .reservations import bp as reservations_bp
from .sse import bp as sse_bp
from .staff import bp as staff_bp
from .features import api_bp as features_api_bp, seo_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(kitchen_bp)
    app.register_blueprint(menu_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(tables_bp)
    app.register_blueprint(qr_sessions_bp)
    app.register_blueprint(waiter_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(reservations_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(staff_bp)
    app.register_blueprint(sse_bp)
    app.register_blueprint(features_api_bp)
    app.register_blueprint(seo_bp)
