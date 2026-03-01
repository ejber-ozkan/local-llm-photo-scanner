"""
API router logic for system-level operations, database migrations, and Ollama configuration.
"""

import asyncio
import contextlib
import os
import sqlite3
from typing import Any

import requests
from fastapi import APIRouter, HTTPException

import core.state as state
from backup_db import backup_database
import core.config as config
from core.config import DB_FILE, DB_TEST_FILE, VERSION
from models.schemas import DatabaseCleanRequest, RestoreRequest, SettingsUpdateRequest
from restore_db import restore_database

router = APIRouter()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic"}


@router.post("/database/clean")
async def clean_database(req: DatabaseCleanRequest) -> dict[str, Any]:
    """Obliterates the database schema and recreates empty tables."""
    if state.SCAN_STATE == "running":
        raise HTTPException(status_code=400, detail="Cannot clean database while a scan is running.")

    target_db = DB_FILE if req.target == "main" else DB_TEST_FILE
    if not os.path.exists(target_db):
        raise HTTPException(status_code=404, detail=f"Database {req.target} not found")

    try:
        conn = sqlite3.connect(target_db)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM entities")
        cursor.execute("DELETE FROM photos")
        cursor.execute("DELETE FROM scan_history")
        # Reset auto-increment counters so IDs start from 1 again
        cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('entities', 'photos', 'scan_history')")
        conn.commit()
        conn.close()

        # Invalidate the gallery filter cache so the UI updates
        from api.routes.gallery import _compute_gallery_filters

        _compute_gallery_filters.cache_clear()

        return {"message": f"{req.target.title()} database cleaned successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clean database: {str(e)}") from e


@router.get("/database/backups")
async def get_backups() -> dict[str, list[dict[str, Any]]]:
    """Returns a list of available database backups."""
    from core.config import BACKUPS_DIR

    if not os.path.exists(BACKUPS_DIR):
        return {"backups": []}

    backups = []
    for f in os.listdir(BACKUPS_DIR):
        if f.endswith(".db") or f.endswith(".sqlite"):
            filepath = os.path.join(BACKUPS_DIR, f)
            size = os.path.getsize(filepath)
            created = os.path.getctime(filepath)
            backups.append({"filename": f, "size": size, "created": created})

    # Sort descending based on 'created'
    backups.sort(key=lambda x: float(str(x.get("created", 0))), reverse=True)
    return {"backups": backups}


@router.post("/database/backup")
async def trigger_backup() -> dict[str, Any]:
    """Triggers an instantaneous synchronous backup copy of the master DB."""
    if state.SCAN_STATE == "running":
        raise HTTPException(status_code=400, detail="Cannot backup while a scan is running.")
    try:
        filename = backup_database()
        return {"message": "Backup created successfully", "filename": filename}
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}") from e


@router.post("/database/restore")
async def trigger_restore(req: RestoreRequest) -> dict[str, Any]:
    """Restores the main database from a specified historical snapshot payload."""
    if state.SCAN_STATE == "running":
        raise HTTPException(status_code=400, detail="Cannot restore while a scan is running.")
    try:
        success = restore_database(req.filename)
        if success:
            # Since restore drops all entities, we must inevitably clear our LRU caches
            from api.routes.gallery import _compute_gallery_filters

            _compute_gallery_filters.cache_clear()

            return {"message": "Database restored successfully"}
        else:
            raise HTTPException(status_code=500, detail="Restore failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}") from e


@router.post("/test/clear")
async def clear_test_db() -> dict[str, Any]:
    """Drops all data in the test database to reset the sandbox."""
    conn = sqlite3.connect(DB_TEST_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM entities")
    cursor.execute("DELETE FROM photos")
    conn.commit()
    conn.close()

    # Also clean uploads folder
    upload_dir = os.path.join(os.getcwd(), "uploads")
    if os.path.exists(upload_dir):
        for f in os.listdir(upload_dir):
            if any(f.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                with contextlib.suppress(Exception):
                    os.remove(os.path.join(upload_dir, f))

    return {"success": True, "message": "Test sandbox cleared"}



@router.get("/models")
async def get_ollama_models() -> dict[str, Any]:
    """Fetches available models from local Ollama and flags vision models."""
    try:
        from core.config import OLLAMA_MODELS_URL

        resp = requests.get(OLLAMA_MODELS_URL, timeout=5)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            # Workaround for Ollama not broadcasting vision capabilities correctly for all architectures
            vision_keywords = [
                "llava",
                "vision",
                "bakllava",
                "minicpm-v",
                "moondream",
                "xcomposer",
                "qwen2-vl",
                "qwen3-vl",
                "pixtral",
            ]
            result = []
            for m in models:
                name = m.get("name")
                is_vision = any(kw in name.lower() for kw in vision_keywords)
                result.append({"name": name, "is_vision": is_vision})
            return {"models": result, "active": config.ACTIVE_OLLAMA_MODEL}
    except Exception as e:
        print(f"Error fetching Ollama models: {e}")
    # Fallback if connection fails
    return {"models": [{"name": config.ACTIVE_OLLAMA_MODEL, "is_vision": True}], "active": config.ACTIVE_OLLAMA_MODEL}


@router.post("/settings/model")
async def update_settings_model(req: SettingsUpdateRequest) -> dict[str, Any]:
    """Updates the active Ollama model for processing."""
    import core.config as config

    config.ACTIVE_OLLAMA_MODEL = req.active_model
    return {"success": True, "active": config.ACTIVE_OLLAMA_MODEL}


@router.get("/version")
async def get_version() -> dict[str, str]:
    """Retrieves the active application version strictly."""
    return {"version": VERSION}
