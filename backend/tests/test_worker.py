import os
import sqlite3

import pytest

from services.scan_worker import background_processor
from api.routes.gallery import _compute_gallery_filters


@pytest.fixture
def test_image(tmp_path):
    """Creates a basic valid test image for processing."""
    from PIL import Image

    # Create simple 10x10 RGB image
    img = Image.new("RGB", (10, 10), color="red")
    file_path = str(tmp_path / "test_ml.jpg")
    img.save(file_path, "JPEG")
    return file_path


@pytest.fixture(autouse=True)
def reset_scan_worker_flags(monkeypatch):
    """Keep module-global scan flags isolated between worker tests."""
    monkeypatch.setattr("services.scan_worker.state.USE_OLLAMA", False)
    monkeypatch.setattr("services.scan_worker.state.USE_CLIP", False)
    monkeypatch.setattr("services.scan_worker.state.IGNORE_SCREENSHOTS", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "idle")
    monkeypatch.setattr("services.scan_worker.warm_ollama_model", lambda *args, **kwargs: True)


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
    monkeypatch.setattr("core.config.ACTIVE_OLLAMA_MODEL", "mock_model")
    monkeypatch.setattr("core.config.OLLAMA_URL", "http://localhost:11434/api/generate")
    monkeypatch.setattr("core.state.SCAN_STATE", "running")
    monkeypatch.setattr("core.state.USE_OLLAMA", True)

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


def test_background_processor_warms_ollama_before_processing(mock_db_file, test_image, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)
    calls = []

    def fake_warm(*args, **kwargs):
        calls.append("warm")
        return True

    def fake_process(*args, **kwargs):
        calls.append("process")
        return "Description: warmed. Entities: none"

    monkeypatch.setattr("services.scan_worker.warm_ollama_model", fake_warm)
    monkeypatch.setattr("services.scan_worker.process_image_with_ollama", fake_process)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("core.state.USE_OLLAMA", True)
    monkeypatch.setattr("core.state.USE_CLIP", False)
    monkeypatch.setattr("core.state.SCAN_STATE", "running")

    background_processor()

    assert calls[:2] == ["warm", "process"]


def test_background_processor_pauses_when_ollama_warmup_fails(mock_db_file, test_image, monkeypatch):
    import core.state as state

    seed_db_for_processing(mock_db_file, test_image)

    monkeypatch.setattr("services.scan_worker.warm_ollama_model", lambda *args, **kwargs: False)
    monkeypatch.setattr("services.scan_worker.process_image_with_ollama", lambda *args, **kwargs: "should not run")
    monkeypatch.setattr("core.state.USE_OLLAMA", True)
    monkeypatch.setattr("core.state.USE_CLIP", False)
    monkeypatch.setattr("core.state.SCAN_STATE", "running")

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    status = conn.execute("SELECT status FROM photos WHERE filepath = ?", (test_image,)).fetchone()[0]
    conn.close()

    assert status == "pending"
    assert state.SCAN_STATE == "paused"


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


def test_background_processor_clears_gallery_filter_cache(mock_db_file, test_image, mock_ollama, monkeypatch):
    """Processing a pending image should invalidate cached gallery filters."""
    _compute_gallery_filters.cache_clear()
    initial_filters = _compute_gallery_filters(mock_db_file)
    assert initial_filters["total_photos"] == 0

    seed_db_for_processing(mock_db_file, test_image)

    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("core.config.ACTIVE_OLLAMA_MODEL", "mock_model")
    monkeypatch.setattr("core.config.OLLAMA_URL", "http://localhost:11434/api/generate")
    monkeypatch.setattr("core.state.SCAN_STATE", "running")
    monkeypatch.setattr("core.state.USE_OLLAMA", True)

    background_processor()

    refreshed_filters = _compute_gallery_filters(mock_db_file)
    assert refreshed_filters["total_photos"] == 1


def test_background_processor_ignore_screenshot_filename(mock_db_file, tmp_path, monkeypatch):
    from PIL import Image
    # Create simple 10x10 RGB image with a screenshot name
    img = Image.new("RGB", (10, 10), color="red")
    file_path = str(tmp_path / "screenshot_123.jpg")
    img.save(file_path, "JPEG")

    seed_db_for_processing(mock_db_file, file_path)

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT id FROM photos WHERE filepath = ?", (file_path,))
    photo_id = c.fetchone()[0]
    conn.close()

    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    monkeypatch.setattr("services.scan_worker.state.IGNORE_SCREENSHOTS", True)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT status, description FROM photos WHERE id = ?", (photo_id,))
    row = c.fetchone()
    conn.close()

    assert row[0] == "screenshot"
    assert "Matched screenshot keywords in filename" in row[1]


def test_background_processor_ignore_screenshot_ai(mock_db_file, test_image, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT id FROM photos WHERE filepath = ?", (test_image,))
    photo_id = c.fetchone()[0]
    conn.close()

    # Mock Ollama output to be a screenshot
    def mock_process_image_with_ollama(*args, **kwargs):
        return "SCREENSHOT: this is a capture of a web browser."

    monkeypatch.setattr("services.scan_worker.process_image_with_ollama", mock_process_image_with_ollama)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    monkeypatch.setattr("services.scan_worker.state.IGNORE_SCREENSHOTS", True)
    monkeypatch.setattr("services.scan_worker.state.USE_OLLAMA", True)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT status, description FROM photos WHERE id = ?", (photo_id,))
    row = c.fetchone()
    conn.close()

    assert row[0] == "screenshot"
    assert "AI recognized as screenshot" in row[1]


def test_background_processor_duplicate_detection(mock_db_file, tmp_path, monkeypatch):
    # Create two different files with same content (same hash)
    img_data = b"dummy image data"
    file1 = tmp_path / "img1.jpg"
    file1.write_bytes(img_data)
    file2 = tmp_path / "img2.jpg"
    file2.write_bytes(img_data)

    filepath1 = str(file1)
    filepath2 = str(file2)

    # Insert both
    seed_db_for_processing(mock_db_file, filepath1)
    seed_db_for_processing(mock_db_file, filepath2)

    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    monkeypatch.setattr("services.scan_worker.state.USE_OLLAMA", False)

    # Process first file (sets hash and status to 'processed')
    background_processor()

    # Verify first file is processed
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT status, file_hash FROM photos WHERE filepath = ?", (filepath1,))
    row1 = c.fetchone()
    assert row1[0] == "processed"
    file_hash = row1[1]

    # Re-enable scan state to process the second file
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    background_processor()

    # Verify second file is duplicate
    c.execute("SELECT status, file_hash FROM photos WHERE filepath = ?", (filepath2,))
    row2 = c.fetchone()
    conn.close()

    assert row2[0] == "duplicate"
    assert row2[1] == file_hash


def test_background_processor_duplicate_exception(mock_db_file, monkeypatch):
    # Insert a filepath that doesn't exist
    seed_db_for_processing(mock_db_file, "non_existent_file.jpg")

    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    monkeypatch.setattr("services.scan_worker.state.USE_OLLAMA", False)

    # This should log an error and continue (or mark error depending on the rest of pipeline)
    background_processor()


def test_background_processor_date_extraction_exceptions(mock_db_file, test_image, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    def mock_gettime(path):
        raise OSError("Simulated date read error")

    monkeypatch.setattr(os.path, "getctime", mock_gettime)
    monkeypatch.setattr(os.path, "getmtime", mock_gettime)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    monkeypatch.setattr("services.scan_worker.state.USE_OLLAMA", False)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT date_created, date_modified FROM photos WHERE filepath = ?", (test_image,))
    row = c.fetchone()
    conn.close()

    assert row[0] is None
    assert row[1] is None


def test_background_processor_state_control_idle_and_pause(mock_db_file, test_image, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    # 1. Test when SCAN_STATE is idle
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "idle")
    background_processor()
    # It should immediately break and not process the image (status remains pending)
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT status FROM photos WHERE filepath = ?", (test_image,))
    assert c.fetchone()[0] == "pending"
    conn.close()

    # 2. Test when SCAN_STATE is paused
    # We want it to check pause, then change to idle to break the loop, otherwise it loops forever
    sleep_calls = []
    def mock_sleep(secs):
        sleep_calls.append(secs)
        monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "idle")

    monkeypatch.setattr("services.scan_worker.time.sleep", mock_sleep)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "paused")

    monkeypatch.setattr("services.scan_worker.get_resumable_session", lambda *args: {"id": 999, "total_count": 5, "processed_count": 1})
    mock_set_status = []
    monkeypatch.setattr("services.scan_worker.set_session_status", lambda *args: mock_set_status.append(args))

    background_processor()
    assert len(sleep_calls) > 0
    assert len(mock_set_status) > 0


def test_background_processor_chromadb_description_exception(mock_db_file, test_image, mock_ollama, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    class MockCollection:
        def upsert(self, *args, **kwargs):
            raise Exception("ChromaDB upsert failed")

    monkeypatch.setattr("core.chroma.get_photos_collection", lambda: MockCollection())
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("core.state.SCAN_STATE", "running")
    monkeypatch.setattr("core.state.USE_OLLAMA", True)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    assert c.execute("SELECT status FROM photos WHERE filepath = ?", (test_image,)).fetchone()[0] == "processed"
    conn.close()


def test_background_processor_clip_exception(mock_db_file, test_image, mock_ollama, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    monkeypatch.setattr("services.scan_worker.state.USE_CLIP", True)

    def mock_get_clip_model():
        raise Exception("CLIP init failed")

    monkeypatch.setattr("core.clip_model.get_clip_model", mock_get_clip_model)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("core.state.SCAN_STATE", "running")
    monkeypatch.setattr("core.state.USE_OLLAMA", True)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    assert c.execute("SELECT status FROM photos WHERE filepath = ?", (test_image,)).fetchone()[0] == "processed"
    conn.close()


def test_background_processor_deepface_chromadb_exception(mock_db_file, test_image, mock_ollama, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    def fake_represent(*args, **kwargs):
        return [{"embedding": [0.1, 0.2, 0.3], "facial_area": {"x": 10, "y": 10, "w": 50, "h": 50, "left_eye": [15, 15], "right_eye": [45, 15]}}]

    monkeypatch.setattr("deepface.DeepFace.represent", fake_represent)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", True)

    class MockCollection:
        def upsert(self, *args, **kwargs):
            raise Exception("ChromaDB faces upsert failed")

    monkeypatch.setattr("core.chroma.get_faces_collection", lambda: MockCollection())
    monkeypatch.setattr("core.state.SCAN_STATE", "running")
    monkeypatch.setattr("core.state.USE_OLLAMA", False)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    assert c.execute("SELECT status FROM photos WHERE filepath = ?", (test_image,)).fetchone()[0] == "processed"
    conn.close()


def test_background_processor_deepface_general_exception(mock_db_file, test_image, monkeypatch):
    seed_db_for_processing(mock_db_file, test_image)

    def fake_represent(*args, **kwargs):
        raise Exception("DeepFace internal crash")

    monkeypatch.setattr("deepface.DeepFace.represent", fake_represent)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", True)
    monkeypatch.setattr("core.state.SCAN_STATE", "running")
    monkeypatch.setattr("core.state.USE_OLLAMA", False)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    assert c.execute("SELECT status FROM photos WHERE filepath = ?", (test_image,)).fetchone()[0] == "processed"
    conn.close()


def test_background_processor_pet_parser_cases(mock_db_file, tmp_path, monkeypatch):
    from PIL import Image

    img_files = []
    colors = ["blue", "red", "green", "yellow", "orange"]
    for i in range(5):
        # Generate unique image dimensions and colors to avoid duplicate hash matches
        img = Image.new("RGB", (10 + i, 10 + i), color=colors[i])
        path = str(tmp_path / f"pic_pet{i+1}.jpg")
        img.save(path, "JPEG")
        img_files.append(path)
        seed_db_for_processing(mock_db_file, path)

    responses = {
        img_files[0]: "Entities: golden retriever, dog, puppy",
        img_files[1]: "Entities: none",
        img_files[2]: "Entities: a very long name that exceeds twenty five characters, cat",
        img_files[3]: "Entities: no pets",
        img_files[4]: "Entities: friendly parrot, wild wolf",
    }

    def mock_process_image_with_ollama(filepath, *args, **kwargs):
        return responses.get(filepath, "")

    monkeypatch.setattr("services.scan_worker.process_image_with_ollama", mock_process_image_with_ollama)
    monkeypatch.setattr("services.scan_worker.DEEPFACE_AVAILABLE", False)
    monkeypatch.setattr("services.scan_worker.state.SCAN_STATE", "running")
    monkeypatch.setattr("services.scan_worker.state.USE_OLLAMA", True)

    background_processor()

    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    
    # Check pic_pet1: dog is rejected word, puppy and golden retriever are valid
    c.execute("SELECT entity_name FROM entities WHERE photo_id = 1")
    pet1_entities = [r[0] for r in c.fetchall()]
    assert "Unknown Golden Retriever" in pet1_entities
    assert "Unknown Puppy" in pet1_entities
    assert "Unknown Dog" not in pet1_entities

    # Check pic_pet2: should have no entities (none is negative statement)
    c.execute("SELECT entity_name FROM entities WHERE photo_id = 2")
    assert len(c.fetchall()) == 0

    # Check pic_pet3: should have no entities (cat is rejected word, long name > 25 chars is rejected)
    c.execute("SELECT entity_name FROM entities WHERE photo_id = 3")
    assert len(c.fetchall()) == 0

    # Check pic_pet4: should have no entities (no pets is negative statement)
    c.execute("SELECT entity_name FROM entities WHERE photo_id = 4")
    assert len(c.fetchall()) == 0

    # Check pic_pet5: should have "Unknown Friendly Parrot" and "Unknown Wild Wolf"
    c.execute("SELECT entity_name FROM entities WHERE photo_id = 5")
    pet5_entities = [r[0] for r in c.fetchall()]
    assert "Unknown Friendly Parrot" in pet5_entities
    assert "Unknown Wild Wolf" in pet5_entities

    conn.close()


def test_scan_worker_deepface_import_warning(monkeypatch):
    import sys
    import importlib
    monkeypatch.setitem(sys.modules, "deepface", None)
    import services.scan_worker
    importlib.reload(services.scan_worker)
    assert services.scan_worker.DEEPFACE_AVAILABLE is False

    # Restore
    monkeypatch.delitem(sys.modules, "deepface")
    importlib.reload(services.scan_worker)
