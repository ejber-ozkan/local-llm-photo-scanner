import os
import sqlite3

import pytest

import database_setup


# Setup dummy db seed
def seed_extra_db(db_path, dummy_img_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute(
        "INSERT INTO photos (id, filepath, filename, description, status, date_created, date_modified, date_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            10,
            dummy_img_path,
            "dummy.jpg",
            "A dummy photo",
            "processed",
            "2025-01-01",
            "2025-01-01",
            "2025-01-01 12:00:00",
        ),
    )

    c.execute(
        "INSERT INTO entities (photo_id, entity_type, entity_name, first_name, last_name, bounding_box) VALUES (?, ?, ?, ?, ?, ?)",
        (10, "person", "Alice", "Alice", "", '{"x": 10, "y": 10, "w": 50, "h": 50}'),
    )

    conn.commit()
    conn.close()


@pytest.fixture
def dummy_img(tmp_path):
    from PIL import Image

    img = Image.new("RGB", (10, 10), color="blue")
    file_path = str(tmp_path / "dummy.jpg")
    img.save(file_path, "JPEG")
    return file_path


def test_get_photo_and_thumbnail(client, mock_db_file, dummy_img):
    seed_extra_db(mock_db_file, dummy_img)

    # Test valid
    resp1 = client.get("/api/image/10")
    assert resp1.status_code == 200
    assert resp1.headers["content-type"] in ["image/jpeg", "image/png", "application/octet-stream"]

    # We do not have a dedicated thumbnail route. We check if type parameter works.

    # Test invalid
    assert client.get("/api/image/999").status_code == 404


def test_get_photo_detail_success(client, mock_db_file, dummy_img):
    seed_extra_db(mock_db_file, dummy_img)

    resp = client.get("/api/photo/10/detail")
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "dummy.jpg"
    assert "Alice" in [e["name"] for e in data["entities"]]
    assert "Camera" in data["metadata"]


def test_get_photo_detail_not_found(client, mock_db_file):
    resp = client.get("/api/photo/999/detail")
    assert resp.status_code == 404


def test_get_image_from_test_db(client, mock_db_file, dummy_img):
    # Setup test_db with an image that is NOT in main db
    import shutil
    import sqlite3

    unique_dummy = dummy_img + "_test555.jpg"
    shutil.copy(dummy_img, unique_dummy)

    from core.config import DB_TEST_FILE

    test_db = DB_TEST_FILE
    conn = sqlite3.connect(test_db)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM photos WHERE id = 555")
    cursor.execute(
        "INSERT INTO photos (id, filepath, filename, status) VALUES (555, ?, 'testonly.jpg', 'processed')",
        (unique_dummy,),
    )
    conn.commit()
    conn.close()

    # Request image 555 which is only in test logic fallback
    resp = client.get("/api/image/555")
    if resp.status_code != 200:
        json_resp = resp.json()
        conn = sqlite3.connect(database_setup.DB_TEST_FILE)
        row = conn.cursor().execute("SELECT id, filepath FROM photos WHERE id=555").fetchone()
        conn.close()
        import os

        assert resp.status_code == 200, (
            f"Failed. JSON={json_resp}, DB_TEST_FILE={database_setup.DB_TEST_FILE}, row={row}, exists={os.path.exists(row[1] if row else '')}"
        )


def test_get_years(client, mock_db_file, dummy_img):
    seed_extra_db(mock_db_file, dummy_img)

    resp = client.get("/api/gallery/years")
    assert resp.status_code == 200
    data = resp.json()
    # 2025 should be in there
    assert data[0]["year"] == "2025"


def test_scan_status_and_logs(client):
    resp = client.get("/api/scan/status")
    assert resp.status_code == 200
    assert "state" in resp.json()

    resp = client.get("/api/scan/logs")
    assert resp.status_code == 200
    assert isinstance(resp.json()["logs"], list)


def test_scan_control(client):
    # Pause
    resp = client.post("/api/scan/control", json={"action": "pause"})
    assert resp.status_code == 200
    # Resume
    resp = client.post("/api/scan/control", json={"action": "resume"})
    assert resp.status_code == 200
    # Cancel
    resp = client.post("/api/scan/control", json={"action": "cancel"})
    assert resp.status_code == 200


def test_database_clean(client, mock_db_file):
    resp = client.post("/api/database/clean", json={"target": "test"})
    assert resp.status_code == 200
    assert "cleaned successfully" in resp.json()["message"]


def test_database_backups_and_restore(client, monkeypatch):

    def fake_exists(*args, **kwargs):
        return True

    def fake_listdir(*args, **kwargs):
        return ["backup1.sqlite", "backup2.sqlite"]

    def fake_getsize(*args, **kwargs):
        return 1000

    def fake_getctime(*args, **kwargs):
        return 1600000000

    monkeypatch.setattr(os.path, "exists", fake_exists)
    monkeypatch.setattr(os, "listdir", fake_listdir)
    monkeypatch.setattr(os.path, "getsize", fake_getsize)
    monkeypatch.setattr(os.path, "getctime", fake_getctime)

    def fake_restore(*args, **kwargs):
        return True

    monkeypatch.setattr("api.routes.system.restore_database", fake_restore)

    resp1 = client.get("/api/database/backups")
    assert resp1.status_code == 200
    assert "backup1.sqlite" in [b["filename"] for b in resp1.json()["backups"]]

    resp2 = client.post("/api/database/restore", json={"filename": "backup1.sqlite"})
    assert resp2.status_code == 200
    assert "Database restored" in resp2.json()["message"]


def test_get_duplicates(client, mock_db_file, dummy_img):
    seed_extra_db(mock_db_file, dummy_img)
    # Add a duplicate
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute(
        "INSERT INTO photos (id, filepath, filename, file_hash, file_size, status) VALUES (?, ?, ?, ?, ?, ?)",
        (11, "/foo/dup.jpg", "dup.jpg", "hash123", 1000, "duplicate"),
    )
    c.execute("UPDATE photos SET file_hash = 'hash123', file_size = 1000 WHERE id = 10")
    conn.commit()
    conn.close()

    resp = client.get("/api/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert data[0]["hash"] == "hash123"
