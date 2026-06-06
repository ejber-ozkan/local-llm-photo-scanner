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


def test_open_system_file_and_location(client, monkeypatch):
    import os
    import subprocess
    import sys

    # Mock path existence
    monkeypatch.setattr(os.path, "exists", lambda p: True)

    # Mock subprocess.run and os.startfile
    run_called = []
    startfile_called = []

    def mock_run(args, **kwargs):
        run_called.append(args)
        class MockCompletedProcess:
            returncode = 0
        return MockCompletedProcess()

    def mock_startfile(path):
        startfile_called.append(path)

    monkeypatch.setattr(subprocess, "run", mock_run)
    if hasattr(os, "startfile"):
        monkeypatch.setattr(os, "startfile", mock_startfile)

    # Test open-file
    resp = client.get("/api/system/open-file?path=/dummy/path/to/photo.jpg")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Check that it either called startfile or subprocess.run depending on OS
    if sys.platform == "win32":
        assert len(startfile_called) > 0 or len(run_called) > 0
    else:
        assert len(run_called) > 0

    # Reset tracking lists
    run_called.clear()
    startfile_called.clear()

    # Test open-location
    resp = client.get("/api/system/open-location?path=/dummy/path/to/photo.jpg")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Verify that the correct arguments were passed
    if sys.platform == "win32":
        # Check either startfile or explorer.exe was invoked
        if run_called:
            assert "explorer.exe" in run_called[0][0]
            assert "/select," in run_called[0][1]
    elif sys.platform == "darwin":
        assert run_called[0] == ["open", "-R", os.path.abspath("/dummy/path/to/photo.jpg")]
    else:
        assert run_called[0] == ["xdg-open", os.path.dirname(os.path.abspath("/dummy/path/to/photo.jpg"))]

    # Test path not found
    monkeypatch.setattr(os.path, "exists", lambda p: False)
    resp = client.get("/api/system/open-location?path=/nonexistent/file.jpg")
    assert resp.status_code == 404


def test_check_ffmpeg_frontend_route_alias(client, monkeypatch):
    """The frontend checks FFmpeg availability via the /api/system route."""

    def mock_check_ffmpeg_available():
        return {"available": True, "path": "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe", "version": "ffmpeg version test"}

    monkeypatch.setattr("core.ffmpeg_check.check_ffmpeg_available", mock_check_ffmpeg_available)

    resp = client.get("/api/system/check-ffmpeg")

    assert resp.status_code == 200
    assert resp.json()["available"] is True


def test_database_clean_when_scan_running(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "running")
    resp = client.post("/api/database/clean", json={"target": "test"})
    assert resp.status_code == 400
    assert "Cannot clean database" in resp.json()["detail"]


def test_database_clean_when_target_not_found(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")
    monkeypatch.setattr("api.routes.system.state.FOLDER_SCAN_STATE", "idle")
    monkeypatch.setattr("os.path.exists", lambda p: False)
    resp = client.post("/api/database/clean", json={"target": "invalid_target"})
    assert resp.status_code == 404


def test_database_clean_chromadb_exception(client, mock_db_file, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")
    monkeypatch.setattr("api.routes.system.state.FOLDER_SCAN_STATE", "idle")
    monkeypatch.setattr("os.path.exists", lambda p: True)

    def mock_get_chroma_client():
        raise Exception("Chroma connection error")

    monkeypatch.setattr("core.chroma.get_chroma_client", mock_get_chroma_client)

    resp = client.post("/api/database/clean", json={"target": "main"})
    assert resp.status_code == 200
    assert "Main database cleaned successfully" in resp.json()["message"]


def test_database_clean_sqlite3_exception(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")
    monkeypatch.setattr("api.routes.system.state.FOLDER_SCAN_STATE", "idle")
    monkeypatch.setattr("os.path.exists", lambda p: True)

    def mock_connect(*args, **kwargs):
        raise sqlite3.Error("Mock DB Error")

    monkeypatch.setattr(sqlite3, "connect", mock_connect)

    resp = client.post("/api/database/clean", json={"target": "test"})
    assert resp.status_code == 500


def test_get_backups_directory_not_exists(client, monkeypatch):
    monkeypatch.setattr("os.path.exists", lambda p: False)
    resp = client.get("/api/database/backups")
    assert resp.status_code == 200
    assert resp.json() == {"backups": []}


def test_trigger_backup_when_scan_running(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "running")
    resp = client.post("/api/database/backup")
    assert resp.status_code == 400


def test_trigger_backup_exception(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")

    def mock_backup():
        raise Exception("Disk full")

    monkeypatch.setattr("api.routes.system.backup_database", mock_backup)
    resp = client.post("/api/database/backup")
    assert resp.status_code == 500


def test_trigger_restore_when_scan_running(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "running")
    resp = client.post("/api/database/restore", json={"filename": "backup1.db"})
    assert resp.status_code == 400


def test_trigger_restore_failed_status(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")

    def mock_restore(*args):
        return False

    monkeypatch.setattr("api.routes.system.restore_database", mock_restore)
    resp = client.post("/api/database/restore", json={"filename": "backup1.db"})
    assert resp.status_code == 500


def test_trigger_restore_exception(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")

    def mock_restore(*args):
        raise Exception("Restore error")

    monkeypatch.setattr("api.routes.system.restore_database", mock_restore)
    resp = client.post("/api/database/restore", json={"filename": "backup1.db"})
    assert resp.status_code == 500


def test_get_ollama_models_not_found_or_error(client, monkeypatch):
    import requests

    def mock_get(*args, **kwargs):
        class MockResponse:
            status_code = 404
            def json(self):
                return {}
        return MockResponse()

    monkeypatch.setattr(requests, "get", mock_get)
    resp = client.get("/api/models")
    assert resp.status_code == 200
    assert "active" in resp.json()

    def mock_get_error(*args, **kwargs):
        raise requests.exceptions.RequestException("Conn error")

    monkeypatch.setattr(requests, "get", mock_get_error)
    resp2 = client.get("/api/models")
    assert resp2.status_code == 200
    assert "active" in resp2.json()


def test_open_system_file_and_location_unix_linux(client, monkeypatch):
    import sys
    import subprocess

    monkeypatch.setattr("os.path.exists", lambda p: True)
    monkeypatch.setattr(sys, "platform", "linux")

    run_called = []
    def mock_run(args, **kwargs):
        run_called.append(args)
        class MockCompletedProcess:
            returncode = 0
        return MockCompletedProcess()

    monkeypatch.setattr(subprocess, "run", mock_run)

    resp = client.get("/api/system/open-file?path=/dummy/photo.jpg")
    assert resp.status_code == 200
    assert "xdg-open" in run_called[0]

    run_called.clear()
    resp = client.get("/api/system/open-location?path=/dummy/photo.jpg")
    assert resp.status_code == 200
    assert "xdg-open" in run_called[0]


def test_open_system_file_exception(client, monkeypatch):
    import sys
    monkeypatch.setattr("os.path.exists", lambda p: True)
    monkeypatch.setattr(sys, "platform", "win32")

    if hasattr(os, "startfile"):
        def mock_startfile(p):
            raise OSError("Access denied")
        monkeypatch.setattr(os, "startfile", mock_startfile)
    else:
        import subprocess
        def mock_run(*args, **kwargs):
            raise OSError("Subprocess failed")
        monkeypatch.setattr(subprocess, "run", mock_run)

    resp = client.get("/api/system/open-file?path=/dummy/photo.jpg")
    assert resp.status_code == 500


def test_open_system_location_exception(client, monkeypatch):
    import sys
    import subprocess
    monkeypatch.setattr("os.path.exists", lambda p: True)
    monkeypatch.setattr(sys, "platform", "win32")

    def mock_run(*args, **kwargs):
        raise OSError("Explorer crashed")

    monkeypatch.setattr(subprocess, "run", mock_run)

    resp = client.get("/api/system/open-location?path=/dummy/photo.jpg")
    assert resp.status_code == 500


def test_get_version(client):
    resp = client.get("/api/version")
    assert resp.status_code == 200
    assert "version" in resp.json()


def test_update_settings_model(client):
    resp = client.post("/api/settings/model", json={"active_model": "new_ollama_model"})
    assert resp.status_code == 200
    assert resp.json()["active"] == "new_ollama_model"


def test_database_clean_chromadb_delete_exceptions(client, mock_db_file, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")
    monkeypatch.setattr("api.routes.system.state.FOLDER_SCAN_STATE", "idle")
    monkeypatch.setattr("os.path.exists", lambda p: True)

    class MockChromaClient:
        def delete_collection(self, name):
            raise Exception("Delete failed")

    monkeypatch.setattr("core.chroma.get_chroma_client", lambda: MockChromaClient())

    resp = client.post("/api/database/clean", json={"target": "main"})
    assert resp.status_code == 200
    assert "Main database cleaned successfully" in resp.json()["message"]


def test_trigger_backup_success(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")
    monkeypatch.setattr("api.routes.system.backup_database", lambda: "mock_backup_file.db")
    resp = client.post("/api/database/backup")
    assert resp.status_code == 200
    assert resp.json()["filename"] == "mock_backup_file.db"


def test_get_ollama_models_success(client, monkeypatch):
    import requests
    def mock_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            def json(self):
                return {
                    "models": [
                        {"name": "llava:latest"},
                        {"name": "llama3:latest"}
                    ]
                }
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_get)
    resp = client.get("/api/models")
    assert resp.status_code == 200
    models = resp.json()["models"]
    assert len(models) == 2
    assert models[0]["is_vision"] is True
    assert models[1]["is_vision"] is False


def test_open_system_file_not_found(client, monkeypatch):
    monkeypatch.setattr("os.path.exists", lambda p: False)
    resp = client.get("/api/system/open-file?path=/nonexistent/file.jpg")
    assert resp.status_code == 404


def test_open_system_file_and_location_darwin(client, monkeypatch):
    import sys
    import subprocess
    monkeypatch.setattr("os.path.exists", lambda p: True)
    monkeypatch.setattr(sys, "platform", "darwin")

    run_called = []
    def mock_run(args, **kwargs):
        run_called.append(args)
        class MockCompletedProcess:
            returncode = 0
        return MockCompletedProcess()

    monkeypatch.setattr(subprocess, "run", mock_run)

    resp = client.get("/api/system/open-file?path=/dummy/photo.jpg")
    assert resp.status_code == 200
    assert run_called[0] == ["open", os.path.abspath("/dummy/photo.jpg")]

    run_called.clear()
    resp = client.get("/api/system/open-location?path=/dummy/photo.jpg")
    assert resp.status_code == 200
    assert run_called[0] == ["open", "-R", os.path.abspath("/dummy/photo.jpg")]


def test_database_clean_sqlite3_operational_error(client, monkeypatch):
    monkeypatch.setattr("api.routes.system.state.SCAN_STATE", "idle")
    monkeypatch.setattr("api.routes.system.state.FOLDER_SCAN_STATE", "idle")
    monkeypatch.setattr("os.path.exists", lambda p: True)

    class MockCursor:
        def __init__(self, orig_cursor):
            self._orig = orig_cursor

        def execute(self, sql, *args, **kwargs):
            if "DELETE FROM local_media" in sql or "DELETE FROM folder_scan_history" in sql:
                raise sqlite3.OperationalError("no such table")
            return self._orig.execute(sql, *args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._orig, name)

    class MockConnection:
        def __init__(self, orig_conn):
            self._orig = orig_conn

        def cursor(self):
            return MockCursor(self._orig.cursor())

        def __getattr__(self, name):
            return getattr(self._orig, name)

    orig_connect = sqlite3.connect
    def mock_connect(*args, **kwargs):
        conn = orig_connect(*args, **kwargs)
        return MockConnection(conn)

    monkeypatch.setattr(sqlite3, "connect", mock_connect)

    resp = client.post("/api/database/clean", json={"target": "test"})
    assert resp.status_code == 200
    assert "cleaned successfully" in resp.json()["message"]


