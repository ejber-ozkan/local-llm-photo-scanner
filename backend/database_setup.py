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
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-64000;")
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
            ai_model TEXT,
            scanned_at TEXT
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
    # Table for Local Folder Media (Non-AI)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS local_media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filepath TEXT UNIQUE,
            filename TEXT,
            parent_path TEXT,
            file_size INTEGER,
            file_hash TEXT,
            media_type TEXT, -- 'image' or 'video'
            validation_status TEXT NOT NULL DEFAULT 'unvalidated',
            validation_error TEXT,
            date_taken TEXT,
            date_modified TEXT,
            date_created TEXT,
            date_fallback TEXT,
            year INTEGER,
            month INTEGER,
            day INTEGER,
            width INTEGER,
            height INTEGER,
            duration REAL,
            codec TEXT,
            frame_rate REAL,
            bit_rate INTEGER,
            camera_make TEXT,
            camera_model TEXT,
            lens_model TEXT,
            exposure_time TEXT,
            f_number REAL,
            iso INTEGER,
            focal_length REAL,
            gps_lat REAL,
            gps_lon REAL,
            scanned_at TEXT
        )
    """)
    # Table for folder scan history
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS folder_scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            directory_path TEXT UNIQUE,
            last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Durable scan sessions allow paused scans to survive application restarts.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scan_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_type TEXT NOT NULL,
            root_path TEXT NOT NULL,
            force_rescan INTEGER NOT NULL DEFAULT 0,
            extract_metadata INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            total_count INTEGER NOT NULL DEFAULT 0,
            processed_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS folder_scan_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            filepath TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            processed_at TEXT,
            FOREIGN KEY(session_id) REFERENCES scan_sessions(id),
            UNIQUE(session_id, filepath)
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
        "scanned_at TEXT",
        "scan_session_id INTEGER",
    ]
    import contextlib

    for col in columns_to_add:
        with contextlib.suppress(sqlite3.OperationalError):
            cursor.execute(f"ALTER TABLE photos ADD COLUMN {col}")

    # Migration: Add columns for rich metadata to local_media
    local_media_columns = [
        "width INTEGER",
        "height INTEGER",
        "duration REAL",
        "codec TEXT",
        "frame_rate REAL",
        "bit_rate INTEGER",
        "camera_make TEXT",
        "camera_model TEXT",
        "lens_model TEXT",
        "exposure_time TEXT",
        "f_number REAL",
        "iso INTEGER",
        "focal_length REAL",
        "gps_lat REAL",
        "gps_lon REAL",
        "validation_status TEXT NOT NULL DEFAULT 'unvalidated'",
        "validation_error TEXT",
    ]
    for col in local_media_columns:
        with contextlib.suppress(sqlite3.OperationalError):
            cursor.execute(f"ALTER TABLE local_media ADD COLUMN {col}")

    cursor.execute(
        """
        UPDATE local_media
        SET validation_status = 'invalid_media_stub',
            validation_error = 'File is too small to contain a decodable video stream.'
        WHERE media_type = 'video'
          AND file_size < 1024
          AND validation_status = 'unvalidated'
        """
    )

    # Indexes for folder browsing and duplicate reports. These are safe to
    # create on existing databases and keep exact-hash reporting responsive.
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_local_media_file_hash ON local_media(file_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_local_media_media_type ON local_media(media_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_local_media_date_parts ON local_media(year, month, day)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_local_media_parent_path ON local_media(parent_path)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_photos_file_hash ON photos(file_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_photos_scan_session ON photos(scan_session_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_scan_sessions_type_status ON scan_sessions(scan_type, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_folder_scan_queue_session_status ON folder_scan_queue(session_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entities_photo_id ON entities(photo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entities_entity_name ON entities(entity_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, entity_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_photos_status_date_taken ON photos(status, date_taken)")

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
    conn = sqlite3.connect(DB_TEST_FILE if use_test_db else DB_FILE, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-64000;")
    return conn


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
