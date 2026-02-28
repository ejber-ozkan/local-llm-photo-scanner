import os
import sqlite3

import pytest

from services.scan_worker import background_processor


@pytest.fixture
def test_image(tmp_path):
    """Creates a basic valid test image for processing."""
    from PIL import Image

    # Create simple 10x10 RGB image
    img = Image.new("RGB", (10, 10), color="red")
    file_path = str(tmp_path / "test_ml.jpg")
    img.save(file_path, "JPEG")
    return file_path


def seed_db_for_processing(db_file, filepath):
    """Inserts a single file into the DB as pending."""
    conn = sqlite3.connect(db_file)
    c = conn.cursor()
    c.execute(
        "INSERT INTO photos (filepath, filename, status) VALUES (?, ?, 'pending')",
        (filepath, os.path.basename(filepath)),
    )
    conn.commit()
    conn.close()


def test_background_processor_success(mock_db_file, test_image, mock_ollama, monkeypatch):
    """Test full processing pipeline (EXIF extraction, hashing, DeepFace mock, Ollama mock)."""
    # 1. Setup DB with pending photo
    seed_db_for_processing(mock_db_file, test_image)

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT id FROM photos WHERE filepath = ?", (test_image,))
    photo_id = c.fetchone()[0]
    conn.close()

    # 2. Mock missing ML components
    def fake_represent(img_path, model_name="VGG-Face", enforce_detection=False, detector_backend="ssd", align=True):
        return [
            {
                "embedding": [0.1, 0.2, 0.3],
                "facial_area": {"x": 10, "y": 10, "w": 50, "h": 50, "left_eye": [15, 15], "right_eye": [45, 15]},
                "face_confidence": 0.95,
            }
        ]

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
        return []

    monkeypatch.setattr("deepface.DeepFace.represent", fake_represent)
    monkeypatch.setattr("deepface.DeepFace.find", fake_find)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", True)
    monkeypatch.setattr("services.scan_worker.ACTIVE_OLLAMA_MODEL", "mock_model")
    monkeypatch.setattr("services.scan_worker.OLLAMA_URL", "http://localhost:11434/api/generate")
    monkeypatch.setattr("core.state.SCAN_STATE", "running")

    # 3. Call background_processor synchronously for testing
    background_processor()

    # 4. Assert Changes in DB
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT status, description, file_hash, ai_model FROM photos WHERE id = ?", (photo_id,))
    row = c.fetchone()

    assert row is not None
    # Status should be processed
    assert row[0] == "processed"
    # Description should match the Ollama mock return
    assert row[1] == "A simulated scene containing a dog and a person."
    # File hash must not be None
    assert row[2] is not None
    # Model should match the active OLLAMA_MODEL
    assert row[3] == "mock_model"

    # Assert entity creation (DeepFace mock returns 1 face)
    c.execute("SELECT entity_type, entity_name FROM entities WHERE photo_id = ?", (photo_id,))
    entities = c.fetchall()
    conn.close()

    # We should have one person from deepface
    person_entities = [e for e in entities if e[0] == "person"]
    assert len(person_entities) == 1
    assert "Unknown Person" in person_entities[0][1]


def test_background_processor_corrupted_file(mock_db_file, tmp_path, monkeypatch):
    """Test processing gracefully handles completely broken files."""
    bad_file = tmp_path / "corrupt.jpg"
    bad_file.write_bytes(b"This is definitely not an image file")
    filepath = str(bad_file)

    seed_db_for_processing(mock_db_file, filepath)

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT id FROM photos WHERE filepath = ?", (filepath,))
    photo_id = c.fetchone()[0]
    conn.close()

    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", True)
    monkeypatch.setattr("core.state.SCAN_STATE", "running")

    background_processor()

    # Assert it was marked as error or skipped depending on logic
    # In photo_backend.py if cv2 fails to read, DeepFace throws an exception.
    # The file is still marked "processed" but just logs an error for DeepFace.
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT status FROM photos WHERE id = ?", (photo_id,))
    status = c.fetchone()[0]
    conn.close()

    assert status == "processed"  # It finishes Ollama and EXIF then crashes on deepface, so it stays processed
