"""
Core background processing worker responsible for iterative image analysis.
"""

import hashlib
import json
import os
import sqlite3
import time
from datetime import datetime

import cv2
import numpy as np

try:
    from deepface import DeepFace  # type: ignore

    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False
    print("WARNING: DeepFace is not installed. Facial recognition features will be disabled.")

import core.state as state
from core.config import ACTIVE_OLLAMA_MODEL, DB_FILE, OLLAMA_URL
from database_setup import find_best_face_match
from services.image_service import extract_exif_for_filters, process_image_with_ollama


def background_processor() -> None:
    """Background task to find pending photos and process them.

    Continuously polls the database for photos with a 'pending' status. Coordinates
    EXIF extraction, facial recognition clustering using DeepFace, and image
    description analysis via Ollama. It saves the final metadata and updates
    the status to 'processed' or 'error'.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    while True:
        if state.SCAN_STATE == "idle":
            break

        if state.SCAN_STATE == "paused":
            time.sleep(1)
            continue

        cursor.execute("SELECT id, filepath FROM photos WHERE status = 'pending' LIMIT 1")
        pending_photo = cursor.fetchone()

        if not pending_photo:
            state.SCAN_STATE = "idle"
            state.current_scan_total = 0
            state.current_scan_processed = 0
            break

        photo_id, filepath = pending_photo
        state.add_log(f"Processing: {filepath}")
        state.current_scan_processed += 1

        # 0. Check for Screenshots
        filename_lower = os.path.basename(filepath).lower()
        if any(term in filename_lower for term in ["screenshot", "screen shot", "snip", "capture"]):
            state.add_log(f"Skipping screenshot: {filepath}")
            cursor.execute("UPDATE photos SET status = 'screenshot' WHERE id = ?", (photo_id,))
            conn.commit()
            continue

        # 0. Check for Duplicates
        try:
            file_size = os.path.getsize(filepath)
            with open(filepath, "rb") as f:
                file_hash = hashlib.md5(f.read()).hexdigest()

            cursor.execute(
                "SELECT id FROM photos WHERE file_hash = ? AND status = 'processed' AND ai_model = ? LIMIT 1",
                (file_hash, ACTIVE_OLLAMA_MODEL),
            )
            if cursor.fetchone():
                state.add_log(f"Skipping duplicate: {filepath}")
                cursor.execute(
                    "UPDATE photos SET status = 'duplicate', file_size = ?, file_hash = ? WHERE id = ?",
                    (file_size, file_hash, photo_id),
                )
                conn.commit()
                continue

            cursor.execute(
                "UPDATE photos SET file_size = ?, file_hash = ? WHERE id = ?", (file_size, file_hash, photo_id)
            )
        except Exception as e:
            state.add_log(f"Error checking duplicate for {filepath}: {e}")

        # 1. Process with Ollama for description
        ai_response = process_image_with_ollama(filepath, OLLAMA_URL, ACTIVE_OLLAMA_MODEL)
        description = ai_response if ai_response else ""

        # Extract EXIF for filter columns
        exif_info = extract_exif_for_filters(filepath)

        # Extract file dates
        try:
            date_created = datetime.fromtimestamp(os.path.getctime(filepath)).strftime("%Y:%m:%d %H:%M:%S")
        except Exception:
            date_created = None

        try:
            date_modified = datetime.fromtimestamp(os.path.getmtime(filepath)).strftime("%Y:%m:%d %H:%M:%S")
        except Exception:
            date_modified = None

        cursor.execute(
            """
            UPDATE photos SET description = ?, status = 'processed',
            date_taken = ?, camera_make = ?, camera_model = ?, gps_lat = ?, gps_lon = ?, date_created = ?, date_modified = ?, ai_model = ? WHERE id = ?
        """,
            (
                description,
                exif_info["date_taken"],
                exif_info["camera_make"],
                exif_info["camera_model"],
                exif_info["gps_lat"],
                exif_info["gps_lon"],
                date_created,
                date_modified,
                ACTIVE_OLLAMA_MODEL,
                photo_id,
            ),
        )
        conn.commit()  # Commit immediately so description is saved even if DeepFace fails

        # Parse pet extraction from the strict 'Entities: [list]' format
        try:
            if ai_response and "Entities:" in ai_response:
                entities_part = ai_response.split("Entities:")[1].strip()

                # Reject the entire section if it's clearly a negative/empty statement
                negative_starts = ["no ", "none", "n/a", "there are no", "there is no", "not ", "are no"]
                is_negative = any(
                    entities_part.lower().startswith(p) for p in negative_starts
                ) or entities_part.lower() in ["none", "none.", "n/a", ""]

                if not is_negative:
                    pets = [p.strip().rstrip(".").strip() for p in entities_part.split(",") if p.strip()]

                    # Reject list for generic/garbage words that the LLM likes to output
                    reject_words = {
                        "cats",
                        "cat",
                        "dogs",
                        "dog",
                        "pets",
                        "pet",
                        "animals",
                        "animal",
                        "etc",
                        "etc.",
                        "etc.)",
                        "none",
                        "n/a",
                        "visible",
                        "present",
                        "bird",
                        "birds",
                        "fish",
                        "other",
                        "unknown",
                        "there",
                        "the",
                        "a",
                        "an",
                    }

                    for pet in pets:
                        pet_clean = pet.replace(".", "").replace(")", "").replace("(", "").strip()
                        # Must be: 2+ chars, under 25 chars, purely alphanumeric+spaces, not a rejected word,
                        # not containing sentence fragments, and 3 words or fewer
                        if (
                            len(pet_clean) >= 2
                            and len(pet_clean) < 25
                            and pet_clean.lower() not in reject_words
                            and "no " not in pet_clean.lower()
                            and "not " not in pet_clean.lower()
                            and "are " not in pet_clean.lower()
                            and "there " not in pet_clean.lower()
                            and "visible" not in pet_clean.lower()
                            and "present" not in pet_clean.lower()
                            and all(c.isalnum() or c == " " for c in pet_clean)
                            and len(pet_clean.split()) <= 3
                        ):
                            pet_name_formatted = pet_clean.strip().title()
                            cursor.execute(
                                "INSERT INTO entities (photo_id, entity_type, entity_name) VALUES (?, ?, ?)",
                                (photo_id, "pet", f"Unknown {pet_name_formatted}"),
                            )
        except Exception as e:
            print(f"Error parsing pets: {e}")

        # 2. Extract faces with DeepFace
        if DEEPFACE_AVAILABLE:
            try:
                state.add_log(f"Running DeepFace on: {filepath}")
                # OpenCV imread fails silently on Windows paths with Unicode characters (like 'Ä±').
                # We bypass this by reading the file into a NumPy array first, then decoding.
                file_bytes = np.fromfile(filepath, dtype=np.uint8)
                img_array = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

                if img_array is None:
                    raise ValueError("cv2.imdecode failed to decode the image file.")

                # We use enforce_detection=True so it raises exception if no face
                representations = DeepFace.represent(
                    img_path=img_array, model_name="VGG-Face", detector_backend="retinaface", enforce_detection=True
                )

                for rep in representations:
                    embedding = rep.get("embedding")
                    facial_area = rep.get("facial_area", {})  # {x, y, w, h, left_eye, right_eye}
                    face_confidence = rep.get("face_confidence", 1.0)  # VGG-Face provides this

                    # Must have an embedding, confidence, AND landmark eyes to prevent hallucinated boxes
                    has_eyes = facial_area.get("left_eye") is not None and facial_area.get("right_eye") is not None

                    if embedding and face_confidence > 0.85 and has_eyes:
                        # Find an existing matching person or create a new unknown one
                        matched_name = find_best_face_match(embedding, conn)

                        if not matched_name:
                            # Generate a new unknown name
                            cursor.execute(
                                "SELECT COUNT(*) FROM entities WHERE entity_type = 'person' AND entity_name LIKE 'Unknown Person%'"
                            )
                            unknown_count = cursor.fetchone()[0]
                            matched_name = f"Unknown Person {unknown_count + 1}"

                        # Insert new entity
                        cursor.execute(
                            """
                            INSERT INTO entities (photo_id, entity_type, entity_name, bounding_box, embedding)
                            VALUES (?, ?, ?, ?, ?)
                        """,
                            (
                                photo_id,
                                "person",
                                matched_name,
                                json.dumps(facial_area) if facial_area else None,
                                json.dumps(embedding),
                            ),
                        )
            except ValueError:
                # No face found
                state.add_log(f"No face found in {filepath}")
            except Exception as e:
                state.add_log(f"DeepFace processing error for {filepath}: {e}")
                print(f"DeepFace processing error for {filepath}: {e}")

        conn.commit()

    state.add_log("Background processor finished queue.")
    state.current_scan_total = 0
    state.current_scan_processed = 0
    conn.close()
