from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import main
from app.schemas import SupplementIntakeWrite, SupplementWrite

PRODUCT = {
    "name": "Electrolytes",
    "brand": "Example",
    "form": "Powder",
    "unit": "scoops",
    "amountPerUnit": "1,000",
    "amountUnit": "mg",
    "dailyTarget": "0.8",
    "intervalDays": 2,
    "startDate": "2026-11-13",
    "rating": 4,
}


@pytest.fixture
def client(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    monkeypatch.setattr(
        database, "now_local", lambda: datetime(2026, 11, 17, 12, tzinfo=database.settings.timezone)
    )
    return TestClient(main.app)


def test_supplement_recurrence_fractional_intake_and_label_correction(client):
    response = client.post("/api/supplements", json=PRODUCT)
    assert response.status_code == 201
    path = f"/api/supplements/{response.json()['id']}"

    def cards(day):
        return client.get(f"/api/days/{day}").json()["supplements"]

    today = "2026-11-17"
    assert cards("2026-11-12") == []
    assert cards("2026-11-15")[0]["quantity"] == "0"
    assert cards("2026-11-16") == []
    assert cards(today)[0]["due"]

    for stamp, quantity in [
        ("2026-11-16T22:59:59Z", "0.3"),
        ("2026-11-16T23:00:00Z", "0.1"),
        ("2026-11-17T00:01", "0,2"),
        ("2026-11-17T10:15", "0.5"),
    ]:
        response = client.post(f"{path}/intakes", json={"takenAt": stamp, "quantity": quantity})
        assert response.status_code == 204, response.text

    assert cards("2026-11-16")[0]["quantity"] == "0.3"
    assert not cards("2026-11-16")[0]["due"]
    assert cards(today)[0]["quantity"] == "0.8"
    assert cards(today)[0]["amount"] == "800"
    assert not cards(today)[0]["due"]
    change = {**PRODUCT, "amountPerUnit": "900.125", "startDate": today, "rating": 5}
    assert client.put(path, json=change).status_code == 200
    detail = client.get(path).json()
    assert [(day["date"], day["quantity"], day["amount"]) for day in detail["days"]] == [
        (today, "0.8", "720.1"),
        ("2026-11-16", "0.3", "270.0375"),
    ]
    assert detail["days"][0]["intakes"][0]["amount"] == "450.0625"
    assert detail["days"][0]["intakes"][2]["takenAt"] == "2026-11-16T23:00:00.000000+00:00"
    assert client.get("/api/supplements").json()[0]["rating"] == 5
    assert len(detail["chart"]) == 30
    assert [day["amount"] for day in detail["chart"][-3:]] == ["0", "270.0375", "720.1"]
    assert cards("2026-11-16")[0]["amount"] == "270.0375"

    # A scheduled product without a target has no due reminder.
    assert client.put(path, json={**change, "dailyTarget": None}).status_code == 200
    assert cards(today)[0]["dailyTarget"] is None
    assert not cards(today)[0]["due"]


@pytest.mark.parametrize(
    ("stamp", "quantity"),
    [
        ("2026-11-17T10:00", "NaN"),
        ("2026-11-17T10:00", "0"),
        ("2026-11-17T10:00", "-2"),
        ("2026-11-17", "1"),
        ("0001-01-01T00:00", "1"),
        ("2026-11-17T12:01", "1"),
        ("2026-03-29T02:30", "1"),
        ("2026-10-25T02:30", "1"),
    ],
)
def test_supplement_intake_rejects_invalid_quantity_or_time(client, stamp, quantity):
    product = client.post("/api/supplements", json=PRODUCT).json()
    path = f"/api/supplements/{product['id']}"
    response = client.post(f"{path}/intakes", json={"takenAt": stamp, "quantity": quantity})
    assert response.status_code == 400
    assert client.get(path).json()["days"] == []


def test_supplement_stock_reset_and_intake_corrections(client):
    product = client.post("/api/supplements", json=PRODUCT).json()
    path = f"/api/supplements/{product['id']}"
    intakes = f"{path}/intakes"

    def detail():
        return client.get(path).json()

    assert detail()["stock"] is None
    before = {"takenAt": "2026-11-17T08:59:59", "quantity": "0.2"}
    boundary = {"takenAt": "2026-11-17T09:00", "quantity": "0.3"}
    assert client.post(intakes, json=before).status_code == 204
    assert client.post(intakes, json=boundary).status_code == 204
    newer_id, older_id = (entry["id"] for entry in detail()["days"][0]["intakes"])
    assert (
        client.put(
            f"{path}/stock",
            json={
                "startingBalance": "0.5",
                "effectiveAt": boundary["takenAt"],
                "packageSize": "10",
                "expiryDate": "2027-02-01",
            },
        ).status_code
        == 204
    )
    assert detail()["stock"] == {
        "startingBalance": "0.5",
        "balance": "0.2",
        "effectiveAt": "2026-11-17T08:00:00.000000+00:00",
        "packageSize": "10",
        "expiryDate": "2027-02-01",
    }
    assert (
        client.put(f"{intakes}/{newer_id}", json={**boundary, "quantity": "0.6"}).status_code == 204
    )
    assert detail()["stock"]["balance"] == "-0.1"

    assert (
        client.put(
            f"{path}/stock",
            json={
                "startingBalance": "0",
                "effectiveAt": "2026-11-17T10:00",
            },
        ).status_code
        == 204
    )
    assert client.put(f"{intakes}/{older_id}", json={**before, "quantity": "1"}).status_code == 204
    assert client.delete(f"{intakes}/{newer_id}").status_code == 204
    assert detail()["stock"]["balance"] == "0"
    assert (
        client.post(intakes, json={"takenAt": "2026-11-17T10:01", "quantity": "0.1"}).status_code
        == 204
    )
    assert detail()["stock"]["balance"] == "-0.1"
    current_id = detail()["days"][0]["intakes"][0]["id"]
    moved = {"takenAt": "2026-11-17T09:59", "quantity": "0.1"}
    assert client.put(f"{intakes}/{current_id}", json=moved).status_code == 204
    assert detail()["stock"]["balance"] == "0"
    assert (
        client.put(
            f"{intakes}/{current_id}", json={**moved, "takenAt": "2026-11-17T10:00"}
        ).status_code
        == 204
    )
    assert client.delete(f"{intakes}/{current_id}").status_code == 204
    assert detail()["stock"]["balance"] == "0"


def test_supplement_notes_archive_restore_and_backup(client, database):
    product = client.post("/api/supplements", json=PRODUCT).json()
    path = f"/api/supplements/{product['id']}"
    today = "2026-11-17"
    off_day = "2026-11-14"
    assert client.get(f"/api/days/{off_day}").json()["supplements"] == []
    assert (
        client.put(f"{path}/notes/{off_day}", json={"body": "Note without intake"}).status_code
        == 204
    )
    assert client.put(f"{path}/notes/{today}", json={"body": "Current note"}).status_code == 204
    assert (
        client.post(
            f"{path}/intakes",
            json={
                "takenAt": "2026-11-17T09:30",
                "quantity": "0.5",
            },
        ).status_code
        == 204
    )
    assert client.put(f"{path}/stock", json={"startingBalance": "2"}).status_code == 204
    card = client.get(f"/api/days/{off_day}").json()["supplements"][0]
    assert (card["note"], card["quantity"]) == ("Note without intake", "0")
    assert off_day in client.get("/api/calendar/2026-11").json()["activeDates"]
    assert client.post(f"{path}/archive").status_code == 204
    assert client.get(f"/api/days/{today}").json()["supplements"] == []
    assert client.get(f"/api/days/{off_day}").json()["supplements"][0]["archived"]
    library = client.get("/api/supplements").json()
    assert library[0]["rating"] == 4 and library[0]["archived"]

    archived = client.get(path).json()
    assert archived["notes"] == [
        {"date": today, "body": "Current note"},
        {"date": off_day, "body": "Note without intake"},
    ]
    assert archived["days"][0]["quantity"] == "0.5"
    assert archived["stock"]["balance"] == "2"
    backup = database.create_backup("on-demand")
    assert client.put(f"{path}/notes/{off_day}", json={"body": ""}).status_code == 204
    assert client.get(f"/api/days/{off_day}").json()["supplements"] == []
    assert client.post(f"{path}/restore").status_code == 204
    assert not client.get(f"/api/days/{today}").json()["supplements"][0]["archived"]
    database.restore_backup(backup["id"], "RESTORE")
    assert client.get(path).json() == archived


def test_delete_supplement_requires_confirmation_and_removes_only_its_data(client, database):
    day = "2026-11-17"
    product = client.post("/api/supplements", json=PRODUCT).json()
    other = client.post("/api/supplements", json={**PRODUCT, "name": "Other"}).json()
    path = f"/api/supplements/{product['id']}"
    assert (
        client.post(
            f"{path}/intakes", json={"takenAt": f"{day}T09:30", "quantity": "0.5"}
        ).status_code
        == 204
    )
    assert client.put(f"{path}/notes/{day}", json={"body": "Current note"}).status_code == 204
    assert client.put(f"{path}/stock", json={"startingBalance": "2"}).status_code == 204
    snapshot = client.get(path).json()

    assert client.delete(path).status_code == 422
    assert client.request("DELETE", path, json={"confirmation": "delete"}).status_code == 400
    assert client.get(path).json() == snapshot
    assert database.list_backups() == []

    assert client.request("DELETE", path, json={"confirmation": "DELETE"}).status_code == 204
    assert client.get(path).status_code == 400
    assert client.get("/api/supplements").json() == [other]
    assert [card["id"] for card in client.get(f"/api/days/{day}").json()["supplements"]] == [
        other["id"]
    ]
    assert day not in client.get("/api/calendar/2026-11").json()["activeDates"]
    (backup,) = database.list_backups()
    assert backup["category"] == "pre-delete"
    database.restore_backup(backup["id"], "RESTORE")
    assert client.get(path).json() == snapshot


def test_migrate_existing_database_to_supplements(database):
    with database.connect() as connection, connection:
        for table in ("supplement_intakes", "supplement_notes", "supplement_products"):
            connection.execute(f"DROP TABLE {table}")
        connection.execute("DELETE FROM schema_migrations WHERE version=18")
    database.migrate()
    database.migrate()
    product = database.save_supplement(SupplementWrite(**PRODUCT))
    database.save_supplement_intake(
        product["id"], SupplementIntakeWrite(takenAt="2026-01-01T12:00", quantity="0.5")
    )
    assert database.supplement_history(product["id"])["days"][0]["amount"] == "500"


def test_product_settings_preserve_rating_and_legacy_form(client):
    settings = {key: value for key, value in PRODUCT.items() if key not in {"form", "rating"}}
    created = client.post("/api/supplements", json={**settings, "form": "Powder"}).json()
    assert created["rating"] is None
    path = f"/api/supplements/{created['id']}"
    assert client.put(f"{path}/rating", json={"rating": 6}).status_code == 422
    assert client.put(f"{path}/rating", json={"rating": 4}).status_code == 204
    edited = client.put(path, json={**settings, "brand": "Corrected"}).json()
    assert (edited["brand"], edited["rating"], edited["form"]) == ("Corrected", 4, "Powder")
    assert client.put(f"{path}/rating", json={"rating": None}).status_code == 204
    assert client.get(path).json()["product"]["rating"] is None
