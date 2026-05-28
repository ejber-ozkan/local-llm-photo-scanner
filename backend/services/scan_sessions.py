"""
Durable scan session helpers.

These helpers keep pause/resume state in SQLite so interrupted scans can be
picked up after the backend process exits.
"""

import sqlite3
from typing import Any

RUNNING_STATUSES = {"running", "paused"}
TERMINAL_STATUSES = {"completed", "cancelled", "failed"}


def create_scan_session(
    conn: sqlite3.Connection,
    scan_type: str,
    root_path: str,
    *,
    force_rescan: bool = False,
    extract_metadata: bool = False,
    total_count: int = 0,
    status: str = "running",
) -> int:
    """Create a durable scan session and return its id."""
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO scan_sessions (
            scan_type, root_path, force_rescan, extract_metadata,
            status, total_count, processed_count
        ) VALUES (?, ?, ?, ?, ?, ?, 0)
        """,
        (scan_type, root_path, int(force_rescan), int(extract_metadata), status, total_count),
    )
    conn.commit()
    return int(cursor.lastrowid)


def get_resumable_session(conn: sqlite3.Connection, scan_type: str) -> dict[str, Any] | None:
    """Return the newest running/paused scan session of a given type."""
    row = conn.execute(
        """
        SELECT id, scan_type, root_path, force_rescan, extract_metadata, status,
               total_count, processed_count
        FROM scan_sessions
        WHERE scan_type = ?
          AND status IN ('running', 'paused')
        ORDER BY id DESC
        LIMIT 1
        """,
        (scan_type,),
    ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "scan_type": row[1],
        "root_path": row[2],
        "force_rescan": bool(row[3]),
        "extract_metadata": bool(row[4]),
        "status": row[5],
        "total_count": int(row[6] or 0),
        "processed_count": int(row[7] or 0),
    }


def set_session_status(conn: sqlite3.Connection, session_id: int, status: str) -> None:
    """Update a scan session status and timestamps."""
    completed_sql = ", completed_at = CURRENT_TIMESTAMP" if status in TERMINAL_STATUSES else ""
    conn.execute(
        f"""
        UPDATE scan_sessions
        SET status = ?, updated_at = CURRENT_TIMESTAMP{completed_sql}
        WHERE id = ?
        """,
        (status, session_id),
    )
    conn.commit()


def update_folder_session_counts(conn: sqlite3.Connection, session_id: int) -> tuple[int, int]:
    """Refresh total/processed counts for a folder scan session."""
    total = conn.execute(
        "SELECT COUNT(*) FROM folder_scan_queue WHERE session_id = ?",
        (session_id,),
    ).fetchone()[0]
    processed = conn.execute(
        """
        SELECT COUNT(*)
        FROM folder_scan_queue
        WHERE session_id = ?
          AND status IN ('processed', 'error', 'skipped')
        """,
        (session_id,),
    ).fetchone()[0]
    conn.execute(
        """
        UPDATE scan_sessions
        SET total_count = ?, processed_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (total, processed, session_id),
    )
    conn.commit()
    return int(total), int(processed)


def recover_interrupted_sessions(conn: sqlite3.Connection) -> None:
    """Convert in-flight work to paused/pending after a backend restart."""
    conn.execute(
        """
        UPDATE folder_scan_queue
        SET status = 'pending', error = NULL
        WHERE status = 'processing'
        """
    )
    conn.execute(
        """
        UPDATE scan_sessions
        SET status = 'paused', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'running'
        """
    )
    conn.commit()
