import os
import sqlite3
import pytest

@pytest.fixture(autouse=True)
def setup_test_data(mock_db_file, mock_chromadb):
    """Sets up SQLite and ChromaDB with initial test data."""
    conn = sqlite3.connect(mock_db_file)
    c = conn.cursor()
    
    # Insert photos
    photos = [
        (1, "/photos/dog.jpg", "dog.jpg", "A cute golden retriever playing in the grass.", "processed"),
        (2, "/photos/cat.jpg", "cat.jpg", "A black cat sleeping on a sunny windowsill.", "processed"),
        (3, "/photos/car.jpg", "car.jpg", "A red sports car driving fast on a highway.", "processed"),
    ]
    c.executemany("INSERT INTO photos (id, filepath, filename, description, status) VALUES (?, ?, ?, ?, ?)", photos)
    conn.commit()
    conn.close()

    # Insert semantic data into ChromaDB
    import core.chroma
    photos_collection = core.chroma.get_photos_collection()
    
    # Simplified embeddings for testing
    photos_collection.add(
        documents=[p[3] for p in photos],
        ids=[str(p[0]) for p in photos],
        embeddings=[[0.1] * 384, [0.2] * 384, [0.3] * 384], # Mock embeddings
        metadatas=[{"photo_id": p[0]} for p in photos]
    )
    
    yield

def test_semantic_search_returns_results(client, monkeypatch):
    """Test that searching invokes ChromaDB and returns the expected photo."""
    class MockCollection:
        def query(self, *args, **kwargs):
            return {"ids": [["1"]], "distances": [[0.1]], "embeddings": None, "metadatas": None, "documents": None}
            
    monkeypatch.setattr("core.chroma.get_photos_collection", lambda: MockCollection())
    
    response = client.get("/api/search?q=golden retriever")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == 1
    assert data[0]["filename"] == "dog.jpg"

def test_similar_photos_route(client, monkeypatch):
    """Test the Find Similar Photos endpoint."""
    class MockCollection:
        def query(self, *args, **kwargs):
            return {"ids": [["2", "3"]], "distances": [[0.5, 0.6]], "embeddings": None, "metadatas": None, "documents": None}
        def get(self, *args, **kwargs):
            return {"ids": ["1"], "embeddings": [[0.1] * 384]}
            
    monkeypatch.setattr("core.chroma.get_photos_collection", lambda: MockCollection())
    
    response = client.get("/api/similar/1")
    assert response.status_code == 200
    
    data = response.json()
    # Should exclude itself (id=1), return at most 5 results. In our mock case, it'll return the others.
    assert len(data) == 2
    returned_ids = {p["id"] for p in data}
    assert 1 not in returned_ids
    assert 2 in returned_ids
    assert 3 in returned_ids
