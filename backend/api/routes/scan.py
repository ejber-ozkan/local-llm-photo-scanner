"""
API router logic for scanning directories and managing the background processor queue.
"""

import hashlib
import json
import os
import sqlite3
from datetime import datetime
from typing import Any

import numpy as np

try:
    from deepface import DeepFace  # type: ignore

    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False
import cv2
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import core.config as config
import core.state as state
from core.config import OLLAMA_URL
from core.database import get_db, get_test_db
from database_setup import find_best_face_match
from models.schemas import ScanControlRequest, ScanRequest
from services.image_service import extract_all_exif, extract_exif_for_filters, process_image_with_ollama
from services.scan_sessions import create_scan_session, get_resumable_session, set_session_status
from services.scan_worker import background_processor

router = APIRouter()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic"}


class ScanFileRequest(BaseModel):
    """Payload to queue one existing local image for AI gallery processing."""

    filepath: str
    use_ollama: bool = True
    use_clip: bool = True
    active_model: str | None = None


class LocalDateScopeScanRequest(BaseModel):
    """Payload to queue local folder images for a selected timeline date scope."""

    year: int
    month: int | None = None
    day: int | None = None
    use_ollama: bool = True
    use_clip: bool = True
    ignore_screenshots: bool = True
    active_model: str | None = None
    media_types: str = "all"
    from_date: str = ""
    to_date: str = ""
    dry_run: bool = False
    force_rescan: bool = False


def _apply_active_scan_model(active_model: str | None) -> None:
    """Use the model selected by the client for this scan request."""
    if active_model:
        config.ACTIVE_OLLAMA_MODEL = active_model


def _clear_gallery_filters_cache() -> None:
    """Invalidate gallery filter cache after scan-side data changes."""
    from api.routes.gallery import clear_gallery_filters_cache

    clear_gallery_filters_cache()


def _queue_image_path(
    cursor: sqlite3.Cursor,
    normalized_path: str,
    session_id: int,
    scan_time: str,
    force_rescan: bool = False,
) -> tuple[int | None, int, str]:
    """Queue one image path in the AI gallery table and return its queue delta."""
    cursor.execute("SELECT id, status FROM photos WHERE filepath = ? LIMIT 1", (normalized_path,))
    existing_photo = cursor.fetchone()

    if existing_photo:
        photo_id, photo_status = existing_photo
        if photo_status in {"pending", "processing"}:
            cursor.execute("UPDATE photos SET scan_session_id = ? WHERE id = ?", (session_id, photo_id))
            return photo_id, 0, photo_status
        if photo_status == "processed" and not force_rescan:
            return photo_id, 0, photo_status
        # Re-queue: either force_rescan on processed, or other statuses (error, screenshot, etc.)
        cursor.execute(
            """
            UPDATE photos
            SET status = 'pending', scan_session_id = ?, description = NULL
            WHERE id = ?
            """,
            (session_id, photo_id),
        )
        return photo_id, 1, "pending"

    cursor.execute(
        """
        INSERT INTO photos (filepath, filename, scanned_at, scan_session_id)
        VALUES (?, ?, ?, ?)
        """,
        (normalized_path, os.path.basename(normalized_path), scan_time, session_id),
    )
    return cursor.lastrowid, 1, "pending"


@router.post("")
async def scan_directory(
    req: ScanRequest, background_tasks: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)
) -> dict[str, str]:
    """Scans a local directory and adds new images to the database queue."""
    state.add_log(f"Starting scan of directory: {req.directory_path}")
    if not os.path.exists(req.directory_path):
        state.add_log("Directory does not exist. Aborting.")
        raise HTTPException(status_code=400, detail="Directory does not exist")

    cursor = db.cursor()

    state.IGNORE_SCREENSHOTS = req.ignore_screenshots
    state.USE_OLLAMA = getattr(req, "use_ollama", True)
    state.USE_CLIP = getattr(req, "use_clip", True)
    _apply_active_scan_model(req.active_model)

    if req.force_rescan:
        state.add_log(f"Force Rescan enabled. Purging older gallery metadata for: {req.directory_path}")
        # Delete entities linked to photos in this directory
        cursor.execute(
            "DELETE FROM entities WHERE photo_id IN (SELECT id FROM photos WHERE filepath LIKE ?)",
            (f"{req.directory_path}%",),
        )
        # Delete the photos themselves
        cursor.execute("DELETE FROM photos WHERE filepath LIKE ?", (f"{req.directory_path}%",))
        db.commit()
        _clear_gallery_filters_cache()

    active_session = None if req.force_rescan else get_resumable_session(db, "ai")
    session_id = active_session["id"] if active_session else create_scan_session(
        db,
        "ai",
        req.directory_path,
        force_rescan=req.force_rescan,
    )
    added_count = 0

    # Generate exactly one timestamp for the entire folder scan
    scan_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for root, _, files in os.walk(req.directory_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                full_path = os.path.join(root, file)
                try:
                    cursor.execute(
                        "INSERT INTO photos (filepath, filename, scanned_at, scan_session_id) VALUES (?, ?, ?, ?)",
                        (full_path, file, scan_time, session_id)
                    )
                    added_count += 1
                except sqlite3.IntegrityError:
                    pass  # Normal scan, skip existing files

    db.commit()
    existing_processed = active_session["processed_count"] if active_session else 0
    cursor.execute(
        """
        UPDATE scan_sessions
        SET total_count = total_count + ?, processed_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (added_count, existing_processed, session_id),
    )
    db.commit()

    # Record scan history
    try:
        cursor.execute(
            """
            INSERT INTO scan_history (directory_path)
            VALUES (?)
            ON CONFLICT(directory_path)
            DO UPDATE SET last_scanned = CURRENT_TIMESTAMP
        """,
            (req.directory_path,),
        )
        db.commit()
    except Exception as e:
        state.add_log(f"Failed to record scan history: {e}")

    state.add_log(f"Directory scan complete. Queued {added_count} new photos for processing.")

    # Trigger background processing
    if state.SCAN_STATE == "idle":
        state.current_scan_total = added_count
        state.current_scan_processed = 0
        if added_count > 0:
            state.SCAN_STATE = "running"
            background_tasks.add_task(background_processor)
            state.add_log("Background processor tasked.")
        else:
            set_session_status(db, session_id, "completed")
    else:
        # Append to existing running scan
        state.current_scan_total += added_count

    return {"message": f"Scan complete. Added {added_count} new images to processing queue."}


@router.post("/file")
async def scan_file(
    req: ScanFileRequest,
    background_tasks: BackgroundTasks,
    db: sqlite3.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Queue one existing local image file for main AI gallery processing."""
    normalized_path = os.path.abspath(req.filepath.strip())
    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="File does not exist on disk.")

    ext = os.path.splitext(normalized_path)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only image files can be sent to AI processing.")

    cursor = db.cursor()
    cursor.execute("SELECT 1 FROM local_media WHERE filepath = ? LIMIT 1", (normalized_path,))
    in_local_media = cursor.fetchone()
    cursor.execute("SELECT id, status FROM photos WHERE filepath = ? LIMIT 1", (normalized_path,))
    existing_photo = cursor.fetchone()
    if not in_local_media and not existing_photo:
        raise HTTPException(status_code=403, detail="Access denied: file is not in scanned folders.")

    state.USE_OLLAMA = req.use_ollama
    state.USE_CLIP = req.use_clip
    _apply_active_scan_model(req.active_model)

    active_session = get_resumable_session(db, "ai")
    session_id = active_session["id"] if active_session else create_scan_session(
        db,
        "ai",
        os.path.dirname(normalized_path),
        force_rescan=False,
    )

    scan_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    photo_id, queued_count, status = _queue_image_path(cursor, normalized_path, session_id, scan_time)
    if status == "processed":
        return {"message": "Image is already processed in the AI gallery.", "photo_id": photo_id, "status": status}

    cursor.execute(
        """
        UPDATE scan_sessions
        SET total_count = total_count + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (queued_count, session_id),
    )
    db.commit()

    if state.SCAN_STATE == "idle":
        state.current_scan_total = (active_session["total_count"] if active_session else 0) + queued_count
        state.current_scan_processed = active_session["processed_count"] if active_session else 0
        state.SCAN_STATE = "running"
        background_tasks.add_task(background_processor)

    state.add_log(f"Queued file for AI processing: {normalized_path}")
    return {"message": "Image queued for AI processing.", "photo_id": photo_id, "status": "pending"}


@router.post("/local-date-scope")
async def scan_local_date_scope(
    req: LocalDateScopeScanRequest,
    background_tasks: BackgroundTasks,
    db: sqlite3.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Queue local folder images matching a timeline year/month/day scope.

    When ``dry_run`` is True the endpoint returns counts only (how many
    images exist in the scope, how many are already processed, how many
    are new) without mutating any state.  The frontend uses this to
    decide whether to prompt the user with a force-rescan dialog.
    """
    cursor = db.cursor()
    conditions = [
        "year = ?",
        "media_type = 'image'",
        "(validation_status IS NULL OR validation_status != 'invalid_media_stub')",
    ]
    params: list[Any] = [req.year]

    if req.month is not None:
        conditions.append("month = ?")
        params.append(req.month)
    if req.day is not None:
        conditions.append("day = ?")
        params.append(req.day)
    if req.from_date:
        conditions.append("date(REPLACE(SUBSTR(COALESCE(NULLIF(date_taken, ''), date_fallback), 1, 10), ':', '-')) >= date(?)")
        params.append(req.from_date)
    if req.to_date:
        conditions.append("date(REPLACE(SUBSTR(COALESCE(NULLIF(date_taken, ''), date_fallback), 1, 10), ':', '-')) <= date(?)")
        params.append(req.to_date)
    if req.media_types not in {"all", "image"}:
        return {
            "message": "No image files matched this timeline scope.",
            "queued_count": 0,
            "skipped_count": 0,
            "missing_count": 0,
            "total_in_scope": 0,
        }

    cursor.execute(
        f"""
        SELECT filepath
        FROM local_media
        WHERE {" AND ".join(conditions)}
        ORDER BY filepath ASC
        """,
        tuple(params),
    )
    paths = [os.path.abspath(str(row[0])) for row in cursor.fetchall()]

    # ── Dry-run mode: report counts only, no mutations ──
    if req.dry_run:
        already_processed = 0
        new_count = 0
        missing_count = 0
        for path in paths:
            if not os.path.exists(path):
                missing_count += 1
                continue
            cursor.execute(
                "SELECT status FROM photos WHERE filepath = ? LIMIT 1",
                (path,),
            )
            row = cursor.fetchone()
            if row and row[0] == "processed":
                already_processed += 1
            else:
                new_count += 1
        return {
            "message": "Dry-run complete.",
            "total_in_scope": len(paths),
            "already_processed": already_processed,
            "new_count": new_count,
            "missing_count": missing_count,
            "queued_count": 0,
            "skipped_count": 0,
        }

    # ── Actual scan ──
    state.IGNORE_SCREENSHOTS = req.ignore_screenshots
    state.USE_OLLAMA = req.use_ollama
    state.USE_CLIP = req.use_clip
    _apply_active_scan_model(req.active_model)

    active_session = get_resumable_session(db, "ai")
    root_path = f"local timeline {req.year}"
    if req.month is not None:
        root_path += f"-{req.month:02d}"
    if req.day is not None:
        root_path += f"-{req.day:02d}"
    session_id = active_session["id"] if active_session else create_scan_session(
        db,
        "ai",
        root_path,
        force_rescan=req.force_rescan,
    )

    scan_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    queued_count = 0
    skipped_count = 0
    missing_count = 0

    for path in paths:
        if not os.path.exists(path):
            missing_count += 1
            continue
        _, queued_delta, _ = _queue_image_path(
            cursor, path, session_id, scan_time,
            force_rescan=req.force_rescan,
        )
        queued_count += queued_delta
        if queued_delta == 0:
            skipped_count += 1

    cursor.execute(
        """
        UPDATE scan_sessions
        SET total_count = total_count + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (queued_count, session_id),
    )
    db.commit()

    if state.SCAN_STATE == "idle":
        state.current_scan_total = (active_session["total_count"] if active_session else 0) + queued_count
        state.current_scan_processed = active_session["processed_count"] if active_session else 0
        if queued_count > 0:
            state.SCAN_STATE = "running"
            background_tasks.add_task(background_processor)
        elif not active_session:
            set_session_status(db, session_id, "completed")
    else:
        state.current_scan_total += queued_count

    state.add_log(
        f"Queued {queued_count} local timeline images for AI processing "
        f"({skipped_count} already queued or processed, {missing_count} missing)."
    )
    return {
        "message": f"Queued {queued_count} images for AI processing.",
        "queued_count": queued_count,
        "skipped_count": skipped_count,
        "missing_count": missing_count,
        "total_in_scope": len(paths),
    }


@router.post("/single")
async def scan_single(
    file: UploadFile = File(...),
    model: str = Form("llama3.2-vision:latest"),
    db: sqlite3.Connection = Depends(get_test_db),
) -> dict[str, Any]:
    """Synchronously upload and instantly process a single image bypassing the queue."""
    os.makedirs("uploads", exist_ok=True)
    file_bytes = await file.read()
    file_hash = hashlib.md5(file_bytes).hexdigest()

    cursor = db.cursor()

    # 1. Check cache by hash AND model
    cursor.execute(
        "SELECT id, filepath, description, date_taken, camera_make, camera_model, gps_lat, gps_lon FROM photos WHERE file_hash = ? AND status = 'processed' AND ai_model = ?",
        (file_hash, model),
    )
    row = cursor.fetchone()

    if row:
        photo_id, filepath, description, date_taken, camera_make, camera_model, gps_lat, gps_lon = row
        cursor.execute(
            "SELECT id, entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (photo_id,)
        )
        entities = [{"id": e[0], "type": e[1], "name": e[2], "bounding_box": e[3]} for e in cursor.fetchall()]

        # Build Metadata using full EXIF dump
        metadata = extract_all_exif(filepath)
        file_size = os.path.getsize(filepath) if os.path.exists(filepath) else "Unknown"
        # Always inject basic guarantees
        metadata["File Size (Bytes)"] = str(file_size)
        if "Make" not in metadata and camera_make:
            metadata["Make"] = camera_make
        if "Model" not in metadata and camera_model:
            metadata["Model"] = camera_model
        if "DateTimeOriginal" not in metadata and date_taken:
            metadata["DateTimeOriginal"] = date_taken

        # Fetch history across other models
        cursor.execute(
            "SELECT id, ai_model, description FROM photos WHERE file_hash = ? AND status = 'processed' AND ai_model != ?",
            (file_hash, model),
        )
        history = []
        for h_id, h_model, h_desc in cursor.fetchall():
            cursor.execute("SELECT id, entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (h_id,))
            h_ents = [{"id": e[0], "type": e[1], "name": e[2], "bounding_box": e[3]} for e in cursor.fetchall()]
            history.append({"photo_id": h_id, "ai_model": h_model, "description": h_desc, "entities": h_ents})

        return {
            "success": True,
            "message": "Result pulled from cache",
            "description": description,
            "entities": entities,
            "metadata": metadata,
            "history": history,
            "gps_lat": gps_lat,
            "gps_lon": gps_lon,
            "ai_model": model,
        }

    import re

    safe_model = re.sub(r"[^a-zA-Z0-9_\-]", "_", model)
    filename_with_model = f"{safe_model}_{file.filename}"

    # 2. Save physical file
    filepath = os.path.join("uploads", filename_with_model)

    # 2.5 Delete any previous record of this exact upload file to avoid IntegrityError on the unique filepath
    cursor.execute("SELECT id FROM photos WHERE filepath = ?", (filepath,))
    existing_row = cursor.fetchone()
    if existing_row:
        cursor.execute("DELETE FROM entities WHERE photo_id = ?", (existing_row[0],))
        cursor.execute("DELETE FROM photos WHERE id = ?", (existing_row[0],))
        db.commit()

    with open(filepath, "wb") as f:
        f.write(file_bytes)

    # 3. Insert and process synchronously
    try:
        cursor.execute(
            "INSERT INTO photos (filepath, filename, status, file_hash) VALUES (?, ?, 'processing', ?)",
            (filepath, file.filename, file_hash),
        )
        photo_id = cursor.lastrowid
        db.commit()
    except sqlite3.IntegrityError:
        # Filepath already exists (name collision in uploads)
        return {"success": False, "error": "File name already exists in uploads folder."}

    try:
        ai_response = process_image_with_ollama(filepath, OLLAMA_URL, model)
        description = ai_response if ai_response else ""

        exif = extract_exif_for_filters(filepath)
        camera_make = str(exif.get("camera_make")) if exif.get("camera_make") else None
        camera_model = str(exif.get("camera_model")) if exif.get("camera_model") else None
        date_taken = str(exif.get("date_taken")) if exif.get("date_taken") else None

        cursor.execute(
            """
            UPDATE photos SET description = ?, status = 'processed',
            date_taken = ?, camera_make = ?, camera_model = ?, gps_lat = ?, gps_lon = ?, ai_model = ?
            WHERE id = ?
        """,
            (
                description,
                date_taken,
                camera_make,
                camera_model,
                exif.get("gps_lat"),
                exif.get("gps_lon"),
                model,
                photo_id,
            ),
        )

        entities_list = []

        # Extracted pets from Ollama
        if ai_response and "Entities:" in ai_response:
            entities_part = ai_response.split("Entities:")[1].strip()
            negative_starts = ["no ", "none", "n/a", "there are no", "not ", "are no"]
            is_negative = any(entities_part.lower().startswith(p) for p in negative_starts)
            if not is_negative:
                pets = [p.strip().rstrip(".").strip() for p in entities_part.split(",") if p.strip()]
                for pet in pets:
                    cursor.execute(
                        "INSERT INTO entities (photo_id, entity_type, entity_name) VALUES (?, ?, ?)",
                        (photo_id, "pet", f"Unknown {pet.title()}"),
                    )
                    pet_id = cursor.lastrowid
                    entities_list.append({"id": pet_id, "name": f"Unknown {pet.title()}", "type": "pet"})

        # Face Extraction
        if DEEPFACE_AVAILABLE:
            img_array = cv2.imdecode(np.frombuffer(file_bytes, np.uint8), cv2.IMREAD_COLOR)
            reps = DeepFace.represent(
                img_path=img_array, model_name="VGG-Face", detector_backend="retinaface", enforce_detection=False
            )
            for rep in reps:
                embedding = rep.get("embedding")
                facial_area = rep.get("facial_area")
                confidence = rep.get("face_confidence", 1.0)
                if embedding and confidence > 0.85:
                    matched_name = find_best_face_match(embedding, db)
                    if not matched_name:
                        cursor.execute(
                            "SELECT COUNT(*) FROM entities WHERE entity_type = 'person' AND entity_name LIKE 'Unknown Person%'"
                        )
                        unknown_count = cursor.fetchone()[0]
                        matched_name = f"Unknown Person {unknown_count + 1}"

                    cursor.execute(
                        "INSERT INTO entities (photo_id, entity_type, entity_name, bounding_box, embedding) VALUES (?, ?, ?, ?, ?)",
                        (photo_id, "person", matched_name, json.dumps(facial_area), json.dumps(embedding)),
                    )
                    person_id = cursor.lastrowid
                    entities_list.append({"id": person_id, "name": matched_name, "type": "person", "bounding_box": facial_area})

        db.commit()

        # Build Metadata using full EXIF dump
        metadata = extract_all_exif(filepath)
        file_size = os.path.getsize(filepath) if os.path.exists(filepath) else "Unknown"
        # Always inject basic guarantees
        metadata["File Size (Bytes)"] = str(file_size)
        if "Make" not in metadata and camera_make:
            metadata["Make"] = camera_make
        if "Model" not in metadata and camera_model:
            metadata["Model"] = camera_model
        if "DateTimeOriginal" not in metadata and date_taken:
            metadata["DateTimeOriginal"] = date_taken

        # Fetch history from other models
        cursor.execute(
            "SELECT id, ai_model, description FROM photos WHERE file_hash = ? AND status = 'processed' AND ai_model != ?",
            (file_hash, model),
        )
        history = []
        for h_id, h_model, h_desc in cursor.fetchall():
            cursor.execute("SELECT id, entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (h_id,))
            h_ents = [{"id": e[0], "type": e[1], "name": e[2], "bounding_box": e[3]} for e in cursor.fetchall()]
            history.append({"photo_id": h_id, "ai_model": h_model, "description": h_desc, "entities": h_ents})

        return {
            "success": True,
            "description": description,
            "entities": entities_list,
            "message": "Scan complete",
            "metadata": metadata,
            "history": history,
            "gps_lat": exif.get("gps_lat"),
            "gps_lon": exif.get("gps_lon"),
            "ai_model": model,
        }
    except Exception as e:
        cursor.execute("UPDATE photos SET status = 'error' WHERE id = ?", (photo_id,))
        db.commit()
        return {"success": False, "error": str(e)}


@router.post("/control")
async def control_scan(req: ScanControlRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Dynamically interfaces with the global scanning queue.

    Permits pausing, resuming, or cancelling the background worker thread.
    Cancelling flushes all pending uploads from the SQL store.
    """
    _apply_active_scan_model(req.active_model)

    if req.action == "pause":
        if state.SCAN_STATE == "running":
            state.SCAN_STATE = "paused"
            state.add_log("Scan paused.")
        conn = sqlite3.connect(config.DB_FILE)
        session = get_resumable_session(conn, "ai")
        if session:
            set_session_status(conn, session["id"], "paused")
        conn.close()
    elif req.action == "resume":
        conn = sqlite3.connect(config.DB_FILE)
        session = get_resumable_session(conn, "ai")
        if session:
            set_session_status(conn, session["id"], "running")
            state.current_scan_total = session["total_count"]
            state.current_scan_processed = session["processed_count"]
            if state.SCAN_STATE in {"idle", "paused"}:
                state.SCAN_STATE = "running"
                background_tasks.add_task(background_processor)
        elif state.SCAN_STATE == "paused":
            state.SCAN_STATE = "running"
        conn.close()
        state.add_log("Scan resumed.")
    elif req.action == "cancel":
        state.SCAN_STATE = "idle"
        state.current_scan_total = 0
        state.current_scan_processed = 0

        # We need a new connection since this is a quick action outside a Depends context for speed,
        # but optimally we'd inject it. For now, inline connection.
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        session = get_resumable_session(conn, "ai")
        if session:
            set_session_status(conn, session["id"], "cancelled")
            cursor.execute("DELETE FROM photos WHERE status = 'pending' AND scan_session_id = ?", (session["id"],))
        else:
            cursor.execute("DELETE FROM photos WHERE status = 'pending'")
        conn.commit()
        conn.close()

        state.add_log("Scan cancelled. Pending items removed from queue.")
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    return {"state": state.SCAN_STATE}


@router.get("/status")
async def get_scan_status(db: sqlite3.Connection = Depends(get_db)) -> dict[str, Any]:
    """Retrieve the current scan state and main gallery counts."""
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM photos")
    # total parameter removed

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'processed'")
    total_gallery = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'duplicate'")
    total_duplicates = cursor.fetchone()[0]
    session = get_resumable_session(db, "ai")
    scan_state = state.SCAN_STATE
    scan_total = state.current_scan_total
    scan_processed = state.current_scan_processed
    if session and state.SCAN_STATE == "idle":
        scan_state = session["status"]
        scan_total = session["total_count"]
        scan_processed = session["processed_count"]

    return {
        "state": scan_state,
        "total_gallery": total_gallery,
        "total_duplicates": total_duplicates,
        "scan_total": scan_total,
        "scan_processed": scan_processed,
    }


@router.get("/history")
async def get_scan_history(db: sqlite3.Connection = Depends(get_db)) -> dict[str, list[dict[str, Any]]]:
    """Fetches a log of all previously scanned root directories."""
    try:
        cursor = db.cursor()
        cursor.execute("SELECT directory_path, last_scanned FROM scan_history ORDER BY last_scanned DESC")
        history = [{"directory_path": row[0], "last_scanned": row[1]} for row in cursor.fetchall()]
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch scan history: {str(e)}") from e


@router.get("/logs")
async def get_scan_logs() -> dict[str, list[dict[str, str]]]:
    """Retrieves the transient in-memory list of processing worker logs."""
    return {"logs": list(state.scan_logs)}
