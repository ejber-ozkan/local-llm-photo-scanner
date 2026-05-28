import os
import sqlite3
import subprocess
from datetime import datetime

from database_setup import init_single_db
import services.folder_scan_worker as folder_scan_worker
from api.routes import folder_scan
from services.scan_sessions import recover_interrupted_sessions
from services.folder_scan_worker import background_folder_processor, extract_media_date, validate_video_stream


def test_extract_media_date_fallbacks(tmp_path, monkeypatch):
    """Verifies the Date Fallback Strategy prioritizes dates correctly."""
    # 1. Test image with file modification fallback
    test_img = tmp_path / "photo.jpg"
    test_img.write_bytes(b"image bytes")

    # Force mock mtime
    mtime = datetime(2023, 5, 24, 10, 30, 0).timestamp()
    os.utime(test_img, (mtime, mtime))

    date_taken, date_modified, date_created, source, year, month, day = extract_media_date(str(test_img), "image")
    assert year == 2023
    assert month == 5
    assert day == 24
    assert source == "date_modified"

    # 2. Test filename pattern fallback (e.g. YYYY-MM-DD)
    test_pattern_img = tmp_path / "DSC_2024-12-25_001.jpg"
    test_pattern_img.write_bytes(b"image bytes")

    # Mock os.path.getmtime and os.path.getctime to raise exception to trigger other fallbacks
    orig_getmtime = os.path.getmtime
    orig_getctime = os.path.getctime

    def mock_getmtime(path):
        if "DSC_2024-12-25" in os.path.basename(path):
            raise OSError("Mocked error")
        return orig_getmtime(path)

    def mock_getctime(path):
        if "DSC_2024-12-25" in os.path.basename(path):
            raise OSError("Mocked error")
        return orig_getctime(path)

    monkeypatch.setattr(os.path, "getmtime", mock_getmtime)
    monkeypatch.setattr(os.path, "getctime", mock_getctime)

    date_taken, date_modified, date_created, source, year, month, day = extract_media_date(str(test_pattern_img), "image")
    assert year == 2024
    assert month == 12
    assert day == 25
    assert source == "filename_pattern"


def test_background_folder_processor(mock_db_file, tmp_path, monkeypatch):
    """Tests the background walker and database ingestion logic."""
    # Arrange: Create directories with media files
    scan_dir = tmp_path / "my_photos"
    scan_dir.mkdir()

    img_file = scan_dir / "holiday_2022-08-15.jpg"
    img_file.write_bytes(b"dummy image bytes")

    video_file = scan_dir / "beach.mp4"
    video_file.write_bytes(b"dummy video bytes")

    # Mock file times
    mtime = datetime(2021, 6, 1, 12, 0, 0).timestamp()
    os.utime(video_file, (mtime, mtime))

    # Mock getmtime and getctime to fail for holiday image
    orig_getmtime = os.path.getmtime
    orig_getctime = os.path.getctime

    def mock_getmtime_processor(path):
        if "holiday" in os.path.basename(path):
            raise OSError("Mocked error")
        return orig_getmtime(path)

    def mock_getctime_processor(path):
        if "holiday" in os.path.basename(path):
            raise OSError("Mocked error")
        return orig_getctime(path)

    monkeypatch.setattr(os.path, "getmtime", mock_getmtime_processor)
    monkeypatch.setattr(os.path, "getctime", mock_getctime_processor)

    # Act: Process directory
    background_folder_processor(str(scan_dir), mock_db_file, force_rescan=True)

    # Assert: DB contains both files
    conn = sqlite3.connect(mock_db_file)
    cursor = conn.cursor()
    cursor.execute("SELECT filepath, filename, media_type, year, month, day, date_fallback FROM local_media ORDER BY filename")
    rows = cursor.fetchall()
    conn.close()

    assert len(rows) == 2
    # Verify video file
    assert rows[0][1] == "beach.mp4"
    assert rows[0][2] == "video"
    assert rows[0][3] == 2021 # modified date fallback

    # Verify image file
    assert rows[1][1] == "holiday_2022-08-15.jpg"
    assert rows[1][2] == "image"
    assert rows[1][3] == 2022 # filename pattern fallback
    assert rows[1][6] == "filename_pattern"


def test_validate_video_stream_rejects_empty_container_stub(tmp_path):
    """Empty MP4 containers are not valid video media."""
    stub_file = tmp_path / "empty.mp4"
    stub_file.write_bytes(b"\x00\x00\x00\x14ftypqt  \x00\x00\x02\x00qt  \x00\x00\x00\x08wide\x00\x00\x00\x00mdat")

    validation_status, validation_error = validate_video_stream(str(stub_file))

    assert validation_status == "invalid_media_stub"
    assert "video stream" in validation_error.lower()


def test_validate_video_stream_does_not_probe_tiny_container_stub(tmp_path, monkeypatch):
    """Trivial container stubs are rejected without invoking FFmpeg."""
    stub_file = tmp_path / "empty.mp4"
    stub_file.write_bytes(b"\x00\x00\x00\x14ftypqt  \x00\x00\x02\x00qt  \x00\x00\x00\x08wide\x00\x00\x00\x00mdat")

    def fail_get_ffmpeg_path():
        raise AssertionError("Tiny stubs should not be decoded.")

    monkeypatch.setattr(folder_scan_worker, "get_ffmpeg_path", fail_get_ffmpeg_path)

    validation_status, _ = validate_video_stream(str(stub_file))

    assert validation_status == "invalid_media_stub"


def test_validate_video_stream_marks_ffmpeg_failure_as_invalid(tmp_path, monkeypatch):
    """FFmpeg probe failures classify videos as invalid without blocking the scan."""
    video_file = tmp_path / "broken.mov"
    video_file.write_bytes(b"0" * 2048)

    def fake_run(*_args, **_kwargs):
        return subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="moov atom not found",
        )

    monkeypatch.setattr(folder_scan_worker, "get_ffmpeg_path", lambda: "ffmpeg")
    monkeypatch.setattr(folder_scan_worker.subprocess, "run", fake_run)

    validation_status, validation_error = validate_video_stream(str(video_file))

    assert validation_status == "invalid_media_stub"
    assert "moov atom not found" in validation_error


def test_validate_video_stream_times_out_without_invalidating_media(tmp_path, monkeypatch):
    """Slow probes are bounded so one awkward video cannot stall the whole scan."""
    video_file = tmp_path / "slow.mov"
    video_file.write_bytes(b"0" * 2048)

    def fake_run(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd="ffmpeg", timeout=10)

    monkeypatch.setattr(folder_scan_worker, "get_ffmpeg_path", lambda: "ffmpeg")
    monkeypatch.setattr(folder_scan_worker.subprocess, "run", fake_run)

    validation_status, validation_error = validate_video_stream(str(video_file))

    assert validation_status == "unvalidated"
    assert "timed out" in validation_error.lower()


def test_heic_preview_conversion_does_not_create_local_sidecar(tmp_path, monkeypatch):
    """Folder image previews convert in memory without writing a local JPEG."""
    from PIL import Image

    heic_file = tmp_path / "IMG_0158.HEIC"
    Image.new("RGB", (4, 4), color="blue").save(heic_file, "JPEG")
    sidecar_file = tmp_path / "IMG_0158.HEIC.jpg"

    monkeypatch.setattr(folder_scan, "HEIC_EXTENSIONS", {".heic"})

    response = folder_scan._serve_image_preview(str(heic_file))

    assert response.media_type == "image/jpeg"
    assert response.body
    assert not sidecar_file.exists()


def test_database_migration_creates_durable_scan_tables(tmp_path):
    """Database initialization adds persistent scan session and queue storage."""
    db_file = tmp_path / "durable_scans.db"

    init_single_db(str(db_file))

    conn = sqlite3.connect(db_file)
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scan_sessions', 'folder_scan_queue')"
        )
    }
    photo_columns = {row[1] for row in conn.execute("PRAGMA table_info(photos)")}
    conn.close()

    assert tables == {"scan_sessions", "folder_scan_queue"}
    assert "scan_session_id" in photo_columns


def test_folder_scan_can_resume_from_persisted_queue(mock_db_file, tmp_path, monkeypatch):
    """A paused folder scan can continue from persisted queue rows after worker memory is gone."""
    scan_dir = tmp_path / "resume_photos"
    scan_dir.mkdir()
    first = scan_dir / "first_2024-01-01.jpg"
    second = scan_dir / "second_2024-01-02.jpg"
    first.write_bytes(b"first image bytes")
    second.write_bytes(b"second image bytes")

    original_calculate_md5 = folder_scan_worker.calculate_md5
    seen_files = []

    def stop_after_first(filepath):
        seen_files.append(filepath)
        if len(seen_files) == 1:
            folder_scan_worker.state.FOLDER_SCAN_STATE = "idle"
        return original_calculate_md5(filepath)

    monkeypatch.setattr(folder_scan_worker, "calculate_md5", stop_after_first)

    background_folder_processor(str(scan_dir), mock_db_file, force_rescan=True)

    conn = sqlite3.connect(mock_db_file)
    session = conn.execute(
        "SELECT id, status, total_count, processed_count FROM scan_sessions WHERE scan_type = 'folder'"
    ).fetchone()
    queue_statuses = [row[0] for row in conn.execute("SELECT status FROM folder_scan_queue ORDER BY filepath")]
    media_count = conn.execute("SELECT COUNT(*) FROM local_media").fetchone()[0]
    conn.close()

    assert session is not None
    assert session[1] == "paused"
    assert session[2] == 2
    assert session[3] == 1
    assert queue_statuses.count("processed") == 1
    assert queue_statuses.count("pending") == 1
    assert media_count == 1

    monkeypatch.setattr(folder_scan_worker, "calculate_md5", original_calculate_md5)
    folder_scan_worker.state.FOLDER_SCAN_STATE = "running"
    background_folder_processor(str(scan_dir), mock_db_file, session_id=session[0])

    conn = sqlite3.connect(mock_db_file)
    final_session = conn.execute("SELECT status, total_count, processed_count FROM scan_sessions WHERE id = ?", (session[0],)).fetchone()
    final_queue_statuses = [row[0] for row in conn.execute("SELECT status FROM folder_scan_queue ORDER BY filepath")]
    final_media_count = conn.execute("SELECT COUNT(*) FROM local_media").fetchone()[0]
    conn.close()

    assert final_session == ("completed", 2, 2)
    assert final_queue_statuses == ["processed", "processed"]
    assert final_media_count == 2


def test_startup_recovery_marks_running_sessions_paused(mock_db_file):
    """A backend restart leaves durable work resumable rather than pretending it is running."""
    conn = sqlite3.connect(mock_db_file)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO scan_sessions (scan_type, root_path, status, total_count, processed_count)
        VALUES ('folder', 'F:\\My Pictures', 'running', 2, 0)
        """
    )
    session_id = cursor.lastrowid
    cursor.execute(
        """
        INSERT INTO folder_scan_queue (session_id, filepath, status)
        VALUES (?, 'F:\\My Pictures\\IMG_0158.HEIC', 'processing')
        """,
        (session_id,),
    )
    conn.commit()

    recover_interrupted_sessions(conn)

    session_status = conn.execute("SELECT status FROM scan_sessions WHERE id = ?", (session_id,)).fetchone()[0]
    queue_status = conn.execute("SELECT status FROM folder_scan_queue WHERE session_id = ?", (session_id,)).fetchone()[0]
    conn.close()

    assert session_status == "paused"
    assert queue_status == "pending"


def test_database_migration_classifies_existing_tiny_video_stub(tmp_path):
    """Existing obvious video stubs are available in the invalid category after upgrade."""
    db_file = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_file)
    conn.execute(
        """
        CREATE TABLE local_media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filepath TEXT UNIQUE,
            filename TEXT,
            parent_path TEXT,
            file_size INTEGER,
            file_hash TEXT,
            media_type TEXT,
            date_taken TEXT,
            date_modified TEXT,
            date_created TEXT,
            date_fallback TEXT,
            year INTEGER,
            month INTEGER,
            day INTEGER,
            scanned_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO local_media (
            filepath, filename, parent_path, file_size, file_hash, media_type, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("F:\\Pictures\\empty.mp4", "empty.mp4", "F:\\Pictures", 36, "stub-hash", "video", "2026-05-24"),
    )
    conn.commit()
    conn.close()

    init_single_db(str(db_file))

    conn = sqlite3.connect(db_file)
    row = conn.execute("SELECT validation_status, validation_error FROM local_media").fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "invalid_media_stub"
    assert "too small" in row[1].lower()


def test_background_folder_processor_records_invalid_video_stub(mock_db_file, tmp_path):
    """Scanned videos without a decodable stream are marked as invalid stubs."""
    scan_dir = tmp_path / "stub_videos"
    scan_dir.mkdir()
    stub_file = scan_dir / "empty.mp4"
    stub_file.write_bytes(b"\x00\x00\x00\x14ftypqt  \x00\x00\x02\x00qt  \x00\x00\x00\x08wide\x00\x00\x00\x00mdat")

    background_folder_processor(str(scan_dir), mock_db_file, force_rescan=True)

    conn = sqlite3.connect(mock_db_file)
    row = conn.execute(
        "SELECT validation_status, validation_error FROM local_media WHERE filename = ?",
        ("empty.mp4",),
    ).fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "invalid_media_stub"
    assert "video stream" in row[1].lower()


def seed_folders_test_db(db_file, scan_dir):
    """Helper to seed the test db with folder explorer records."""
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Insert scanned directories history
    cursor.execute(
        "INSERT OR REPLACE INTO folder_scan_history (directory_path) VALUES (?)",
        (str(scan_dir),)
    )

    # Insert media
    cursor.execute(
        """
        INSERT OR REPLACE INTO local_media (
            filepath, filename, parent_path, file_size, file_hash, media_type,
            date_taken, date_fallback, year, month, day, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(scan_dir / "pic1.png"),
            "pic1.png",
            str(scan_dir),
            1024,
            "hash123",
            "image",
            "2023-05-24 10:00:00",
            "date_modified",
            2023,
            5,
            24,
            "2023-05-24 11:00:00"
        )
    )
    conn.commit()
    conn.close()


def test_api_folder_scan_explorer(client, mock_db_file, tmp_path):
    """Tests explorer endpoints for listing root folders and directory traversal."""
    scan_dir = tmp_path / "vacation"
    scan_dir.mkdir()
    sub_dir = scan_dir / "day1"
    sub_dir.mkdir()

    seed_folders_test_db(mock_db_file, scan_dir)

    # 1. Test listing Roots (empty path parameter)
    response = client.get("/api/folder-scan/explorer")
    assert response.status_code == 200
    data = response.json()
    assert str(scan_dir) in data["directories"]

    # 2. Test traversing inside directory
    response = client.get(f"/api/folder-scan/explorer?path={str(scan_dir)}")
    assert response.status_code == 200
    data = response.json()
    assert str(sub_dir) in data["directories"]
    assert len(data["files"]) == 1
    assert data["files"][0]["filename"] == "pic1.png"


def test_api_folder_scan_dates(client, mock_db_file, tmp_path):
    """Tests drilling down hierarchical dates (Year -> Month -> Day -> Files)."""
    scan_dir = tmp_path / "photos"
    scan_dir.mkdir()
    seed_folders_test_db(mock_db_file, scan_dir)

    # 1. Fetch Years list
    response = client.get("/api/folder-scan/dates")
    assert response.status_code == 200
    assert response.json() == [{"label": "2023", "value": 2023, "count": 1}]

    # 2. Fetch Months list in 2023
    response = client.get("/api/folder-scan/dates?year=2023")
    assert response.status_code == 200
    assert response.json() == [{"label": "May", "value": 5, "count": 1}]

    # 3. Fetch Days list in May 2023
    response = client.get("/api/folder-scan/dates?year=2023&month=5")
    assert response.status_code == 200
    assert response.json() == [{"label": "24", "value": 24, "count": 1}]

    # 4. Fetch Files on 2023-05-24
    response = client.get("/api/folder-scan/dates?year=2023&month=5&day=24")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["filename"] == "pic1.png"


def test_api_folder_scan_dates_excludes_invalid_stubs_until_requested(client, mock_db_file, tmp_path):
    """Ordinary timeline views hide invalid stubs while the stub category exposes them."""
    scan_dir = tmp_path / "timeline_stubs"
    scan_dir.mkdir()
    conn = sqlite3.connect(mock_db_file)
    conn.execute(
        """
        INSERT INTO local_media (
            filepath, filename, parent_path, file_size, file_hash, media_type, validation_status,
            date_taken, date_fallback, year, month, day, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(scan_dir / "empty.mp4"),
            "empty.mp4",
            str(scan_dir),
            36,
            "stub-timeline-hash",
            "video",
            "invalid_media_stub",
            "2023-05-24 10:00:00",
            "date_taken",
            2023,
            5,
            24,
            "2024-07-01 12:00:00",
        ),
    )
    conn.commit()
    conn.close()

    assert client.get("/api/folder-scan/dates").json() == []
    assert client.get("/api/folder-scan/dates?media_types=video").json() == []
    assert client.get("/api/folder-scan/dates?media_types=invalid_media_stub").json() == [
        {"label": "2023", "value": 2023, "count": 1}
    ]


def test_api_folder_scan_search_and_duplicates(client, mock_db_file, tmp_path):
    """Tests searching and duplicates resolution APIs."""
    scan_dir = tmp_path / "photos"
    scan_dir.mkdir()
    seed_folders_test_db(mock_db_file, scan_dir)

    # Test Search
    response = client.get("/api/folder-scan/search?q=pic")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["filename"] == "pic1.png"

    # Test Duplicates lookup
    response = client.get("/api/folder-scan/duplicates/1")
    assert response.status_code == 200
    data = response.json()
    assert "local_duplicates" in data
    assert "gallery_duplicates" in data


def seed_duplicate_report_db(db_file, scan_dir):
    """Helper to seed exact duplicate groups for report endpoints."""
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    rows = [
        ("dup-a-1.jpg", "hash-a", 100, "image", "valid", "2024-05-24 10:00:00", 2024, 5, 24),
        ("dup-a-2.jpg", "hash-a", 100, "image", "valid", "2024-05-24 11:00:00", 2024, 5, 24),
        ("dup-b-1.mp4", "hash-b", 200, "video", "valid", "2023-01-05 09:00:00", 2023, 1, 5),
        ("dup-b-2.mp4", "hash-b", 200, "video", "valid", "2023-01-05 10:00:00", 2023, 1, 5),
        ("stub-1.mp4", "hash-stub", 36, "video", "invalid_media_stub", "2020-01-01 08:00:00", 2020, 1, 1),
        ("stub-2.mp4", "hash-stub", 36, "video", "invalid_media_stub", "2021-01-01 08:00:00", 2021, 1, 1),
        ("single-stub.mp4", "hash-single-stub", 36, "video", "invalid_media_stub", "2022-01-01 08:00:00", 2022, 1, 1),
        ("unique.jpg", "hash-unique", 300, "image", "valid", "2024-06-01 08:00:00", 2024, 6, 1),
        ("missing-hash.jpg", None, 400, "image", "valid", "2024-06-02 08:00:00", 2024, 6, 2),
    ]

    for filename, file_hash, size, media_type, validation_status, date_taken, year, month, day in rows:
        cursor.execute(
            """
            INSERT INTO local_media (
                filepath, filename, parent_path, file_size, file_hash, media_type,
                validation_status, date_taken, date_fallback, year, month, day, scanned_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(scan_dir / filename),
                filename,
                str(scan_dir),
                size,
                file_hash,
                media_type,
                validation_status,
                date_taken,
                "date_taken",
                year,
                month,
                day,
                "2024-07-01 12:00:00",
            ),
        )

    conn.commit()
    conn.close()


def test_api_duplicate_report_groups_exact_hashes(client, mock_db_file, tmp_path):
    """The duplicate report returns only file-hash duplicate groups."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/duplicates/report")

    assert response.status_code == 200
    data = response.json()
    assert data["match_type"] == "exact_hash"
    assert data["summary"] == {
        "group_count": 2,
        "file_count": 4,
        "total_bytes": 600,
        "wasted_bytes": 300,
    }
    assert [group["file_hash"] for group in data["groups"]] == ["hash-b", "hash-a"]
    assert data["groups"][0]["files"][0]["filename"] == "dup-b-1.mp4"


def test_api_duplicate_report_filters_by_media_type_and_date(client, mock_db_file, tmp_path):
    """Duplicate report filters apply before file-hash grouping."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/duplicates/report?media_type=image&year=2024&month=5&day=24")

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["group_count"] == 1
    assert data["summary"]["file_count"] == 2
    assert data["groups"][0]["file_hash"] == "hash-a"
    assert {file["media_type"] for file in data["groups"][0]["files"]} == {"image"}


def test_api_timeline_files_include_clickable_duplicate_count(client, mock_db_file, tmp_path):
    """Timeline file cards receive the count of eligible duplicate locations."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/dates?year=2024&month=5&day=24&media_types=image")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {file["duplicate_count"] for file in data} == {1}


def test_api_duplicate_report_excludes_invalid_video_stubs(client, mock_db_file, tmp_path):
    """Exact duplicates do not present invalid videos as real duplicate media."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/duplicates/report")

    assert response.status_code == 200
    hashes = {group["file_hash"] for group in response.json()["groups"]}
    assert "hash-stub" not in hashes


def test_api_invalid_media_stub_report_includes_single_and_duplicate_stubs(client, mock_db_file, tmp_path):
    """Invalid media stubs appear only in their dedicated report category."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/duplicates/report?category=invalid_media_stub")

    assert response.status_code == 200
    data = response.json()
    assert data["match_type"] == "invalid_media_stub"
    assert data["summary"]["file_count"] == 3
    assert {group["file_hash"] for group in data["groups"]} == {"hash-stub", "hash-single-stub"}
    assert all(group["match_type"] == "invalid_media_stub" for group in data["groups"])


def test_api_invalid_media_stub_has_no_duplicate_locations(client, mock_db_file, tmp_path):
    """An invalid video is not advertised as a duplicate from file actions."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)
    conn = sqlite3.connect(mock_db_file)
    stub_id = conn.execute("SELECT id FROM local_media WHERE filename = ?", ("stub-1.mp4",)).fetchone()[0]
    conn.close()

    response = client.get(f"/api/folder-scan/duplicates/{stub_id}")

    assert response.status_code == 200
    assert response.json() == {"local_duplicates": [], "gallery_duplicates": []}


def test_api_duplicate_report_csv_export_uses_same_filters(client, mock_db_file, tmp_path):
    """CSV export emits one file row per duplicate item in the filtered report."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/duplicates/report.csv?media_type=video")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    csv_text = response.text
    assert '"match_type","file_hash","group_count"' in csv_text
    assert '"exact_hash","hash-b","2"' in csv_text
    assert "dup-b-1.mp4" in csv_text
    assert "dup-a-1.jpg" not in csv_text


def test_api_invalid_media_stub_csv_excludes_valid_media(client, mock_db_file, tmp_path):
    """Stub CSV export includes invalid entries without valid duplicates."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    seed_duplicate_report_db(mock_db_file, scan_dir)

    response = client.get("/api/folder-scan/duplicates/report.csv?category=invalid_media_stub")

    assert response.status_code == 200
    assert '"invalid_media_stub","hash-stub"' in response.text
    assert "stub-1.mp4" in response.text
    assert "dup-b-1.mp4" not in response.text


def test_api_duplicate_report_csv_quotes_special_characters(client, mock_db_file, tmp_path):
    """CSV export handles paths and filenames containing quotes and delimiters."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    conn = sqlite3.connect(mock_db_file)
    cursor = conn.cursor()

    for filename in ['quote "one", file.jpg', 'quote "two", file.jpg']:
        cursor.execute(
            """
            INSERT INTO local_media (
                filepath, filename, parent_path, file_size, file_hash, media_type,
                date_taken, date_fallback, year, month, day, scanned_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(scan_dir / filename),
                filename,
                str(scan_dir),
                100,
                "quoted-hash",
                "image",
                "2024-05-24 10:00:00",
                "date_taken",
                2024,
                5,
                24,
                "2024-07-01 12:00:00",
            ),
        )

    conn.commit()
    conn.close()

    response = client.get("/api/folder-scan/duplicates/report.csv")

    assert response.status_code == 200
    assert '"quote ""one"", file.jpg"' in response.text


def test_api_duplicate_report_csv_removes_nul_bytes_from_metadata(client, mock_db_file, tmp_path):
    """CSV export handles EXIF strings terminated with a NUL byte."""
    scan_dir = tmp_path / "duplicates"
    scan_dir.mkdir()
    conn = sqlite3.connect(mock_db_file)
    cursor = conn.cursor()

    for filename in ["nul-one.jpg", "nul-two.jpg"]:
        cursor.execute(
            """
            INSERT INTO local_media (
                filepath, filename, parent_path, file_size, file_hash, media_type,
                date_taken, date_fallback, year, month, day, scanned_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(scan_dir / filename),
                filename,
                str(scan_dir),
                100,
                "nul-hash",
                "image",
                "2024:05:24 10:00:00\x00",
                "date_taken",
                2024,
                5,
                24,
                "2024-07-01 12:00:00",
            ),
        )

    conn.commit()
    conn.close()

    response = client.get("/api/folder-scan/duplicates/report.csv")

    assert response.status_code == 200
    assert "\x00" not in response.text
    assert '"2024:05:24 10:00:00"' in response.text


def test_api_duplicate_report_paginates_groups(client, mock_db_file, tmp_path):
    """Duplicate report pagination limits returned groups without changing summary totals."""
    scan_dir = tmp_path / "many_duplicates"
    scan_dir.mkdir()
    conn = sqlite3.connect(mock_db_file)
    cursor = conn.cursor()

    for group_idx in range(12):
        file_hash = f"hash-{group_idx:02d}"
        for copy_idx in range(2):
            filename = f"dup-{group_idx:02d}-{copy_idx}.jpg"
            cursor.execute(
                """
                INSERT INTO local_media (
                    filepath, filename, parent_path, file_size, file_hash, media_type,
                    date_taken, date_fallback, year, month, day, scanned_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(scan_dir / filename),
                    filename,
                    str(scan_dir),
                    100,
                    file_hash,
                    "image",
                    "2024-05-24 10:00:00",
                    "date_taken",
                    2024,
                    5,
                    24,
                    "2024-07-01 12:00:00",
                ),
            )
    conn.commit()
    conn.close()

    response = client.get("/api/folder-scan/duplicates/report?page=2&page_size=10")

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["group_count"] == 12
    assert data["summary"]["file_count"] == 24
    assert data["pagination"] == {
        "page": 2,
        "page_size": 10,
        "total_groups": 12,
        "total_pages": 2,
        "has_next": False,
        "has_previous": True,
    }
    assert len(data["groups"]) == 2


def test_background_folder_processor_with_rich_metadata(mock_db_file, tmp_path):
    """Tests that folder scanning with extract_metadata=True parses fields without error."""
    scan_dir = tmp_path / "rich_photos"
    scan_dir.mkdir()

    img_file = scan_dir / "sunset.jpg"
    img_file.write_bytes(b"dummy image")

    background_folder_processor(str(scan_dir), mock_db_file, force_rescan=True, extract_metadata=True)

    conn = sqlite3.connect(mock_db_file)
    cursor = conn.cursor()
    cursor.execute("SELECT width, camera_model FROM local_media WHERE filename = 'sunset.jpg'")
    row = cursor.fetchone()
    conn.close()

    # Since it's a dummy file, the rich metadata extraction will fail gracefully and write None
    assert row is not None
    assert row[0] is None
    assert row[1] is None


def test_api_folder_scan_dates_filtering(client, mock_db_file, tmp_path):
    """Tests that the Dates Explorer API correctly filters by date range and media types."""
    scan_dir = tmp_path / "photos"
    scan_dir.mkdir()
    seed_folders_test_db(mock_db_file, scan_dir)

    # pic1.png in seed_folders_test_db is at 2023-05-24, type 'image'

    # 1. Check inside range
    response = client.get("/api/folder-scan/dates?from_date=2023-05-01&to_date=2023-05-31")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["value"] == 2023

    # 2. Check out of range (from_date too late)
    response = client.get("/api/folder-scan/dates?from_date=2023-06-01")
    assert response.status_code == 200
    assert len(response.json()) == 0

    # 3. Check out of range (to_date too early)
    response = client.get("/api/folder-scan/dates?to_date=2023-05-20")
    assert response.status_code == 200
    assert len(response.json()) == 0

    # 4. Check media type matches
    response = client.get("/api/folder-scan/dates?media_types=image")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # 5. Check media type mismatch
    response = client.get("/api/folder-scan/dates?media_types=video")
    assert response.status_code == 200
    assert len(response.json()) == 0
