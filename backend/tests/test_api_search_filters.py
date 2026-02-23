import sqlite3


def test_search_filters(client, mock_db_file):
    """Test every filter parameter in /api/search."""
    # Add dummy test data
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    c.execute(
        "INSERT INTO photos (id, filepath, filename, description, status, date_taken, date_modified, ai_model, camera_make, camera_model) VALUES (1, '/p/1.jpg', 'photo1.jpg', 'dog jumping', 'processed', '2024-05-01', '2024-05-01', 'm1', 'Nikon', 'D850')"
    )
    c.execute(
        "INSERT INTO photos (id, filepath, filename, description, status, date_taken, date_modified, ai_model) VALUES (2, '/p/2.jpg', 'photo2.jpg', 'cat', 'processed', '2025-05-01', '2025-05-01', 'm1')"
    )

    c.execute("INSERT INTO entities (photo_id, entity_type, entity_name) VALUES (1, 'person', 'John Doe')")
    c.execute("INSERT INTO entities (photo_id, entity_type, entity_name) VALUES (2, 'person', 'Unknown Person 1')")

    conn.commit()
    conn.close()

    # 1. Name search (entity name)
    assert len(client.get("/api/search?name=John Doe").json()) == 1

    # 2. Date from / to
    assert len(client.get("/api/search?date_from=2024-01-01&date_to=2024-12-31").json()) == 1

    # 3. Text query (description)
    assert len(client.get("/api/search?q=dog").json()) == 1

    # 4. Camera make + model
    assert len(client.get("/api/search?camera=Nikon D850").json()) == 1

    # 5. Entity type
    assert len(client.get("/api/search?entity_type=person").json()) > 0

    # 6. Boolean flags (has_faces and unidentified)
    assert len(client.get("/api/search?has_faces=true").json()) == 2
    assert len(client.get("/api/search?unidentified=true").json()) == 1
