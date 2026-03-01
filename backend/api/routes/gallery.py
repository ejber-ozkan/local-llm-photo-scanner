import io
import os
import sqlite3
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from PIL import Image

from core.config import DB_FILE
from core.database import get_db

# Register HEIC/HEIF support with Pillow
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass  # pillow-heif not installed; HEIC files will fail gracefully

router = APIRouter()

HEIC_EXTENSIONS = {".heic", ".heif"}


def _serve_image(filepath: str, headers: dict[str, str]) -> Response:
    """Serve an image, converting HEIC/HEIF to JPEG on-the-fly with caching."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext not in HEIC_EXTENSIONS:
        return FileResponse(filepath, headers=headers)

    # Check for a cached JPEG conversion alongside the original
    cached_path = filepath + ".jpg"
    if os.path.exists(cached_path):
        return FileResponse(cached_path, media_type="image/jpeg", headers=headers)

    # Convert HEIC → JPEG and cache to disk
    try:
        img = Image.open(filepath)
        img.save(cached_path, format="JPEG", quality=90)
        return FileResponse(cached_path, media_type="image/jpeg", headers=headers)
    except Exception:
        # Fallback: convert in-memory without caching
        try:
            img = Image.open(filepath)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            buf.seek(0)
            return Response(content=buf.getvalue(), media_type="image/jpeg", headers=headers)
        except Exception:
            # Last resort: serve raw file and let the browser try
            return FileResponse(filepath, headers=headers)


@router.get("/image/{photo_id}", response_model=None)
async def get_image(photo_id: int) -> Response:
    """Returns the actual image file for a given photo ID."""
    # First check main DB
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT filepath FROM photos WHERE id = ?", (photo_id,))
    row = cursor.fetchone()
    conn.close()

    # Force browser to never aggressive cache, preventing ID collisions after DB wipes
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    if not row or not os.path.exists(row[0]):
        raise HTTPException(status_code=404, detail="Image not found")

    return _serve_image(row[0], headers)


@router.get("/photo/{photo_id}/detail")
async def get_photo_detail(photo_id: int, db: sqlite3.Connection = Depends(get_db)) -> dict[str, Any]:
    """Returns comprehensive metadata and entity breakdown for a specific photo."""
    cursor = db.cursor()

    # 1. Fetch Core Metadata
    cursor.execute(
        """
        SELECT id, filepath, filename, description, status, date_created, date_modified, date_taken,
               camera_make, camera_model
        FROM photos WHERE id = ?
    """,
        (photo_id,),
    )

    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Calculate Camera string safely
    make = row[8] or ""
    model = row[9] or ""
    camera_full = f"{make} {model}".strip() if make or model else "Unknown"

    photo_obj = {
        "id": row[0],
        "filepath": row[1],
        "filename": row[2],
        "description": row[3],
        "status": row[4],
        "metadata": {"Date Taken": row[7] or "Unknown", "Date Modified": row[6] or "Unknown", "Camera": camera_full},
    }

    # 2. Fetch Associated Entities
    cursor.execute(
        """
        SELECT id, entity_type, entity_name, bounding_box
        FROM entities
        WHERE photo_id = ?
    """,
        (photo_id,),
    )

    entities = []
    for erow in cursor.fetchall():
        entities.append({"id": erow[0], "type": erow[1], "name": erow[2], "bounding_box": erow[3]})

    photo_obj["entities"] = entities
    return photo_obj


@router.get("/search")
async def search_photos(
    q: str = "",
    name: str = "",
    entity_type: str = "",
    date_from: str = "",
    date_to: str = "",
    camera: str = "",
    has_faces: bool = False,
    unidentified: bool = False,
    sort_by: str = "date_taken",
    sort_dir: str = "desc",
    limit: int = 500,
    db: sqlite3.Connection = Depends(get_db),
) -> list[dict[str, Any]]:
    """Searches photos with full filter and sort support."""
    cursor = db.cursor()

    conditions = ["p.status = 'processed'"]
    params: list[Any] = []
    joins = []

    # Text search
    if q:
        query = f"%{q}%"
        joins.append("LEFT JOIN entities eq ON p.id = eq.photo_id")
        conditions.append("(p.description LIKE ? OR p.filename LIKE ? OR eq.entity_name LIKE ?)")
        params.extend([query, query, query])

    # Filter by entity name
    if name:
        joins.append("JOIN entities en ON p.id = en.photo_id")
        conditions.append("en.entity_name = ?")
        params.append(name)

    # Filter by entity type
    if entity_type:
        joins.append("JOIN entities et ON p.id = et.photo_id" if "en" not in "".join(joins) else "")
        if entity_type == "person":
            conditions.append(
                "EXISTS (SELECT 1 FROM entities e2 WHERE e2.photo_id = p.id AND e2.entity_type = 'person')"
            )
        elif entity_type == "pet":
            conditions.append("EXISTS (SELECT 1 FROM entities e2 WHERE e2.photo_id = p.id AND e2.entity_type = 'pet')")

    # Date range
    if date_from:
        conditions.append("p.date_taken >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("p.date_taken <= ?")
        params.append(date_to + " 23:59:59")

    # Camera filter
    if camera:
        conditions.append("(p.camera_make || ' ' || p.camera_model) = ?")
        params.append(camera)

    # Has faces
    if has_faces:
        conditions.append("EXISTS (SELECT 1 FROM entities e3 WHERE e3.photo_id = p.id AND e3.entity_type = 'person')")

    # Unidentified only
    if unidentified:
        conditions.append(
            "EXISTS (SELECT 1 FROM entities e4 WHERE e4.photo_id = p.id AND e4.entity_name LIKE 'Unknown%')"
        )

    join_sql = " ".join(dict.fromkeys(joins))  # Deduplicate joins
    where_sql = " AND ".join(conditions) if conditions else "1=1"

    # Sort
    sort_column_map = {
        "date_taken": "p.date_taken",
        "date_created": "p.date_created",
        "date_modified": "p.date_modified",
        "name": "p.filename",
        "filename": "p.filename",
    }
    order_col = sort_column_map.get(sort_by, "p.date_taken")
    order_dir = "ASC" if sort_dir.lower() == "asc" else "DESC"
    nulls = "NULLS LAST" if order_dir == "DESC" else "NULLS FIRST"

    sql = f"SELECT DISTINCT p.id, p.filepath, p.filename, p.description, p.date_taken, p.date_created, p.date_modified FROM photos p {join_sql} WHERE {where_sql} ORDER BY {order_col} {order_dir} {nulls} LIMIT ?"
    params.append(limit)

    cursor.execute(sql, params)
    results = cursor.fetchall()

    return [
        {
            "id": row[0],
            "filepath": row[1],
            "filename": row[2],
            "description": row[3],
            "date_taken": row[4],
            "date_created": row[5],
            "date_modified": row[6],
        }
        for row in results
    ]


@router.get("/duplicates")
async def get_duplicates(db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    """Returns grouped duplicate files based on MD5 analysis."""
    cursor = db.cursor()

    # Get all hashes that have duplicates
    cursor.execute("""
        SELECT file_hash, COUNT(*) as duplicate_count
        FROM photos
        WHERE status = 'duplicate' AND file_hash IS NOT NULL
        GROUP BY file_hash
    """)
    hash_groups = cursor.fetchall()

    response_data = []

    for file_hash, duplicate_count in hash_groups:
        cursor.execute(
            """
            SELECT id, filepath, filename, file_size, scanned_at
            FROM photos
            WHERE file_hash = ? AND status = 'processed'
            LIMIT 1
        """,
            (file_hash,),
        )
        original = cursor.fetchone()

        cursor.execute(
            """
            SELECT id, filepath, filename, file_size, scanned_at
            FROM photos
            WHERE file_hash = ? AND status = 'duplicate'
        """,
            (file_hash,),
        )
        duplicates = cursor.fetchall()

        if original and duplicates:
            response_data.append(
                {
                    "hash": file_hash,
                    "count": duplicate_count,
                    "original": {
                        "id": original[0],
                        "filepath": original[1],
                        "filename": original[2],
                        "file_size": original[3],
                        "scanned_at": original[4],
                    },
                    "copies": [
                        {"id": dup[0], "filepath": dup[1], "filename": dup[2], "file_size": dup[3], "scanned_at": dup[4]}
                        for dup in duplicates
                    ],
                }
            )

    return response_data


@router.get("/skipped")
async def get_skipped(db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    """Returns files that were explicitly skipped during import (e.g., screenshots)."""
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT id, filepath, filename, file_size, description, scanned_at
        FROM photos
        WHERE status = 'screenshot' OR status = 'error'
        ORDER BY id DESC
    """
    )
    skipped = cursor.fetchall()
    
    return [
        {
            "id": row[0],
            "filepath": row[1],
            "filename": row[2],
            "file_size": row[3],
            "reason": row[4] or "Skipped: Not imported",
            "scanned_at": row[5],
        }
        for row in skipped
    ]


@lru_cache(maxsize=1)
def _compute_gallery_filters(db_file: str) -> dict[str, Any]:
    """Deterministically cache the gallery filters to avoid redundant DB aggregation queries."""
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Get all unique named entities (non-Unknown)
    cursor.execute(
        "SELECT DISTINCT entity_name, entity_type FROM entities WHERE entity_name NOT LIKE 'Unknown%' ORDER BY entity_name"
    )
    named_entities = [{"name": r[0], "type": r[1]} for r in cursor.fetchall()]

    # Get all unique cameras
    cursor.execute(
        "SELECT DISTINCT camera_make || ' ' || camera_model FROM photos WHERE camera_make IS NOT NULL AND camera_make != '' AND status = 'processed' ORDER BY 1"
    )
    cameras = [r[0] for r in cursor.fetchall() if r[0] and r[0].strip()]

    # Get date range
    cursor.execute(
        "SELECT MIN(date_taken), MAX(date_taken) FROM photos WHERE date_taken IS NOT NULL AND date_taken != '' AND status = 'processed'"
    )
    date_range = cursor.fetchone()

    # Counts for quick stats
    cursor.execute(
        "SELECT COUNT(DISTINCT e.photo_id) FROM entities e JOIN photos p ON e.photo_id = p.id WHERE e.entity_type = 'person' AND p.status = 'processed'"
    )
    photos_with_faces = cursor.fetchone()[0]

    cursor.execute(
        "SELECT COUNT(DISTINCT e.photo_id) FROM entities e JOIN photos p ON e.photo_id = p.id WHERE e.entity_name LIKE 'Unknown%' AND p.status = 'processed'"
    )
    photos_unidentified = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'processed'")
    total_photos = cursor.fetchone()[0]

    conn.close()

    return {
        "names": named_entities,
        "cameras": cameras,
        "date_min": date_range[0] if date_range else None,
        "date_max": date_range[1] if date_range else None,
        "total_photos": total_photos,
        "photos_with_faces": photos_with_faces,
        "photos_unidentified": photos_unidentified,
    }


@router.get("/gallery/filters")
async def get_gallery_filters() -> dict[str, Any]:
    """Returns available filter options dynamically computed for the frontend gallery."""
    # We call the cached synchronous method (cannot lru_cache the async route directly well)
    return _compute_gallery_filters(DB_FILE)


@router.get("/gallery/years")
async def get_gallery_years(db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    """Returns years that have photos, with counts, for the timeline sidebar."""
    cursor = db.cursor()
    cursor.execute("""
        SELECT SUBSTR(date_taken, 1, 4) as year, COUNT(*) as count
        FROM photos
        WHERE date_taken IS NOT NULL AND date_taken != '' AND status = 'processed'
        GROUP BY year
        ORDER BY year DESC
    """)
    years = [{"year": r[0], "count": r[1]} for r in cursor.fetchall() if r[0] and r[0].strip()]
    return years
