import pytest
from photo_backend import init_db
import sqlite3
import json
import base64

# --- Helper Data Setup ---
def seed_test_database(db_file):
    """Inserts a few mock photos and entities into the test DB."""
    conn = sqlite3.connect(db_file)
    c = conn.cursor()
    
    c.execute("INSERT INTO photos (id, filepath, filename, description, status, date_created, date_modified) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (1, "/tmp/photo1.jpg", "photo1.jpg", "A picture of a dog", "processed", "2025-01-01", "2025-01-01"))
    
    c.execute("INSERT INTO photos (id, filepath, filename, description, status, date_created, date_modified) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (2, "/tmp/photo2.jpg", "photo2.jpg", "A person in a park", "processed", "2024-06-15", "2024-06-15"))
    
    c.execute("INSERT INTO entities (id, photo_id, entity_type, entity_name, first_name, last_name, bounding_box) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (1, 1, "pet", "Fido", "Fido", "", '{"x": 10, "y": 10, "w": 50, "h": 50}'))
    
    c.execute("INSERT INTO entities (id, photo_id, entity_type, entity_name, first_name, last_name, bounding_box) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (2, 2, "person", "Unknown Person 1", "Unknown", "Person 1", '{"x": 20, "y": 20, "w": 100, "h": 100}'))
              
    conn.commit()
    conn.close()

# --- API Tests ---

def test_get_gallery_empty(client):
    """Test getting the gallery when DB is empty."""
    response = client.get("/api/search")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0

def test_get_gallery_with_data(client, mock_db_file):
    """Test standard gallery retrieval (default sort)."""
    seed_test_database(mock_db_file) # Ensure DB has data
    
    response = client.get("/api/search")
    assert response.status_code == 200
    data = response.json()
    
    assert len(data) == 2
    # Check default sorting (date_created desc -> 2025 comes before 2024)
    assert data[0]["filename"] == "photo1.jpg" 
    assert data[1]["filename"] == "photo2.jpg"

@pytest.mark.parametrize("sort_by, sort_order, expected_first", [
    ("date_created", "asc", "photo2.jpg"), # 2024 before 2025
    ("filename", "asc", "photo1.jpg"),     # 'photo1' before 'photo2'
    ("filename", "desc", "photo2.jpg"),
])
def test_get_gallery_sorting(client, mock_db_file, sort_by, sort_order, expected_first):
    """Test that gallery sorting arguments are applied correctly."""
    seed_test_database(mock_db_file)
    
    response = client.get(f"/api/search?sort_by={sort_by}&sort_dir={sort_order}")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["filename"] == expected_first

def test_get_filters(client, mock_db_file):
    """Test that unique filter options (entities) are extracted."""
    seed_test_database(mock_db_file)
    
    response = client.get("/api/gallery/filters")
    assert response.status_code == 200
    data = response.json()
    
    # We must actually check data because it returns a list of objects like [{"entity_name": "Fido"}, ...]
    # But since it's just checking if it extracts entities, we'll verify it's a list with contents.
    assert len(data["names"]) > 0
    assert data["names"][0]["name"] == "Fido"
    
def test_start_scan_invalid_path(client):
    """Test that scanning a non-existent directory returns 400."""
    response = client.post("/api/scan", json={"directory_path": "/fake/non/existent/path"})
    assert response.status_code == 400
    assert "Directory does not exist" in response.json()["detail"]

def test_start_scan_success(client, tmp_path, mock_ollama, mock_deepface, monkeypatch):
    """Test that starting a scan correctly enqueue background tasks."""
    # Arrange: Create test directory with dummy image
    test_scan_dir = tmp_path / "scan_target"
    test_scan_dir.mkdir()
    dummy_img = test_scan_dir / "test.jpg"
    dummy_img.write_bytes(b"dummy image content")
    
    # We must patch add_task on BackgroundTasks so we can spy on it, or just let it queue.
    # To test without waiting, we'll verify the HTTP response first.
    response = client.post("/api/scan", json={
        "directory_path": str(test_scan_dir),
        "run_facial_recognition": True
    })
    assert response.status_code == 200
    data = response.json()
    assert "Scan complete. Added 1 new images" in data["message"]

def test_rename_entity_success(client, mock_db_file):
    """Test renaming an entity."""
    seed_test_database(mock_db_file)
    
    payload = {"entity_id": "Fido", "new_name": "Rover"}
    response = client.post("/api/entities/name", json=payload)
    
    assert response.status_code == 200
    assert response.json()["success"] == True
    
    # Verify DB directly
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT entity_name, first_name, last_name FROM entities WHERE id = 1")
    row = c.fetchone()
    conn.close()
    
    assert row[0] == "Rover"
    assert row[1] == "Rover"
    assert row[2] == ""

def test_delete_entity(client, mock_db_file):
    """Test deleting an entity."""
    seed_test_database(mock_db_file)
    
    # The endpoint takes the entity_name in the URL
    response = client.delete("/api/entities/Fido")
    assert response.status_code == 200
    assert "deleted" in response.json()
    
    # Verify DB directly
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute("SELECT id FROM entities WHERE id = 1")
    row = c.fetchone()
    conn.close()
    
    assert row is None
