import json
import sqlite3

import numpy as np

DB_FILE = "photometadata.db"
DB_TEST_FILE = "test_photometadata.db"


def init_db() -> None:
    """Initialize both the main and test databases.

    This function iterates through the predefined database file paths
    and ensures each is initialized with the correct schema.
    """
    for db in [DB_FILE, DB_TEST_FILE]:
        init_single_db(db)


def init_single_db(db_path: str) -> None:
    """Initialize a single SQLite database with the required schema.

    Creates the `photos`, `entities`, and `scan_history` tables if they
    do not already exist. It also attempts to apply schema migrations
    for updated columns.

    Args:
        db_path (str): The file path to the SQLite database to initialize.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Table for Photos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filepath TEXT UNIQUE,
            filename TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending', -- pending, processed, error, duplicate, screenshot
            file_size INTEGER,
            file_hash TEXT,
            ai_model TEXT
        )
    """)
    # Table for detected entities (People, Pets)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id INTEGER,
            entity_type TEXT, -- 'person' or 'pet'
            entity_name TEXT, -- 'Unknown Person 1', 'Fluffy', 'John'
            first_name TEXT,
            last_name TEXT,
            bounding_box TEXT,
            embedding TEXT, -- JSON array of floats
            FOREIGN KEY(photo_id) REFERENCES photos(id)
        )
    """)
    # Table for scan history
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            directory_path TEXT UNIQUE,
            last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migration: Add columns for filter support
    columns_to_add = [
        "date_taken TEXT",
        "camera_make TEXT",
        "camera_model TEXT",
        "gps_lat REAL",
        "gps_lon REAL",
        "date_created TEXT",
        "date_modified TEXT",
        "file_size INTEGER",
        "file_hash TEXT",
        "ai_model TEXT",
    ]
    import contextlib

    for col in columns_to_add:
        with contextlib.suppress(sqlite3.OperationalError):
            cursor.execute(f"ALTER TABLE photos ADD COLUMN {col}")
    conn.commit()
    conn.close()


def get_connection(use_test_db: bool = False) -> sqlite3.Connection:
    """Get a connection to the specified database.

    Args:
        use_test_db (bool, optional): If True, connects to the test database.
            Defaults to False.

    Returns:
        sqlite3.Connection: An open connection to the target SQLite database.
    """
    return sqlite3.connect(DB_TEST_FILE if use_test_db else DB_FILE)


def find_best_face_match(embedding: list[float], conn: sqlite3.Connection) -> str | None:
    """Find the best matching face for a given embedding in the database.

    Compares the provided face embedding against all known person embeddings
    in the database using cosine distance. If a match within the distance
    threshold is found, the name of the matched entity is returned.

    Args:
        embedding (list[float]): A numerical vector representing the face.
        conn (sqlite3.Connection): An active connection to the SQLite database.

    Returns:
        str | None: The name of the matching entity, or None if no match
            satisfies the threshold.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT entity_name, embedding FROM entities WHERE entity_type = 'person'")
    known_faces = cursor.fetchall()

    best_match_name = None
    best_distance = float("inf")
    THRESHOLD = 0.40  # Typical threshold for VGG-Face cosine distance

    emb_array = np.array(embedding)
    emb_norm = np.linalg.norm(emb_array)
    if emb_norm == 0:
        return None

    for k_name, k_emb_json in known_faces:
        if not k_emb_json:
            continue
        try:
            k_emb = np.array(json.loads(k_emb_json))
            k_norm = np.linalg.norm(k_emb)
            if k_norm == 0:
                continue

            # Cosine distance
            distance = 1 - np.dot(emb_array, k_emb) / (emb_norm * k_norm)
            if distance < best_distance:
                best_distance = distance
                best_match_name = k_name
        except Exception:
            pass

    if best_distance < THRESHOLD:
        return best_match_name
    return None
