"""
API router logic for scanning directories and managing the background processor queue.
"""

import hashlib
import json
import os
import sqlite3
from typing import Any

import numpy as np

try:
    from deepface import DeepFace  # type: ignore

    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False
import cv2
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

import core.state as state
from core.config import OLLAMA_URL
from core.database import get_db, get_test_db
from database_setup import find_best_face_match
from models.schemas import ScanControlRequest, ScanRequest
from services.image_service import extract_all_exif, extract_exif_for_filters, process_image_with_ollama
from services.scan_worker import background_processor

router = APIRouter()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic"}


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

    added_count = 0

    for root, _, files in os.walk(req.directory_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                full_path = os.path.join(root, file)
                try:
                    cursor.execute("INSERT INTO photos (filepath, filename) VALUES (?, ?)", (full_path, file))
                    added_count += 1
                except sqlite3.IntegrityError:
                    pass  # Normal scan, skip existing files

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
        state.SCAN_STATE = "running"
        background_tasks.add_task(background_processor)
        state.add_log("Background processor tasked.")
    else:
        # Append to existing running scan
        state.current_scan_total += added_count

    return {"message": f"Scan complete. Added {added_count} new images to processing queue."}


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
            cursor.execute("SELECT entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (h_id,))
            h_ents = [{"type": e[0], "name": e[1], "bounding_box": e[2]} for e in cursor.fetchall()]
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
                    entities_list.append({"name": f"Unknown {pet.title()}", "type": "pet"})

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
                    entities_list.append({"name": matched_name, "type": "person", "bounding_box": facial_area})

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
            cursor.execute("SELECT entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (h_id,))
            h_ents = [{"type": e[0], "name": e[1], "bounding_box": e[2]} for e in cursor.fetchall()]
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
async def control_scan(req: ScanControlRequest) -> dict[str, str]:
    """Dynamically interfaces with the global scanning queue.

    Permits pausing, resuming, or cancelling the background worker thread.
    Cancelling flushes all pending uploads from the SQL store.
    """
    if req.action == "pause":
        if state.SCAN_STATE == "running":
            state.SCAN_STATE = "paused"
            state.add_log("Scan paused.")
    elif req.action == "resume":
        if state.SCAN_STATE == "paused":
            state.SCAN_STATE = "running"
            state.add_log("Scan resumed.")
    elif req.action == "cancel":
        state.SCAN_STATE = "idle"
        state.current_scan_total = 0
        state.current_scan_processed = 0

        # We need a new connection since this is a quick action outside a Depends context for speed,
        # but optimally we'd inject it. For now, inline connection.
        from core.config import DB_FILE

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM photos WHERE status = 'pending'")
        conn.commit()
        conn.close()

        state.add_log("Scan cancelled. Pending items removed from queue.")
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    return {"state": state.SCAN_STATE}


@router.get("/status")
async def get_test_status(db: sqlite3.Connection = Depends(get_test_db)) -> dict[str, Any]:
    """Retrieves the current state of the database processing queue."""
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM photos")
    # total parameter removed

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'processed'")
    total_gallery = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'duplicate'")
    total_duplicates = cursor.fetchone()[0]

    return {
        "state": state.SCAN_STATE,
        "total_gallery": total_gallery,
        "total_duplicates": total_duplicates,
        "scan_total": state.current_scan_total,
        "scan_processed": state.current_scan_processed,
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
