"""
API routes for recursive local folder media scanning and hierarchical browsing.
"""

import asyncio
import csv
import io
import os
import sqlite3
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from PIL import Image, ImageOps
from pydantic import BaseModel

import core.state as state
from core.config import DB_FILE
from core.database import get_db
from core.ffmpeg_check import get_ffmpeg_path, get_ffmpeg_preset
from services.folder_scan_worker import background_folder_processor
from services.scan_sessions import get_resumable_session, set_session_status

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

router = APIRouter()

DUPLICATE_REPORT_MATCH_TYPE = "exact_hash"
DUPLICATE_REPORT_INVALID_MEDIA_STUB = "invalid_media_stub"
DUPLICATE_REPORT_CATEGORIES = {DUPLICATE_REPORT_MATCH_TYPE, DUPLICATE_REPORT_INVALID_MEDIA_STUB}
DUPLICATE_REPORT_PAGE_SIZES = {10, 20, 50}
DUPLICATE_REPORT_DEFAULT_PAGE_SIZE = 10
HEIC_EXTENSIONS = {".heic", ".heif"}

NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}

LOCAL_DUPLICATE_COUNT_SQL = """
CASE
    WHEN lm.file_hash IS NULL
         OR lm.file_hash = ''
         OR (lm.media_type = 'video' AND lm.validation_status != 'valid')
        THEN 0
    ELSE (
        SELECT COUNT(*)
        FROM local_media AS duplicate_media
        WHERE duplicate_media.file_hash = lm.file_hash
          AND duplicate_media.filepath != lm.filepath
          AND (
              duplicate_media.media_type != 'video'
              OR duplicate_media.validation_status = 'valid'
          )
    ) + (
        SELECT COUNT(*)
        FROM photos AS duplicate_photo
        WHERE duplicate_photo.file_hash = lm.file_hash
    )
END
"""


def _csv_safe_row(values: list[Any]) -> list[Any]:
    """Remove NUL bytes that Python's CSV writer cannot serialize."""
    return [
        value.replace("\x00", "") if isinstance(value, str) else value
        for value in values
    ]


def _ensure_scanned_media_access(normalized_path: str, db: sqlite3.Connection) -> None:
    """Ensure a file belongs to a scanned dataset before serving it."""
    cursor = db.cursor()
    cursor.execute("SELECT 1 FROM local_media WHERE filepath = ? LIMIT 1", (normalized_path,))
    in_local = cursor.fetchone()

    if in_local:
        return

    cursor.execute("SELECT 1 FROM photos WHERE filepath = ? LIMIT 1", (normalized_path,))
    in_gallery = cursor.fetchone()
    if not in_gallery:
        raise HTTPException(status_code=403, detail="Access denied: file is not in scanned directories.")


def _normalize_directory_path(path: str) -> str:
    """Normalize a directory path string without touching the filesystem."""
    return os.path.normpath(os.path.abspath(path.strip()))


def _path_parts(path: str) -> tuple[str, list[str], str]:
    """Split a normalized path into anchor, remaining path parts, and separator."""
    normalized = os.path.normpath(path)
    drive, tail = os.path.splitdrive(normalized)
    separator = "\\" if "\\" in normalized else os.sep
    anchor = drive + separator if drive else (separator if normalized.startswith(("/", "\\")) else "")
    parts = [part for part in tail.replace("\\", "/").split("/") if part]
    return anchor, parts, separator


def _is_same_or_descendant_path(path: str, ancestor: str) -> bool:
    """Return whether path is ancestor itself or a descendant, without stat calls."""
    path_norm = os.path.normcase(os.path.normpath(path))
    ancestor_norm = os.path.normcase(os.path.normpath(ancestor))
    try:
        return os.path.commonpath([path_norm, ancestor_norm]) == ancestor_norm
    except ValueError:
        return False


def _immediate_child_path(parent: str, descendant: str) -> str | None:
    """Return the first child folder below parent when descendant is inside parent."""
    parent_anchor, parent_parts, separator = _path_parts(parent)
    descendant_anchor, descendant_parts, descendant_separator = _path_parts(descendant)

    if os.path.normcase(parent_anchor) != os.path.normcase(descendant_anchor):
        return None

    if len(descendant_parts) <= len(parent_parts):
        return None

    for parent_part, descendant_part in zip(parent_parts, descendant_parts):
        if os.path.normcase(parent_part) != os.path.normcase(descendant_part):
            return None

    child_parts = descendant_parts[:len(parent_parts) + 1]
    child_separator = separator if separator in parent else descendant_separator
    if parent_anchor:
        return parent_anchor + child_separator.join(child_parts)
    return child_separator.join(child_parts)


def _serve_image_preview(filepath: str) -> Response:
    """Serve browser-displayable image content, converting HEIC/HEIF to JPEG in memory."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext not in HEIC_EXTENSIONS:
        return FileResponse(filepath, headers=NO_CACHE_HEADERS)

    try:
        with Image.open(filepath) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=90)
        return Response(content=buffer.getvalue(), media_type="image/jpeg", headers=NO_CACHE_HEADERS)
    except Exception as exc:
        raise HTTPException(status_code=415, detail=f"Unable to convert HEIC/HEIF image for browser preview: {exc}") from exc


class FolderScanRequest(BaseModel):
    """Payload to trigger a local directory scan."""
    directory_path: str
    force_rescan: bool = False
    extract_metadata: bool = False


class FolderScanControlRequest(BaseModel):
    """Payload to pause, resume, or cancel the folder scanner."""
    action: str  # 'pause', 'resume', 'cancel'


@router.post("")
async def scan_folder(
    req: FolderScanRequest,
    background_tasks: BackgroundTasks,
    db: sqlite3.Connection = Depends(get_db)
) -> dict[str, str]:
    """Triggers recursive scan of a local directory to populate non-AI local_media dataset."""
    normalized_path = os.path.abspath(req.directory_path.strip())

    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=400, detail="Directory path does not exist on disk.")

    if not os.path.isdir(normalized_path):
        raise HTTPException(status_code=400, detail="Specified path is not a directory.")

    if state.FOLDER_SCAN_STATE != "idle":
        raise HTTPException(status_code=400, detail=f"Scanner is currently in state: {state.FOLDER_SCAN_STATE}")

    # Set initial state and queue background task
    state.FOLDER_SCAN_STATE = "running"
    state.folder_scan_total = 0
    state.folder_scan_processed = 0

    background_tasks.add_task(
        background_folder_processor,
        normalized_path,
        DB_FILE,
        req.force_rescan,
        req.extract_metadata
    )

    state.add_folder_log(f"Queued background directory scan task for: {normalized_path}")
    return {"message": "Background folder scan initialized successfully."}


@router.get("/status")
async def get_folder_scan_status() -> dict[str, Any]:
    """Retrieves current scan progress state, total file count, and processed counts."""
    conn = sqlite3.connect(DB_FILE)
    session = get_resumable_session(conn, "folder")
    conn.close()
    scan_state = state.FOLDER_SCAN_STATE
    scan_total = state.folder_scan_total
    scan_processed = state.folder_scan_processed
    if session and state.FOLDER_SCAN_STATE == "idle":
        scan_state = session["status"]
        scan_total = session["total_count"]
        scan_processed = session["processed_count"]
    return {
        "state": scan_state,
        "scan_total": scan_total,
        "scan_processed": scan_processed,
    }


@router.post("/control")
async def control_folder_scan(req: FolderScanControlRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Pauses, resumes, or cancels/stops the active background directory scan."""
    action = req.action.lower().strip()

    if action == "pause":
        if state.FOLDER_SCAN_STATE == "running":
            state.FOLDER_SCAN_STATE = "paused"
            state.add_folder_log("Scan execution paused by user.")
        conn = sqlite3.connect(DB_FILE)
        session = get_resumable_session(conn, "folder")
        if session:
            set_session_status(conn, session["id"], "paused")
        conn.close()
    elif action == "resume":
        conn = sqlite3.connect(DB_FILE)
        session = get_resumable_session(conn, "folder")
        if session:
            set_session_status(conn, session["id"], "running")
            state.folder_scan_total = session["total_count"]
            state.folder_scan_processed = session["processed_count"]
            if state.FOLDER_SCAN_STATE in {"idle", "paused"}:
                state.FOLDER_SCAN_STATE = "running"
                background_tasks.add_task(
                    background_folder_processor,
                    session["root_path"],
                    DB_FILE,
                    session["force_rescan"],
                    session["extract_metadata"],
                    session["id"],
                )
        elif state.FOLDER_SCAN_STATE == "paused":
            state.FOLDER_SCAN_STATE = "running"
        conn.close()
        state.add_folder_log("Scan execution resumed by user.")
    elif action == "cancel":
        conn = sqlite3.connect(DB_FILE)
        session = get_resumable_session(conn, "folder")
        if session:
            set_session_status(conn, session["id"], "cancelled")
            conn.execute(
                """
                UPDATE folder_scan_queue
                SET status = 'skipped', processed_at = CURRENT_TIMESTAMP
                WHERE session_id = ?
                  AND status IN ('pending', 'processing')
                """,
                (session["id"],),
            )
            conn.commit()
        conn.close()
        state.FOLDER_SCAN_STATE = "idle"
        state.folder_scan_total = 0
        state.folder_scan_processed = 0
        state.add_folder_log("Scan execution aborted by user.")
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'pause', 'resume', or 'cancel'.")

    return {"state": state.FOLDER_SCAN_STATE}


@router.get("/history")
async def get_folder_scan_history(db: sqlite3.Connection = Depends(get_db)) -> dict[str, list[dict[str, Any]]]:
    """Returns list of recently scanned folder roots."""
    try:
        cursor = db.cursor()
        cursor.execute("SELECT directory_path, last_scanned FROM folder_scan_history ORDER BY last_scanned DESC")
        history = [{"directory_path": row[0], "last_scanned": row[1]} for row in cursor.fetchall()]
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}") from e


@router.get("/logs")
async def get_folder_scan_logs() -> dict[str, list[dict[str, str]]]:
    """Retrieves transient logging console history from memory."""
    return {"logs": list(state.folder_scan_logs)}


@router.get("/explorer")
async def explorer(path: str = "", db: sqlite3.Connection = Depends(get_db)) -> dict[str, Any]:
    """Hierarchical directory drilling-down explorer.

    If path is empty, lists the previously scanned root folders.
    If path is specified, lists indexed subfolders and media files from the database.
    """
    cursor = db.cursor()
    cursor.execute("SELECT directory_path FROM folder_scan_history ORDER BY last_scanned DESC")
    scanned_roots = [_normalize_directory_path(row[0]) for row in cursor.fetchall()]

    if not path:
        return {
            "current_path": "",
            "parent_path": None,
            "directories": scanned_roots,
            "files": []
        }

    normalized_path = _normalize_directory_path(path)
    cursor.execute(
        """
        SELECT DISTINCT parent_path
        FROM local_media
        WHERE parent_path IS NOT NULL
          AND parent_path != ''
        """
    )
    indexed_media_folders = [_normalize_directory_path(row[0]) for row in cursor.fetchall()]
    indexed_folders = scanned_roots + indexed_media_folders
    path_known_to_index = any(
        _is_same_or_descendant_path(candidate, normalized_path) or _is_same_or_descendant_path(normalized_path, candidate)
        for candidate in indexed_folders
    )
    if not path_known_to_index:
        raise HTTPException(status_code=404, detail="Directory path is not in scanned folder index.")

    directories = {
        child
        for candidate in indexed_folders
        if (child := _immediate_child_path(normalized_path, candidate)) is not None
    }

    # Query media files belonging directly to this indexed directory.
    cursor.execute(
        f"""
        SELECT id, filepath, filename, parent_path, file_size, file_hash, media_type,
               date_taken, date_modified, date_created, date_fallback, year, month, day,
               width, height, duration, codec, frame_rate, bit_rate, camera_make, camera_model,
               lens_model, exposure_time, f_number, iso, focal_length, gps_lat, gps_lon, scanned_at,
               {LOCAL_DUPLICATE_COUNT_SQL} AS duplicate_count
        FROM local_media AS lm
        WHERE parent_path = ?
        ORDER BY filename ASC
    """,
        (normalized_path,),
    )

    files = []
    for r in cursor.fetchall():
        files.append({
            "id": r[0],
            "filepath": r[1],
            "filename": r[2],
            "parent_path": r[3],
            "file_size": r[4],
            "file_hash": r[5],
            "media_type": r[6],
            "date_taken": r[7],
            "date_modified": r[8],
            "date_created": r[9],
            "date_fallback": r[10],
            "year": r[11],
            "month": r[12],
            "day": r[13],
            "width": r[14],
            "height": r[15],
            "duration": r[16],
            "codec": r[17],
            "frame_rate": r[18],
            "bit_rate": r[19],
            "camera_make": r[20],
            "camera_model": r[21],
            "lens_model": r[22],
            "exposure_time": r[23],
            "f_number": r[24],
            "iso": r[25],
            "focal_length": r[26],
            "gps_lat": r[27],
            "gps_lon": r[28],
            "scanned_at": r[29],
            "duplicate_count": r[30],
        })

    # Compute parent path relative to directory roots
    parent_path = os.path.dirname(normalized_path)
    if parent_path == normalized_path:
        parent_path = ""

    return {
        "current_path": normalized_path,
        "parent_path": parent_path,
        "directories": sorted(directories),
        "files": files,
    }


@router.get("/dates")
async def dates_explorer(
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    media_types: str | None = None,
    db: sqlite3.Connection = Depends(get_db)
) -> list[dict[str, Any]] | list[Any]:
    """Hierarchical Date Drilling Down Explorer (Years -> Months -> Days -> Files)."""
    cursor = db.cursor()

    conditions = []
    params = []

    # 1. Date Range Filter using SQLite date function on processed ISO strings
    # Converts 'YYYY:MM:DD HH:MM:SS' to 'YYYY-MM-DD' for robust comparison
    if from_date:
        conditions.append("date(REPLACE(SUBSTR(COALESCE(NULLIF(date_taken, ''), date_fallback), 1, 10), ':', '-')) >= date(?)")
        params.append(from_date)
    if to_date:
        conditions.append("date(REPLACE(SUBSTR(COALESCE(NULLIF(date_taken, ''), date_fallback), 1, 10), ':', '-')) <= date(?)")
        params.append(to_date)

    # 2. Media type/category filter. Invalid stubs are intentionally outside
    # ordinary timeline totals because they are not playable media.
    if media_types == DUPLICATE_REPORT_INVALID_MEDIA_STUB:
        conditions.append("validation_status = ?")
        params.append(DUPLICATE_REPORT_INVALID_MEDIA_STUB)
    else:
        conditions.append("(validation_status IS NULL OR validation_status != ?)")
        params.append(DUPLICATE_REPORT_INVALID_MEDIA_STUB)
        types_list = [t.strip() for t in (media_types or "").split(",") if t.strip() in {"image", "video"}]
        if types_list:
            placeholders = ",".join("?" for _ in types_list)
            conditions.append(f"media_type IN ({placeholders})")
            params.extend(types_list)

    if year is None:
        # Step 1: List all years with counts
        where_clause = "WHERE year IS NOT NULL"
        if conditions:
            where_clause += " AND " + " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT year, COUNT(*)
            FROM local_media
            {where_clause}
            GROUP BY year
            ORDER BY year DESC
        """,
            tuple(params),
        )
        return [{"label": str(row[0]), "value": row[0], "count": row[1]} for row in cursor.fetchall()]

    elif month is None:
        # Step 2: List months in year with counts
        where_conditions = ["year = ?", "month IS NOT NULL"] + conditions
        where_clause = "WHERE " + " AND ".join(where_conditions)
        cursor.execute(
            f"""
            SELECT month, COUNT(*)
            FROM local_media
            {where_clause}
            GROUP BY month
            ORDER BY month ASC
        """,
            (year,) + tuple(params),
        )
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        results = []
        for row in cursor.fetchall():
            m_val = row[0]
            m_label = month_names[m_val - 1] if 1 <= m_val <= 12 else f"Month {m_val}"
            results.append({"label": m_label, "value": m_val, "count": row[1]})
        return results

    elif day is None:
        # Step 3: List days in month/year with counts
        where_conditions = ["year = ?", "month = ?", "day IS NOT NULL"] + conditions
        where_clause = "WHERE " + " AND ".join(where_conditions)
        cursor.execute(
            f"""
            SELECT day, COUNT(*)
            FROM local_media
            {where_clause}
            GROUP BY day
            ORDER BY day ASC
        """,
            (year, month) + tuple(params),
        )
        return [{"label": f"{row[0]:02d}", "value": row[0], "count": row[1]} for row in cursor.fetchall()]

    else:
        # Step 4: Return files list on specific day
        where_conditions = ["year = ?", "month = ?", "day = ?"] + conditions
        where_clause = "WHERE " + " AND ".join(where_conditions)
        cursor.execute(
            f"""
            SELECT lm.id, lm.filepath, lm.filename, lm.parent_path, lm.file_size, lm.file_hash, lm.media_type,
                   date_taken, date_modified, date_created, date_fallback, year, month, day,
                   width, height, duration, codec, frame_rate, bit_rate, camera_make, camera_model,
                   lens_model, exposure_time, f_number, iso, focal_length, gps_lat, gps_lon, scanned_at,
                   {LOCAL_DUPLICATE_COUNT_SQL} AS duplicate_count
            FROM local_media AS lm
            {where_clause}
            ORDER BY filename ASC
        """,
            (year, month, day) + tuple(params),
        )

        files = []
        for r in cursor.fetchall():
            files.append({
                "id": r[0],
                "filepath": r[1],
                "filename": r[2],
                "parent_path": r[3],
                "file_size": r[4],
                "file_hash": r[5],
                "media_type": r[6],
                "date_taken": r[7],
                "date_modified": r[8],
                "date_created": r[9],
                "date_fallback": r[10],
                "year": r[11],
                "month": r[12],
                "day": r[13],
                "width": r[14],
                "height": r[15],
                "duration": r[16],
                "codec": r[17],
                "frame_rate": r[18],
                "bit_rate": r[19],
                "camera_make": r[20],
                "camera_model": r[21],
                "lens_model": r[22],
                "exposure_time": r[23],
                "f_number": r[24],
                "iso": r[25],
                "focal_length": r[26],
                "gps_lat": r[27],
                "gps_lon": r[28],
                "scanned_at": r[29],
                "duplicate_count": r[30],
            })
        return files
@router.get("/search")
async def search_local_media(
    q: str = "",
    filename: str = "",
    date_from: str = "",
    date_to: str = "",
    media_type: str = "",
    sort_by: str = "date_taken",
    sort_dir: str = "desc",
    limit: int = 500,
    db: sqlite3.Connection = Depends(get_db)
) -> list[dict[str, Any]]:
    """Performs flat search query across local_media database table."""
    cursor = db.cursor()
    conditions = ["1=1"]
    params = []

    if filename:
        query_pattern = f"%{filename}%"
        conditions.append("filename LIKE ?")
        params.append(query_pattern)
    elif q:
        query_pattern = f"%{q}%"
        conditions.append("(filename LIKE ? OR filepath LIKE ?)")
        params.extend([query_pattern, query_pattern])

    if date_from:
        conditions.append("date_taken >= ?")
        params.append(date_from)

    if date_to:
        conditions.append("date_taken <= ?")
        params.append(date_to + " 23:59:59")

    if media_type:
        conditions.append("media_type = ?")
        params.append(media_type)

    where_sql = " AND ".join(conditions)

    sort_col_map = {"date_taken": "date_taken", "filename": "filename", "file_size": "file_size"}
    order_col = sort_col_map.get(sort_by, "date_taken")
    order_dir = "ASC" if sort_dir.lower() == "asc" else "DESC"
    nulls = "NULLS LAST" if order_dir == "DESC" else "NULLS FIRST"

    sql = f"""
        SELECT id, filepath, filename, parent_path, file_size, file_hash, media_type,
               date_taken, date_modified, date_created, date_fallback, year, month, day,
               width, height, duration, codec, frame_rate, bit_rate, camera_make, camera_model,
               lens_model, exposure_time, f_number, iso, focal_length, gps_lat, gps_lon, scanned_at
        FROM local_media
        WHERE {where_sql}
        ORDER BY {order_col} {order_dir} {nulls}
        LIMIT ?
    """
    params.append(limit)

    cursor.execute(sql, params)
    files = []
    for r in cursor.fetchall():
        files.append({
            "id": r[0],
            "filepath": r[1],
            "filename": r[2],
            "parent_path": r[3],
            "file_size": r[4],
            "file_hash": r[5],
            "media_type": r[6],
            "date_taken": r[7],
            "date_modified": r[8],
            "date_created": r[9],
            "date_fallback": r[10],
            "year": r[11],
            "month": r[12],
            "day": r[13],
            "width": r[14],
            "height": r[15],
            "duration": r[16],
            "codec": r[17],
            "frame_rate": r[18],
            "bit_rate": r[19],
            "camera_make": r[20],
            "camera_model": r[21],
            "lens_model": r[22],
            "exposure_time": r[23],
            "f_number": r[24],
            "iso": r[25],
            "focal_length": r[26],
            "gps_lat": r[27],
            "gps_lon": r[28],
            "scanned_at": r[29],
        })
    return files

def _duplicate_report_where_clause(
    category: str = DUPLICATE_REPORT_MATCH_TYPE,
    from_date: str = "",
    to_date: str = "",
    media_type: str = "",
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    root_path: str = "",
    table_alias: str = "local_media",
) -> tuple[str, list[Any]]:
    """Build the filtered WHERE clause shared by duplicate report formats."""
    column_prefix = f"{table_alias}." if table_alias else ""
    conditions = [f"{column_prefix}file_hash IS NOT NULL", f"{column_prefix}file_hash != ''"]
    params: list[Any] = []
    if category == DUPLICATE_REPORT_INVALID_MEDIA_STUB:
        conditions.append(f"{column_prefix}validation_status = ?")
        params.append(DUPLICATE_REPORT_INVALID_MEDIA_STUB)
    else:
        conditions.append(
            f"({column_prefix}media_type != ? OR {column_prefix}validation_status = ?)"
        )
        params.extend(["video", "valid"])
    date_expr = (
        "date(REPLACE(SUBSTR("
        f"COALESCE(NULLIF({column_prefix}date_taken, ''), NULLIF({column_prefix}date_modified, ''), "
        f"NULLIF({column_prefix}date_created, ''), {column_prefix}scanned_at), 1, 10), ':', '-'))"
    )

    if from_date:
        conditions.append(f"{date_expr} >= date(?)")
        params.append(from_date)
    if to_date:
        conditions.append(f"{date_expr} <= date(?)")
        params.append(to_date)
    if media_type and media_type != "all":
        conditions.append(f"{column_prefix}media_type = ?")
        params.append(media_type)
    if year is not None:
        conditions.append(f"{column_prefix}year = ?")
        params.append(year)
    if month is not None:
        conditions.append(f"{column_prefix}month = ?")
        params.append(month)
    if day is not None:
        conditions.append(f"{column_prefix}day = ?")
        params.append(day)
    if root_path:
        normalized_root = os.path.abspath(root_path.strip())
        conditions.append(f"({column_prefix}parent_path = ? OR {column_prefix}parent_path LIKE ?)")
        params.extend([normalized_root, f"{normalized_root}{os.sep}%"])

    return " AND ".join(conditions), params


def _duplicate_report_file_from_row(row: tuple[Any, ...]) -> dict[str, Any]:
    """Map a local_media row tuple to the duplicate report file payload."""
    return {
        "id": row[0],
        "filepath": row[1],
        "filename": row[2],
        "parent_path": row[3],
        "file_size": row[4],
        "file_hash": row[5],
        "media_type": row[6],
        "date_taken": row[7],
        "date_modified": row[8],
        "date_created": row[9],
        "date_fallback": row[10],
        "year": row[11],
        "month": row[12],
        "day": row[13],
        "scanned_at": row[14],
        "validation_status": row[15],
        "validation_error": row[16],
    }


def _normalize_duplicate_report_page(page: int, page_size: int | None) -> tuple[int, int | None]:
    """Normalize duplicate report pagination inputs."""
    normalized_page = max(page, 1)
    if page_size is None:
        return normalized_page, None
    normalized_page_size = page_size if page_size in DUPLICATE_REPORT_PAGE_SIZES else DUPLICATE_REPORT_DEFAULT_PAGE_SIZE
    return normalized_page, normalized_page_size


def _duplicate_hashes_cte(where_sql: str) -> str:
    """Return the duplicate hash CTE used by report summary and page queries."""
    return f"""
        WITH duplicate_hashes AS (
            SELECT
                lm.file_hash,
                COUNT(*) AS file_count,
                SUM(lm.file_size) AS total_bytes,
                MAX(lm.file_size) AS retained_bytes
            FROM local_media lm
            WHERE {where_sql}
            GROUP BY lm.file_hash
            HAVING COUNT(*) >= ?
        )
    """


def build_duplicate_report(
    db: sqlite3.Connection,
    category: str = DUPLICATE_REPORT_MATCH_TYPE,
    from_date: str = "",
    to_date: str = "",
    media_type: str = "",
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    root_path: str = "",
    min_count: int = 2,
    page: int = 1,
    page_size: int | None = DUPLICATE_REPORT_DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Build an exact duplicate or invalid-media report for local folder media."""
    if category not in DUPLICATE_REPORT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Unsupported duplicate report category.")
    min_group_count = 1 if category == DUPLICATE_REPORT_INVALID_MEDIA_STUB else max(min_count, 2)
    page, page_size = _normalize_duplicate_report_page(page, page_size)
    offset = (page - 1) * page_size if page_size is not None else 0
    where_sql, params = _duplicate_report_where_clause(
        category=category,
        from_date=from_date,
        to_date=to_date,
        media_type=media_type,
        year=year,
        month=month,
        day=day,
        root_path=root_path,
        table_alias="lm",
    )
    cursor = db.cursor()

    duplicate_hashes_cte = _duplicate_hashes_cte(where_sql)

    cursor.execute(
        f"""
        {duplicate_hashes_cte}
        SELECT
            COUNT(*) AS group_count,
            COALESCE(SUM(file_count), 0) AS file_count,
            COALESCE(SUM(total_bytes), 0) AS total_bytes,
            COALESCE(SUM(total_bytes - retained_bytes), 0) AS wasted_bytes
        FROM duplicate_hashes
        """,
        tuple(params + [min_group_count]),
    )
    summary_row = cursor.fetchone()
    summary = {
        "group_count": int(summary_row[0] or 0),
        "file_count": int(summary_row[1] or 0),
        "total_bytes": int(summary_row[2] or 0),
        "wasted_bytes": int(summary_row[3] or 0),
    }

    page_clause = ""
    page_params: list[Any] = []
    if page_size is not None:
        page_clause = "LIMIT ? OFFSET ?"
        page_params = [page_size, offset]

    cursor.execute(
        f"""
        {duplicate_hashes_cte},
        selected_hashes AS (
            SELECT *
            FROM duplicate_hashes
            ORDER BY file_count DESC, total_bytes DESC, file_hash ASC
            {page_clause}
        )
        SELECT
            dh.file_hash,
            dh.file_count,
            dh.total_bytes,
            dh.retained_bytes,
            lm.id,
            lm.filepath,
            lm.filename,
            lm.parent_path,
            lm.file_size,
            lm.file_hash,
            lm.media_type,
            lm.date_taken,
            lm.date_modified,
            lm.date_created,
            lm.date_fallback,
            lm.year,
            lm.month,
            lm.day,
            lm.scanned_at,
            lm.validation_status,
            lm.validation_error
        FROM selected_hashes dh
        JOIN local_media lm ON lm.file_hash = dh.file_hash
        WHERE {where_sql}
        ORDER BY dh.file_count DESC, dh.total_bytes DESC, dh.file_hash ASC,
                 lm.year DESC, lm.month DESC, lm.day DESC, lm.filename ASC
        """,
        tuple(params + [min_group_count] + page_params + params),
    )

    groups = []
    groups_by_hash: dict[str, dict[str, Any]] = {}

    for row in cursor.fetchall():
        file_hash, file_count, total_bytes, retained_bytes = row[:4]
        group_total = int(total_bytes or 0)
        group_wasted = max(group_total - int(retained_bytes or 0), 0)

        group = groups_by_hash.get(file_hash)
        if group is None:
            group = {
                "match_type": category,
                "file_hash": file_hash,
                "count": file_count,
                "total_bytes": group_total,
                "wasted_bytes": group_wasted,
                "files": [],
            }
            groups_by_hash[file_hash] = group
            groups.append(group)

        group["files"].append(_duplicate_report_file_from_row(row[4:]))

    total_pages = 1
    if page_size is not None:
        total_pages = max((summary["group_count"] + page_size - 1) // page_size, 1)

    return {
        "match_type": category,
        "available_match_types": sorted(DUPLICATE_REPORT_CATEGORIES),
        "future_match_types": ["possible_visual", "possible_metadata"],
        "summary": summary,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_groups": summary["group_count"],
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1,
        },
        "groups": groups,
    }


@router.get("/duplicates/report")
async def duplicate_report(
    category: str = DUPLICATE_REPORT_MATCH_TYPE,
    from_date: str = "",
    to_date: str = "",
    media_type: str = "",
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    root_path: str = "",
    min_count: int = 2,
    page: int = 1,
    page_size: int = DUPLICATE_REPORT_DEFAULT_PAGE_SIZE,
    db: sqlite3.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Return exact duplicates or invalid media stubs grouped by file hash."""
    return build_duplicate_report(
        db, category, from_date, to_date, media_type, year, month, day, root_path, min_count, page, page_size
    )


@router.get("/duplicates/report.csv")
async def duplicate_report_csv(
    category: str = DUPLICATE_REPORT_MATCH_TYPE,
    from_date: str = "",
    to_date: str = "",
    media_type: str = "",
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    root_path: str = "",
    min_count: int = 2,
    db: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Export the selected report category as one CSV row per media file."""
    report = build_duplicate_report(
        db,
        category,
        from_date,
        to_date,
        media_type,
        year,
        month,
        day,
        root_path,
        min_count,
        page_size=None,
    )
    output = io.StringIO()
    writer = csv.writer(
        output,
        quoting=csv.QUOTE_ALL,
        doublequote=True,
        lineterminator="\r\n",
    )
    writer.writerow([
        "match_type",
        "file_hash",
        "group_count",
        "group_total_bytes",
        "group_wasted_bytes",
        "file_id",
        "filename",
        "filepath",
        "parent_path",
        "file_size",
        "media_type",
        "year",
        "month",
        "day",
        "date_taken",
        "date_modified",
        "date_created",
        "scanned_at",
        "validation_status",
        "validation_error",
    ])

    for group in report["groups"]:
        for file in group["files"]:
            writer.writerow(_csv_safe_row([
                group["match_type"],
                group["file_hash"],
                group["count"],
                group["total_bytes"],
                group["wasted_bytes"],
                file["id"],
                file["filename"],
                file["filepath"],
                file["parent_path"],
                file["file_size"],
                file["media_type"],
                file["year"],
                file["month"],
                file["day"],
                file["date_taken"],
                file["date_modified"],
                file["date_created"],
                file["scanned_at"],
                file["validation_status"],
                file["validation_error"],
            ]))

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="duplicate-report.csv"'},
    )


@router.get("/duplicates/{media_id}")
async def get_media_duplicates(media_id: int, db: sqlite3.Connection = Depends(get_db)) -> dict[str, list[dict[str, Any]]]:
    """Finds exact duplicates with matching hashes across local_media table and main gallery table."""
    cursor = db.cursor()

    # Find the hash for target file
    cursor.execute(
        "SELECT file_hash, filepath, media_type, validation_status FROM local_media WHERE id = ?",
        (media_id,),
    )
    row = cursor.fetchone()
    if not row or not row[0] or (row[2] == "video" and row[3] != "valid"):
        return {"local_duplicates": [], "gallery_duplicates": []}

    file_hash, filepath = row[:2]

    # 1. Look for other local duplicates
    cursor.execute(
        """
        SELECT id, filepath, filename, file_size, scanned_at
        FROM local_media
        WHERE file_hash = ? AND filepath != ?
          AND (media_type != 'video' OR validation_status = 'valid')
    """,
        (file_hash, filepath),
    )
    local_duplicates = [
        {"id": r[0], "filepath": r[1], "filename": r[2], "file_size": r[3], "scanned_at": r[4]}
        for r in cursor.fetchall()
    ]

    # 2. Look for gallery duplicates
    cursor.execute(
        """
        SELECT id, filepath, filename, file_size, scanned_at
        FROM photos
        WHERE file_hash = ?
    """,
        (file_hash,),
    )
    gallery_duplicates = [
        {"id": r[0], "filepath": r[1], "filename": r[2], "file_size": r[3], "scanned_at": r[4]}
        for r in cursor.fetchall()
    ]

    return {"local_duplicates": local_duplicates, "gallery_duplicates": gallery_duplicates}


@router.get("/media")
async def serve_local_media(path: str, db: sqlite3.Connection = Depends(get_db)) -> FileResponse:
    """Streams local media file content using Starlette range support (essential for browser seek)."""
    normalized_path = os.path.abspath(path.strip())

    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="File does not exist on disk.")

    _ensure_scanned_media_access(normalized_path, db)

    # Return FileResponse which handles HTTP Range headers automatically (very critical for seekable video playback)
    return FileResponse(normalized_path)


@router.get("/media-preview")
async def serve_local_media_preview(path: str, db: sqlite3.Connection = Depends(get_db)) -> Response:
    """Serve image previews in a browser-compatible format, including HEIC/HEIF conversion."""
    normalized_path = os.path.abspath(path.strip())

    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="File does not exist on disk.")

    _ensure_scanned_media_access(normalized_path, db)
    return _serve_image_preview(normalized_path)


# ---------------------------------------------------------------------------
# Formats that require FFmpeg transcoding to be browser-playable
# ---------------------------------------------------------------------------
_TRANSCODE_EXTENSIONS = {
    ".avi", ".wmv", ".flv", ".3gp", ".mpg", ".mpeg",
    ".divx", ".rm", ".rmvb", ".asf", ".vob", ".ts",
    ".ogv", ".f4v",
}


async def _stream_ffmpeg_transcode(
    input_path: str,
    preset: str,
    crf: int,
) -> AsyncGenerator[bytes, None]:
    """Async generator that pipes FFmpeg stdout chunks to the HTTP response.

    Produces a fragmented MP4 stream (fmp4) that browsers can begin playing
    before the transcode is complete, with no intermediate disk writes.

    Parameters
    ----------
    input_path:
        Absolute path to the source video file.
    preset:
        FFmpeg ``-preset`` value (e.g. ``ultrafast``, ``fast``, ``medium``).
    crf:
        FFmpeg ``-crf`` value controlling quality/file-size trade-off.
    """
    ffmpeg_path = get_ffmpeg_path()

    cmd = [
        ffmpeg_path,
        "-i", input_path,
        # Video: re-encode to H.264
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf),
        # Audio: re-encode to AAC stereo at 128 kbps (broadly compatible)
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2",
        # Fragmented MP4 flags — essential for progressive browser streaming
        # frag_keyframe: start a new fragment on every keyframe (seek-friendly)
        # empty_moov:    write an empty moov atom first so playback starts immediately
        # faststart:     move moov before mdat for HTTP streaming
        "-movflags", "frag_keyframe+empty_moov+faststart",
        # Output as raw MP4 bytes to stdout
        "-f", "mp4",
        "pipe:1",
        # Suppress all diagnostic output so only video bytes go to stdout
        "-loglevel", "error",
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        assert process.stdout is not None  # always set when PIPE is used
        chunk_size = 65_536  # 64 KB chunks — balances memory pressure vs round-trips
        while True:
            chunk = await process.stdout.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        # Ensure the FFmpeg process is cleaned up if the client disconnects early
        if process.returncode is None:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=3.0)
            except Exception:
                process.kill()


@router.get("/transcode")
async def transcode_video(
    path: str,
    quality: str = "balanced",
    db: sqlite3.Connection = Depends(get_db),
) -> StreamingResponse:
    """Transcode a legacy/incompatible video file to MP4 on-the-fly via FFmpeg.

    Streams the re-encoded video directly to the browser as a fragmented MP4
    (no disk writes). Supports AVI, WMV, FLV, 3GP, MPG, DivX, RealMedia, etc.

    Parameters
    ----------
    path:
        Absolute path to the source video file (URL-encoded).
    quality:
        Transcoding quality preset.  One of ``fast``, ``balanced`` (default),
        or ``quality``.  Controls the FFmpeg ``-preset`` and ``-crf`` values.

    Raises
    ------
    HTTP 404:
        File does not exist on disk.
    HTTP 403:
        File is not registered in any scanned dataset (security guard).
    HTTP 503:
        FFmpeg is not installed or not available on the system PATH.
    HTTP 400:
        File extension is natively browser-supported — use the ``/media``
        endpoint instead.
    """
    normalized_path = os.path.abspath(path.strip())

    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="File does not exist on disk.")

    _ensure_scanned_media_access(normalized_path, db)

    # Validate the file extension needs transcoding
    ext = os.path.splitext(normalized_path)[1].lower()
    if ext not in _TRANSCODE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Extension '{ext}' does not require transcoding. "
                "Use the /media endpoint for natively supported formats."
            ),
        )

    # Ensure FFmpeg is available
    try:
        get_ffmpeg_path()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    preset, crf = get_ffmpeg_preset(quality)

    headers = {
        # Tell the browser this is a streaming response it cannot cache/reuse
        "Cache-Control": "no-cache, no-store",
        "X-Transcode-Quality": quality,
        "X-Transcode-Preset": preset,
        "X-Transcode-CRF": str(crf),
    }

    return StreamingResponse(
        _stream_ffmpeg_transcode(normalized_path, preset, crf),
        media_type="video/mp4",
        headers=headers,
    )
