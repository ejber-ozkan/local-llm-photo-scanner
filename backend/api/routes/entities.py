"""
API Router grouping entity naming, extraction, and management algorithms.
"""

import sqlite3
from typing import Any

from fastapi import APIRouter, Depends

from core.config import DB_FILE, DB_TEST_FILE
from core.database import get_db
from models.schemas import UpdateEntityRequest

router = APIRouter()


def parse_name(full_name: str) -> tuple[str, str]:
    """Splits a full name into first and last name components."""
    parts = full_name.strip().split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


@router.get("/photo/{photo_id}/entities")
async def get_photo_entities(photo_id: int, db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    """Gets ALL entities (both identified and unidentified) for a specific photo."""
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT e.id, e.entity_type, e.entity_name, e.bounding_box
        FROM entities e
        WHERE e.photo_id = ?
    """,
        (photo_id,),
    )
    results = cursor.fetchall()
    return [{"id": row[0], "type": row[1], "name": row[2], "bounding_box": row[3]} for row in results]


@router.get("/unidentified")
async def get_unidentified_entities(db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    """Gets a list of people/pets that currently have an 'Unknown' name."""
    cursor = db.cursor()
    # Group by name to just return one instance of each unknown person/pet
    cursor.execute("""
        SELECT e.id, e.entity_type, e.entity_name, p.id, e.bounding_box
        FROM entities e
        JOIN photos p ON e.photo_id = p.id
        WHERE e.entity_name LIKE 'Unknown%' AND p.status = 'processed'
        GROUP BY e.entity_name, e.entity_type
    """)
    results = cursor.fetchall()

    return [
        {"id": row[0], "type": row[1], "name": row[2], "photo_id": row[3], "bounding_box": row[4]} for row in results
    ]


@router.post("/entities/name")
async def name_main_entity(req: UpdateEntityRequest, db: sqlite3.Connection = Depends(get_db)) -> dict[str, Any]:
    """Updates the name of a person in the MAIN database globally."""
    cursor = db.cursor()

    old_name = str(req.entity_id)
    new_name = str(req.new_name).strip() if req.new_name else ""

    # Check if we are merging with an existing named person
    cursor.execute(
        "SELECT first_name, last_name FROM entities WHERE entity_type = 'person' AND entity_name = ? COLLATE NOCASE LIMIT 1",
        (new_name,),
    )
    existing_person = cursor.fetchone()

    if existing_person:
        first, last = existing_person
    else:
        first, last = parse_name(new_name)

    cursor.execute(
        "UPDATE entities SET entity_name = ?, first_name = ?, last_name = ? WHERE entity_name = ?",
        (new_name, first, last, old_name),
    )
    db.commit()

    # We must globally clear the gallery LRU cache when a name is merged so it updates
    from api.routes.gallery import _compute_gallery_filters

    _compute_gallery_filters.cache_clear()

    return {"success": True, "updated": old_name, "to": new_name}


@router.delete("/entities/{entity_name}")
async def delete_main_entity(entity_name: str, db: sqlite3.Connection = Depends(get_db)) -> dict[str, Any]:
    """Deletes all entities in the MAIN db matching the specific name."""
    cursor = db.cursor()
    cursor.execute("DELETE FROM entities WHERE entity_name = ?", (entity_name,))
    db.commit()

    # We must globally clear the gallery LRU cache when a name is dropped
    from api.routes.gallery import _compute_gallery_filters

    _compute_gallery_filters.cache_clear()

    return {"success": True, "deleted": entity_name}


@router.post("/test/entities/name")
async def name_test_entity(req: UpdateEntityRequest) -> dict[str, Any]:
    """Updates the name of a person in the TEST database."""
    # We manage connections manually since we act on both test and prod
    conn = sqlite3.connect(DB_TEST_FILE)
    cursor = conn.cursor()

    old_name = str(req.entity_id)  # ScanTest passes the current name as the ID
    new_name = str(req.new_name).strip() if req.new_name else ""

    # Check if this person already exists in the test DB to merge identities
    cursor.execute(
        "SELECT first_name, last_name FROM entities WHERE entity_type = 'person' AND entity_name = ? COLLATE NOCASE LIMIT 1",
        (new_name,),
    )
    existing_person = cursor.fetchone()

    if existing_person:
        first, last = existing_person
    else:
        # Check main DB for the identity
        try:
            main_conn = sqlite3.connect(DB_FILE)
            main_cursor = main_conn.cursor()
            main_cursor.execute(
                "SELECT first_name, last_name FROM entities WHERE entity_type = 'person' AND entity_name = ? COLLATE NOCASE LIMIT 1",
                (new_name,),
            )
            main_existing = main_cursor.fetchone()
            main_conn.close()

            if main_existing:
                first, last = main_existing
            else:
                first, last = parse_name(new_name)
        except Exception:
            first, last = parse_name(new_name)

    cursor.execute(
        "UPDATE entities SET entity_name = ?, first_name = ?, last_name = ? WHERE entity_name = ?",
        (new_name, first, last, old_name),
    )
    conn.commit()
    conn.close()

    return {"success": True, "updated": old_name, "to": new_name}


@router.delete("/test/entities/{entity_name}")
async def delete_test_entity(entity_name: str) -> dict[str, Any]:
    """Deletes all entities in the TEST db matching the specific name."""
    conn = sqlite3.connect(DB_TEST_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM entities WHERE entity_name = ?", (entity_name,))
    conn.commit()
    conn.close()
    return {"success": True, "deleted": entity_name}
