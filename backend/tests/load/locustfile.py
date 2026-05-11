import uuid
from datetime import datetime, timedelta, timezone

from locust import HttpUser, between, events, task


class RestaurantUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        csrf = self.client.get("/api/csrf-token").json()["csrfToken"]
        self.csrf = csrf
        menu = self.client.get("/api/menu?table_token=table-1").json()
        self.table_token = menu["table"]["qr_token"]
        self.item_id = menu["items"][0]["id"]
        self.order_id = None
        self.order_token = None

    @task(5)
    def view_menu(self):
        self.client.get(f"/api/menu?table_token={self.table_token}", name="/api/menu")

    @task(2)
    def place_order(self):
        key = f"locust-order-{uuid.uuid4()}"
        payload = {
            "qr_token": self.table_token,
            "guest_name": "Load Guest",
            "guest_phone": "9876543210",
            "loyalty_points": 0,
            "items": [{"menu_item_id": self.item_id, "qty": 1, "special_note": ""}],
        }
        response = self.client.post("/api/orders", json=payload, headers={"X-CSRF-Token": self.csrf, "Idempotency-Key": key}, name="/api/orders")
        if response.ok:
            data = response.json()
            self.order_id = data["id"]
            self.order_token = data["public_token"]

    @task(2)
    def track_order(self):
        if self.order_id and self.order_token:
            self.client.get(f"/api/orders/{self.order_id}?token={self.order_token}", name="/api/orders/:id")

    @task(1)
    def reserve(self):
        slot = datetime.now(timezone.utc) + timedelta(days=7, minutes=uuid.uuid4().int % 480)
        payload = {
            "party_size": 2,
            "reserved_at": slot.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "duration_minutes": 90,
            "guest_name": "Load Guest",
            "guest_phone": "9876543210",
        }
        self.client.post("/api/reservations", json=payload, headers={"X-CSRF-Token": self.csrf, "Idempotency-Key": f"locust-res-{uuid.uuid4()}"}, name="/api/reservations")


@events.quitting.add_listener
def _(environment, **_kwargs):
    stats = environment.runner.stats.total
    p95 = stats.get_response_time_percentile(0.95)
    error_rate = stats.fail_ratio
    failures = []
    if p95 > 200:
        failures.append(f"p95={p95}ms")
    if error_rate > 0.001:
        failures.append(f"error_rate={error_rate:.4%}")
    if failures:
        print(f"LOAD TEST FAILED: {'; '.join(failures)}")
        environment.process_exit_code = 1
    else:
        print(f"LOAD TEST PASSED: p95={p95}ms error_rate={error_rate:.4%}")
