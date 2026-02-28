import os

import pytest
from fastapi.testclient import TestClient


# Mock the database paths BEFORE importing application modules
# This ensures that when core.config.py is loaded, it uses the test DB.
@pytest.fixture(scope="session", autouse=True)
def setup_test_env(tmp_path_factory):
    """Sets up physical environment variables for testing."""
    test_dir = tmp_path_factory.mktemp("test_app")

    db_file = str(test_dir / "test.db")
    uploads_dir = str(test_dir / "uploads")
    backups_dir = str(test_dir / "backups")
    os.makedirs(uploads_dir, exist_ok=True)
    os.makedirs(backups_dir, exist_ok=True)

    # We monkeypatch the environment directly so module-level globals might pick it up
    os.environ["PHOTO_DB_FILE"] = db_file
    os.environ["UPLOADS_DIR"] = uploads_dir
    os.environ["BACKUPS_DIR"] = backups_dir

    return {"db": db_file, "uploads": uploads_dir, "backups": backups_dir}


@pytest.fixture
def mock_db_file(tmp_path, monkeypatch):
    """Creates a fresh database file for each test."""
    db_path = str(tmp_path / "test_photometadata.db")

    # We must patch the variables where they are defined/used in the module
    monkeypatch.setattr("database_setup.DB_FILE", db_path)
    monkeypatch.setattr("database_setup.DB_TEST_FILE", db_path)
    monkeypatch.setattr("core.config.DB_FILE", db_path)
    monkeypatch.setattr("core.config.DB_TEST_FILE", db_path)
    monkeypatch.setattr("core.database.DB_FILE", db_path)
    monkeypatch.setattr("core.database.DB_TEST_FILE", db_path)
    monkeypatch.setattr("services.scan_worker.DB_FILE", db_path)
    monkeypatch.setattr("api.routes.gallery.DB_FILE", db_path)
    monkeypatch.setattr("api.routes.entities.DB_FILE", db_path)
    monkeypatch.setattr("api.routes.system.DB_FILE", db_path)
    monkeypatch.setattr("api.routes.system.DB_TEST_FILE", db_path)

    monkeypatch.setattr("backup_db.DB_FILE", db_path)
    monkeypatch.setattr("restore_db.DB_FILE", db_path)

    # Import inside fixture to ensure module variables are patched
    from database_setup import init_db

    init_db()
    return db_path


@pytest.fixture
def client(mock_db_file, tmp_path, monkeypatch):
    """Provides a FastAPI test client, fully isolated."""
    uploads_dir = str(tmp_path / "uploads")
    backups_dir = str(tmp_path / "backups")
    os.makedirs(uploads_dir, exist_ok=True)
    os.makedirs(backups_dir, exist_ok=True)

    monkeypatch.setattr("backup_db.BACKUP_DIR", backups_dir)
    monkeypatch.setattr("restore_db.BACKUP_DIR", backups_dir)

    # Import app here so patches apply
    from main import app

    return TestClient(app)


@pytest.fixture
def mock_ollama(monkeypatch):
    """Provides a mocked responses endpoint for Ollama API calls."""
    import responses

    import core.config

    monkeypatch.setattr(core.config, "OLLAMA_URL", "http://localhost:11434/api/generate")

    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        rsps.add(
            responses.POST,
            "http://localhost:11434/api/generate",
            json={"response": "A simulated scene containing a dog and a person."},
            status=200,
        )
        yield rsps


@pytest.fixture
def mock_deepface(monkeypatch):
    """Mocks DeepFace representation to return dummy vectors."""

    def fake_represent(img_path, model_name="VGG-Face", enforce_detection=False, detector_backend="ssd", align=True):
        return [{"embedding": [0.1, 0.2, 0.3], "facial_area": {"x": 10, "y": 10, "w": 50, "h": 50}}]

    def fake_find(
        img_path,
        db_path,
        model_name="VGG-Face",
        distance_metric="cosine",
        enforce_detection=False,
        detector_backend="ssd",
        align=True,
        silent=False,
    ):
        # Return an empty list of DataFrames (meaning no matching faces found)
        return []

    monkeypatch.setattr("deepface.DeepFace.represent", fake_represent)
    monkeypatch.setattr("deepface.DeepFace.find", fake_find)

    return True
