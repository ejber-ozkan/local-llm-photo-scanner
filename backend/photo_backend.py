import os
import sqlite3
import base64
import requests
import asyncio
import json
import numpy as np
import hashlib
from fastapi import FastAPI, BackgroundTasks, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import threading
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import collections
from datetime import datetime
import backup_db
import restore_db

# In-memory store for background scanning logs
scan_logs = collections.deque(maxlen=500)

# Global scan state: 'idle', 'running', 'paused'
SCAN_STATE = 'idle'

def add_log(msg: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = f"[{timestamp}] {msg}"
    scan_logs.append(log_entry)
    print(msg)


try:
    import tkinter as tk
    from tkinter import filedialog
    TKINTER_AVAILABLE = True
except ImportError:
    TKINTER_AVAILABLE = False

try:
    from deepface import DeepFace
    import cv2
    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False
    print("Warning: DeepFace or cv2 not available. Face clustering will not work.")

# ==========================================
# CONFIGURATION
# ==========================================
OLLAMA_URL = "http://localhost:11434/api/generate"
ACTIVE_OLLAMA_MODEL = "llava:13b" # Recommended vision model
DB_FILE = "photometadata.db"
DB_TEST_FILE = "test_photometadata.db"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

app = FastAPI(title="Local Photo AI Backend")

# Allow React frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# DATABASE SETUP
# ==========================================
def init_db():
    for db in [DB_FILE, DB_TEST_FILE]:
        init_single_db(db)

def init_single_db(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Table for Photos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filepath TEXT UNIQUE,
            filename TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending', -- pending, processed, error, duplicate, screenshot
            file_size INTEGER,
            file_hash TEXT,
            ai_model TEXT
        )
    ''')
    # Table for detected entities (People, Pets)
    cursor.execute('''
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
    ''')
    # Table for scan history
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            directory_path TEXT UNIQUE,
            last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Migration: Add columns for filter support (safe to run on existing DBs)
    columns_to_add = [
        'date_taken TEXT', 'camera_make TEXT', 'camera_model TEXT', 
        'gps_lat REAL', 'gps_lon REAL', 'date_created TEXT', 'date_modified TEXT',
        'file_size INTEGER', 'file_hash TEXT', 'ai_model TEXT'
    ]
    for col in columns_to_add:
        try:
            # Need to extract just the column name for the try block just in case it's poorly formed, 
            # SQLite does "ALTER TABLE table ADD COLUMN col_name format"
            cursor.execute(f'ALTER TABLE photos ADD COLUMN {col}')
        except sqlite3.OperationalError:
            pass  # Column already exists
    conn.commit()
    conn.close()

init_db()

def _convert_gps_to_decimal(gps_coords, gps_ref):
    """Converts GPS coordinates from degrees/minutes/seconds to decimal."""
    try:
        d = float(gps_coords[0])
        m = float(gps_coords[1])
        s = float(gps_coords[2])
        decimal = d + (m / 60.0) + (s / 3600.0)
        if gps_ref in ['S', 'W']:
            decimal = -decimal
        return round(decimal, 6)
    except Exception:
        return None

def extract_gps_from_exif(filepath: str) -> dict:
    """Extracts GPS latitude and longitude from a photo's EXIF data."""
    result = {'gps_lat': None, 'gps_lon': None}
    try:
        with Image.open(filepath) as img:
            exif_data = img.getexif()
            if exif_data and hasattr(exif_data, 'get_ifd'):
                try:
                    gps_ifd = exif_data.get_ifd(0x8825)  # GPSInfo IFD
                    if gps_ifd:
                        gps_lat = gps_ifd.get(2)   # GPSLatitude
                        gps_lat_ref = gps_ifd.get(1)  # GPSLatitudeRef (N/S)
                        gps_lon = gps_ifd.get(4)   # GPSLongitude  
                        gps_lon_ref = gps_ifd.get(3)  # GPSLongitudeRef (E/W)
                        
                        if gps_lat and gps_lat_ref and gps_lon and gps_lon_ref:
                            result['gps_lat'] = _convert_gps_to_decimal(gps_lat, gps_lat_ref)
                            result['gps_lon'] = _convert_gps_to_decimal(gps_lon, gps_lon_ref)
                except Exception:
                    pass
    except Exception:
        pass
    return result

def extract_exif_for_filters(filepath: str) -> dict:
    """Extracts date_taken, camera_make, camera_model, and GPS from a photo's EXIF."""
    result = {'date_taken': None, 'camera_make': None, 'camera_model': None, 'gps_lat': None, 'gps_lon': None}
    try:
        with Image.open(filepath) as img:
            exif_data = img.getexif()
            if exif_data:
                result['camera_make'] = str(exif_data.get(271, '')) or None  # Tag 271 = Make
                result['camera_model'] = str(exif_data.get(272, '')) or None  # Tag 272 = Model
                
                # Try DateTimeOriginal from EXIF IFD first, then fallback to DateTime
                if hasattr(exif_data, 'get_ifd'):
                    try:
                        ifd = exif_data.get_ifd(0x8769)
                        dt = ifd.get(36867)  # DateTimeOriginal
                        if dt:
                            result['date_taken'] = str(dt)
                    except Exception:
                        pass
                    
                    # GPS extraction
                    try:
                        gps_ifd = exif_data.get_ifd(0x8825)
                        if gps_ifd:
                            gps_lat = gps_ifd.get(2)
                            gps_lat_ref = gps_ifd.get(1)
                            gps_lon = gps_ifd.get(4)
                            gps_lon_ref = gps_ifd.get(3)
                            if gps_lat and gps_lat_ref and gps_lon and gps_lon_ref:
                                result['gps_lat'] = _convert_gps_to_decimal(gps_lat, gps_lat_ref)
                                result['gps_lon'] = _convert_gps_to_decimal(gps_lon, gps_lon_ref)
                    except Exception:
                        pass
                
                if not result['date_taken']:
                    dt = exif_data.get(306)  # Tag 306 = DateTime
                    if dt:
                        result['date_taken'] = str(dt)
                
                # Clean up empty strings
                for k in ['date_taken', 'camera_make', 'camera_model']:
                    if result[k] == '' or result[k] == 'None':
                        result[k] = None
    except Exception:
        pass
    return result

# ==========================================
# MODELS
# ==========================================
class ScanRequest(BaseModel):
    directory_path: str
    force_rescan: bool = False

class SettingsUpdateRequest(BaseModel):
    model_name: str

class SearchResponse(BaseModel):
    id: int
    filepath: str
    filename: str
    description: Optional[str]

class UpdateEntityRequest(BaseModel):
    # Depending on the route (gallery vs test), this could be an integer ID or a string Name
    entity_id: str | int
    new_name: str

# ==========================================
# AI PROCESSING LOGIC
# ==========================================
def encode_image_to_base64(filepath):
    with open(filepath, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def process_image_with_ollama(filepath: str, override_model: str = None):
    """Sends the image to local Ollama. Defaults to ACTIVE_OLLAMA_MODEL if no override is provided."""
    try:
        base64_image = encode_image_to_base64(filepath)
        
        prompt = (
            "Describe this image in detail. "
            "Also, explicitly list if there are any pets (dogs, cats, etc.) in the photo. "
            "Format the output strictly as: 'Description: [description]. Entities: [comma separated list of pet entities]'"
        )

        model_to_use = override_model if override_model else ACTIVE_OLLAMA_MODEL

        payload = {
            "model": model_to_use,
            "prompt": prompt,
            "stream": False,
            "images": [base64_image]
        }

        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        response.raise_for_status()
        
        result_text = response.json().get("response", "")
        return result_text
    except Exception as e:
        print(f"Error processing {filepath} with Ollama: {e}")
        return None

def find_best_face_match(embedding, conn):
    cursor = conn.cursor()
    cursor.execute("SELECT entity_name, embedding FROM entities WHERE entity_type = 'person'")
    known_faces = cursor.fetchall()
    
    best_match_name = None
    best_distance = float('inf')
    THRESHOLD = 0.40 # Typical threshold for VGG-Face cosine distance
    
    emb_array = np.array(embedding)
    emb_norm = np.linalg.norm(emb_array)
    if emb_norm == 0:
        return None
        
    for k_name, k_emb_json in known_faces:
        if not k_emb_json: continue
        try:
            k_emb = np.array(json.loads(k_emb_json))
            k_norm = np.linalg.norm(k_emb)
            if k_norm == 0: continue
            
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

def background_processor():
    """Background task to find pending photos and process them."""
    global SCAN_STATE
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    while True:
        if SCAN_STATE == 'idle':
            break
            
        if SCAN_STATE == 'paused':
            import time
            time.sleep(1)
            continue

        cursor.execute("SELECT id, filepath FROM photos WHERE status = 'pending' LIMIT 1")
        pending_photo = cursor.fetchone()
        
        if not pending_photo:
            SCAN_STATE = 'idle'
            break
            
        photo_id, filepath = pending_photo
        add_log(f"Processing: {filepath}")
        
        # 0. Check for Screenshots
        filename_lower = os.path.basename(filepath).lower()
        if any(term in filename_lower for term in ['screenshot', 'screen shot', 'snip', 'capture']):
            add_log(f"Skipping screenshot: {filepath}")
            cursor.execute("UPDATE photos SET status = 'screenshot' WHERE id = ?", (photo_id,))
            conn.commit()
            continue
            
        # 0. Check for Duplicates
        try:
            file_size = os.path.getsize(filepath)
            with open(filepath, "rb") as f:
                file_hash = hashlib.md5(f.read()).hexdigest()
                
            cursor.execute("SELECT id FROM photos WHERE file_hash = ? AND status = 'processed' LIMIT 1", (file_hash,))
            if cursor.fetchone():
                add_log(f"Skipping duplicate: {filepath}")
                cursor.execute("UPDATE photos SET status = 'duplicate', file_size = ?, file_hash = ? WHERE id = ?", (file_size, file_hash, photo_id))
                conn.commit()
                continue
                
            cursor.execute("UPDATE photos SET file_size = ?, file_hash = ? WHERE id = ?", (file_size, file_hash, photo_id))
        except Exception as e:
            add_log(f"Error checking duplicate for {filepath}: {e}")
        
        # 1. Process with Ollama for description
        ai_response = process_image_with_ollama(filepath)
        description = ai_response if ai_response else ""
        
        # Extract EXIF for filter columns
        exif_info = extract_exif_for_filters(filepath)
        
        # Extract file dates
        try:
            date_created = datetime.fromtimestamp(os.path.getctime(filepath)).strftime("%Y:%m:%d %H:%M:%S")
        except:
            date_created = None
            
        try:
            date_modified = datetime.fromtimestamp(os.path.getmtime(filepath)).strftime("%Y:%m:%d %H:%M:%S")
        except:
            date_modified = None
            
        cursor.execute('''
            UPDATE photos SET description = ?, status = 'processed', 
            date_taken = ?, camera_make = ?, camera_model = ?, gps_lat = ?, gps_lon = ?, date_created = ?, date_modified = ?, ai_model = ? WHERE id = ?
        ''', (description, exif_info['date_taken'], exif_info['camera_make'], exif_info['camera_model'], exif_info['gps_lat'], exif_info['gps_lon'], date_created, date_modified, ACTIVE_OLLAMA_MODEL, photo_id))
        conn.commit() # Commit immediately so description is saved even if DeepFace fails
        
        # Parse pet extraction from the strict 'Entities: [list]' format
        try:
            if "Entities:" in ai_response:
                entities_part = ai_response.split("Entities:")[1].strip()
                
                # Reject the entire section if it's clearly a negative/empty statement
                negative_starts = ["no ", "none", "n/a", "there are no", "there is no", "not ", "are no"]
                is_negative = any(entities_part.lower().startswith(p) for p in negative_starts) or entities_part.lower() in ["none", "none.", "n/a", ""]
                
                if not is_negative:
                    pets = [p.strip().rstrip('.').strip() for p in entities_part.split(",") if p.strip()]
                    
                    # Reject list for generic/garbage words that the LLM likes to output
                    reject_words = {
                        "cats", "cat", "dogs", "dog", "pets", "pet", "animals", "animal",
                        "etc", "etc.", "etc.)", "none", "n/a", "visible", "present",
                        "bird", "birds", "fish", "other", "unknown", "there", "the", "a", "an"
                    }
                    
                    for pet in pets:
                        pet_clean = pet.replace(".", "").replace(")", "").replace("(", "").strip()
                        # Must be: 2+ chars, under 25 chars, purely alphanumeric+spaces, not a rejected word, 
                        # not containing sentence fragments, and 3 words or fewer
                        if (len(pet_clean) >= 2 
                            and len(pet_clean) < 25 
                            and pet_clean.lower() not in reject_words
                            and "no " not in pet_clean.lower()
                            and "not " not in pet_clean.lower()
                            and "are " not in pet_clean.lower()
                            and "there " not in pet_clean.lower()
                            and "visible" not in pet_clean.lower()
                            and "present" not in pet_clean.lower()
                            and all(c.isalnum() or c == ' ' for c in pet_clean)
                            and len(pet_clean.split()) <= 3):
                            pet_name_formatted = pet_clean.strip().title()
                            cursor.execute("INSERT INTO entities (photo_id, entity_type, entity_name) VALUES (?, ?, ?)", (photo_id, 'pet', f"Unknown {pet_name_formatted}"))
        except Exception as e:
            print(f"Error parsing pets: {e}")

        # 2. Extract faces with DeepFace
        if DEEPFACE_AVAILABLE:
            try:
                add_log(f"Running DeepFace on: {filepath}")
                # OpenCV imread fails silently on Windows paths with Unicode characters (like 'ı').
                # We bypass this by reading the file into a NumPy array first, then decoding.
                file_bytes = np.fromfile(filepath, dtype=np.uint8)
                img_array = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
                
                if img_array is None:
                    raise ValueError("cv2.imdecode failed to decode the image file.")

                # We use enforce_detection=True so it raises exception if no face
                representations = DeepFace.represent(img_path=img_array, model_name="VGG-Face", detector_backend="retinaface", enforce_detection=True)
                
                for rep in representations:
                    embedding = rep.get("embedding")
                    facial_area = rep.get("facial_area", {}) # {x, y, w, h, left_eye, right_eye}
                    face_confidence = rep.get("face_confidence", 1.0) # VGG-Face provides this
                    
                    # Must have an embedding, confidence, AND landmark eyes to prevent hallucinated boxes
                    has_eyes = facial_area.get('left_eye') is not None and facial_area.get('right_eye') is not None
                    
                    if embedding and face_confidence > 0.85 and has_eyes:
                        # Find an existing matching person or create a new unknown one
                        matched_name = find_best_face_match(embedding, conn)
                        
                        if not matched_name:
                            # Generate a new unknown name
                            cursor.execute("SELECT COUNT(*) FROM entities WHERE entity_type = 'person' AND entity_name LIKE 'Unknown Person%'")
                            unknown_count = cursor.fetchone()[0]
                            matched_name = f"Unknown Person {unknown_count + 1}"
                            
                        # Insert new entity
                        cursor.execute("""
                            INSERT INTO entities (photo_id, entity_type, entity_name, bounding_box, embedding)
                            VALUES (?, ?, ?, ?, ?)
                        """, (
                            photo_id, 
                            'person', 
                            matched_name, 
                            json.dumps(facial_area) if facial_area else None,
                            json.dumps(embedding)
                        ))
            except ValueError:
                # No face found
                add_log(f"No face found in {filepath}")
            except Exception as e:
                add_log(f"DeepFace processing error for {filepath}: {e}")
                print(f"DeepFace processing error for {filepath}: {e}")

        conn.commit()
    
    add_log("Background processor finished queue.")
    conn.close()

# ==========================================
# API ENDPOINTS
# ==========================================
@app.get("/api/image/{photo_id}")
async def get_image(photo_id: int):
    """Serves the actual image file given a photo ID."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT filepath FROM photos WHERE id = ?", (photo_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not os.path.exists(row[0]):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(row[0])

@app.get("/api/photo/{photo_id}/detail")
async def get_photo_detail(photo_id: int):
    """Returns full photo detail: description, entities, and live EXIF metadata."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, filepath, filename, description, gps_lat, gps_lon, ai_model FROM photos WHERE id = ?", (photo_id,))
    photo = cursor.fetchone()
    if not photo:
        conn.close()
        raise HTTPException(status_code=404, detail="Photo not found")
    
    gps_lat = photo[4]
    gps_lon = photo[5]
    ai_model = photo[6]
    
    # Get entities
    cursor.execute("""
        SELECT e.id, e.entity_type, e.entity_name, e.bounding_box
        FROM entities e WHERE e.photo_id = ?
    """, (photo_id,))
    entities = [{"id": r[0], "type": r[1], "name": r[2], "bounding_box": r[3]} for r in cursor.fetchall()]
    conn.close()
    
    # Live GPS fallback if not stored in DB
    filepath = photo[1]
    if gps_lat is None or gps_lon is None:
        gps_data = extract_gps_from_exif(filepath)
        gps_lat = gps_data.get('gps_lat')
        gps_lon = gps_data.get('gps_lon')
    
    # Live EXIF extraction
    metadata = {}
    try:
        with Image.open(filepath) as img:
            metadata["Dimensions"] = f"{img.width} x {img.height}"
            exif_data = img.getexif()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if isinstance(value, bytes):
                        try:
                            value = value.decode('utf-8')
                        except UnicodeDecodeError:
                            continue
                    if isinstance(value, (int, float, str)) and tag != "MakerNote" and len(str(value)) < 255:
                        metadata[str(tag)] = str(value)
                
                if hasattr(exif_data, 'get_ifd'):
                    try:
                        ifd = exif_data.get_ifd(0x8769)
                        for tag_id, value in ifd.items():
                            tag = TAGS.get(tag_id, tag_id)
                            if tag == "ExposureTime":
                                try:
                                    v = float(value)
                                    metadata["Exposure Time"] = f"1/{int(1/v)} sec." if 0 < v < 1 else f"{v} sec."
                                except: pass
                            elif tag == "FNumber":
                                try: metadata["F-stop"] = f"f/{float(value):.1f}"
                                except: pass
                            elif tag == "ISOSpeedRatings":
                                metadata["ISO Speed"] = f"ISO-{value}"
                            elif tag == "FocalLength":
                                try: metadata["Focal Length"] = f"{float(value):.1f} mm"
                                except: pass
                            elif tag == "DateTimeOriginal":
                                metadata["Date taken"] = str(value)
                            elif isinstance(value, bytes):
                                pass
                            elif isinstance(value, (int, float, str)) and tag != "MakerNote" and len(str(value)) < 255:
                                metadata[str(tag)] = str(value)
                    except Exception:
                        pass
    except Exception:
        pass
    
    return {
        "id": photo[0],
        "filepath": photo[1],
        "filename": photo[2],
        "description": photo[3] or "",
        "entities": entities,
        "metadata": metadata,
        "gps_lat": gps_lat,
        "gps_lon": gps_lon,
        "ai_model": ai_model or "Unknown Model"
    }

@app.post("/api/scan")
async def scan_directory(req: ScanRequest, background_tasks: BackgroundTasks):
    """Scans a local directory and adds new images to the database queue."""
    global SCAN_STATE
    add_log(f"Starting scan of directory: {req.directory_path}")
    if not os.path.exists(req.directory_path):
        add_log("Directory does not exist. Aborting.")
        raise HTTPException(status_code=400, detail="Directory does not exist")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    added_count = 0

    for root, _, files in os.walk(req.directory_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                full_path = os.path.join(root, file)
                try:
                    cursor.execute(
                        "INSERT INTO photos (filepath, filename) VALUES (?, ?)", 
                        (full_path, file)
                    )
                    added_count += 1
                except sqlite3.IntegrityError:
                    if req.force_rescan:
                        # File already exists but user wants to force a full re-process.
                        # Drop it back to pending and wipe its old entities.
                        cursor.execute("SELECT id FROM photos WHERE filepath = ?", (full_path,))
                        existing_photo = cursor.fetchone()
                        if existing_photo:
                            p_id = existing_photo[0]
                            cursor.execute("UPDATE photos SET status = 'pending' WHERE id = ?", (p_id,))
                            cursor.execute("DELETE FROM entities WHERE photo_id = ?", (p_id,))
                            added_count += 1
                    else:
                        pass # Normal scan, skip existing files

    conn.commit()
    
    # Record scan history
    try:
        cursor.execute('''
            INSERT INTO scan_history (directory_path) 
            VALUES (?) 
            ON CONFLICT(directory_path) 
            DO UPDATE SET last_scanned = CURRENT_TIMESTAMP
        ''', (req.directory_path,))
        conn.commit()
    except Exception as e:
        add_log(f"Failed to record scan history: {e}")
        
    conn.close()
    
    add_log(f"Directory scan complete. Queued {added_count} new photos for processing.")
    
    # Trigger background processing
    if SCAN_STATE == 'idle':
        SCAN_STATE = 'running'
        background_tasks.add_task(background_processor)
        add_log("Background processor tasked.")
    
    return {"message": f"Scan complete. Added {added_count} new images to processing queue."}

class ScanControlRequest(BaseModel):
    action: str # "pause", "resume", "cancel"

@app.post("/api/scan/control")
async def control_scan(req: ScanControlRequest, background_tasks: BackgroundTasks):
    global SCAN_STATE
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    if req.action == "pause":
        if SCAN_STATE == 'running':
            SCAN_STATE = 'paused'
            add_log("Scan paused by user.")
    elif req.action == "resume":
        if SCAN_STATE in ['paused', 'idle']:
            SCAN_STATE = 'running'
            background_tasks.add_task(background_processor)
            add_log("Scan resumed by user.")
    elif req.action == "cancel":
        SCAN_STATE = 'idle'
        cursor.execute("DELETE FROM photos WHERE status = 'pending'")
        conn.commit()
        add_log("Scan canceled by user. Pending photos removed from queue.")
        
    conn.close()
    return {"success": True, "state": SCAN_STATE}

@app.get("/api/scan/history")
async def get_scan_history():
    """Returns the list of previously scanned directories, ordered by most recent."""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT directory_path, last_scanned FROM scan_history ORDER BY last_scanned DESC")
        history = [{"directory_path": row[0], "last_scanned": row[1]} for row in cursor.fetchall()]
        conn.close()
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch scan history: {str(e)}")

@app.get("/api/scan/status")
async def get_scan_status():
    global SCAN_STATE
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM photos")
    total = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'processed'")
    processed = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM photos WHERE status = 'pending'")
    pending = cursor.fetchone()[0]

    conn.close()
    
    return {
        "state": SCAN_STATE,
        "total": total,
        "processed": processed,
        "pending": pending
    }

class DatabaseCleanRequest(BaseModel):
    target: str # 'main' or 'test'

@app.post("/api/database/clean")
async def clean_database(req: DatabaseCleanRequest):
    global SCAN_STATE
    
    if req.target not in ['main', 'test']:
        raise HTTPException(status_code=400, detail="Invalid target database")
        
    db_path = DB_TEST_FILE if req.target == 'test' else DB_FILE
    
    # Safety: abort any running scans just in case
    SCAN_STATE = 'idle'
    add_log(f"Received request to clean {req.target} database.")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        # Drop the tables to completely obliterate existing data
        cursor.execute("DROP TABLE IF EXISTS entities")
        cursor.execute("DROP TABLE IF EXISTS photos")
        cursor.execute("DROP TABLE IF EXISTS scan_history")
        conn.commit()
        conn.close()
        
        # Re-initialize the schema for that specific database
        init_single_db(db_path)
        add_log(f"Successfully cleaned and re-initialized {req.target} database.")
        return {"success": True, "message": f"{req.target.capitalize()} database cleaned successfully."}
    except Exception as e:
        error_msg = f"Failed to clean database: {str(e)}"
        add_log(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

class RestoreRequest(BaseModel):
    filename: str

@app.get("/api/database/backups")
async def get_backups():
    """Returns a list of available database backups."""
    if not os.path.exists("backups"):
        return {"backups": []}
    
    files = []
    for f in os.listdir("backups"):
        if f.endswith(".db"):
            path = os.path.join("backups", f)
            size = os.path.getsize(path)
            created = os.path.getctime(path)
            files.append({
                "filename": f,
                "size_bytes": size,
                "created_at": datetime.fromtimestamp(created).isoformat()
            })
            
    # Sort newest first
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return {"backups": files}

@app.post("/api/database/backup")
async def trigger_backup():
    """Triggers a manual backup of the main database."""
    result = backup_db.backup_database()
    if result:
        return {"success": True, "path": result}
    raise HTTPException(status_code=500, detail="Failed to create backup")

@app.post("/api/database/restore")
async def trigger_restore(req: RestoreRequest):
    """Restores the main database from a backup file."""
    # Stop any running scans before restoring
    global SCAN_STATE
    SCAN_STATE = 'idle'
    
    result = restore_db.restore_database(req.filename)
    if result:
        # Re-initialize the globals/caches if necessary, or just return success
        return {"success": True, "message": f"Database restored from {req.filename}"}
    raise HTTPException(status_code=500, detail="Failed to restore database")

@app.get("/api/scan/logs")
async def get_scan_logs():
    return {"logs": list(scan_logs)}

@app.post("/api/scan/single")
async def scan_single_photo(
    file: UploadFile = File(...),
    model: Optional[str] = Form(None)
):
    """Uploads, saves, and immediately processes a single photo into the test database."""
    if not any(file.filename.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Invalid image extension.")
        
    model_to_use = model if model else ACTIVE_OLLAMA_MODEL

    # Using the current directory as a temporary test location. In a real app, this should go to a defined media folder.
    upload_dir = os.path.join(os.getcwd(), "test_duplicates_dir")
    os.makedirs(upload_dir, exist_ok=True)
    
    # We prefix the model name onto the filename so the unique filepath constraint doesn't block re-testing the exact same image with a new model
    isolated_filename = f"[{model_to_use}] {file.filename}"
    file_path = os.path.join(upload_dir, isolated_filename)
    
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    # USE TEST DATABASE
    conn = sqlite3.connect(DB_TEST_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute("INSERT INTO photos (filepath, filename, status) VALUES (?, ?, 'pending')", (file_path, isolated_filename))
        photo_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        # File already exists, let's fetch its ID
        cursor.execute("SELECT id, status FROM photos WHERE filepath = ?", (file_path,))
        row = cursor.fetchone()
        photo_id = row[0]
        # Reset status ONLY if it wasn't successfully processed before so we can re-process
        if row[1] != 'processed':
            cursor.execute("UPDATE photos SET status = 'pending' WHERE id = ?", (photo_id,))
    
    conn.commit()

    # Extract EXIF Metadata
    metadata_extracted = {}
    try:
        from PIL.ExifTags import TAGS
        with Image.open(file_path) as img:
            metadata_extracted["Dimensions"] = f"{img.width} x {img.height}"
            exif_data = img.getexif()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if isinstance(value, bytes):
                        try:
                            value = value.decode('utf-8')
                        except UnicodeDecodeError:
                            continue
                    if isinstance(value, (int, float, str)) and tag != "MakerNote" and len(str(value)) < 255:
                         metadata_extracted[tag] = str(value)
                         
                # Fetch deeper Photographic IFD tags
                if hasattr(exif_data, 'get_ifd'):
                    try:
                        ifd = exif_data.get_ifd(0x8769)
                        for tag_id, value in ifd.items():
                            tag = TAGS.get(tag_id, tag_id)
                            # Format common specific photographic tags
                            if tag == "ExposureTime":
                                try:
                                    v = float(value)
                                    metadata_extracted["Exposure Time"] = f"1/{int(1/v)} sec." if v > 0 and v < 1 else f"{v} sec."
                                except: pass
                            elif tag == "FNumber":
                                try: metadata_extracted["F-stop"] = f"f/{float(value):.1f}"
                                except: pass
                            elif tag == "ISOSpeedRatings":
                                metadata_extracted["ISO Speed"] = f"ISO-{value}"
                            elif tag == "FocalLength":
                                try: metadata_extracted["Focal Length"] = f"{float(value):.1f} mm"
                                except: pass
                            elif tag == "DateTimeOriginal":
                                metadata_extracted["Date taken"] = str(value)
                            elif isinstance(value, bytes):
                                pass
                            elif isinstance(value, (int, float, str)) and tag != "MakerNote" and len(str(value)) < 255:
                                metadata_extracted[tag] = str(value)
                    except Exception as e:
                        print(f"Failed to parse inner IFD EXIF data: {e}")
    except Exception as e:
        print(f"Failed to read EXIF: {e}")

    # GPS extraction for the scan result
    gps_data = extract_gps_from_exif(file_path)
    
    # Extract file dates
    try:
        date_created = datetime.fromtimestamp(os.path.getctime(file_path)).strftime("%Y:%m:%d %H:%M:%S")
    except:
        date_created = None
        
    try:
        date_modified = datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y:%m:%d %H:%M:%S")
    except:
        date_modified = None

    # Duplicate Check for Single Scan
    try:
        file_size = os.path.getsize(file_path)
        with open(file_path, "rb") as f:
            file_hash = hashlib.md5(f.read()).hexdigest()
            
        cursor.execute("SELECT id, description, date_created, date_modified FROM photos WHERE file_hash = ? AND status = 'processed' AND ai_model = ? LIMIT 1", (file_hash, model_to_use))
        existing_photo = cursor.fetchone()

        if existing_photo:
            # We already scanned this exact file with this exact model.
            # We bypass the Ollama request but MUST return the history and entities so the UI works.
            existing_id, ext_desc, ext_created, ext_modified = existing_photo
            
            if photo_id != existing_id:
                # Update the temp entry to duplicate status so it doesn't clutter
                cursor.execute("UPDATE photos SET status = 'duplicate', file_size = ?, file_hash = ? WHERE id = ?", (file_size, file_hash, photo_id))
            else:
                # It's the exact same upload path, so just ensure size/hash is fresh but keep it processed
                cursor.execute("UPDATE photos SET file_size = ?, file_hash = ? WHERE id = ?", (file_size, file_hash, photo_id))
            
            # Fetch the previous run's entities 
            cursor.execute("SELECT entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (existing_id,))
            hs_entities = cursor.fetchall()
            cached_entities = [{"type": t, "name": n, "bounding_box": b} for t, n, b in hs_entities]

            # Fetch history of OTHER models for this EXACT file_hash
            history = []
            cursor.execute("SELECT id, description, ai_model FROM photos WHERE file_hash = ? AND status = 'processed' AND id != ?", (file_hash, existing_id))
            historical_scans = cursor.fetchall()
            for hs_id, hs_desc, hs_model in historical_scans:
                cursor.execute("SELECT entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (hs_id,))
                h_ent = cursor.fetchall()
                history.append({
                    "photo_id": hs_id, "ai_model": hs_model or "Unknown Model",
                    "description": hs_desc, "entities": [{"type": t, "name": n, "bounding_box": b} for t, n, b in h_ent]
                })

            conn.commit()
            return {
                "success": True, "message": "Result pulled from cache.", "photo_id": existing_id,
                "filename": file.filename, "ai_model": f"{model_to_use} [Cache]", "description": ext_desc,
                "entities": cached_entities, "metadata": metadata_extracted, 
                "gps_lat": gps_data.get('gps_lat'), "gps_lon": gps_data.get('gps_lon'),
                "history": history
            }
            
        # Otherwise, link the hash to our impending scan
        cursor.execute("UPDATE photos SET file_size = ?, file_hash = ? WHERE id = ?", (file_size, file_hash, photo_id))
    except Exception as e:
        print(f"Error checking duplicate for {file_path}: {e}")

    # Immediate Processing instead of background
    ai_response = process_image_with_ollama(file_path, override_model=model_to_use)
    description = ai_response if ai_response else "Failed to generate description."
    
    cursor.execute('''
        UPDATE photos SET description = ?, status = 'processed', date_created = ?, date_modified = ?, ai_model = ? WHERE id = ?
    ''', (description, date_created, date_modified, model_to_use, photo_id))
    
    entities_found = []

    # Parse pet extraction from the strict 'Entities: [list]' format
    try:
        if "Entities:" in description:
            entities_part = description.split("Entities:")[1].strip()
            # Common negative patterns from LLMs
            negative_patterns = ["none", "none.", "n/a", "no pets", "no pets.", "no dogs or cats", "no dogs", "no cats", "", "are visible", "are not visible"]
            
            # Check if the entire string after Entities: is just a negative statement
            is_negative = False
            for pat in negative_patterns:
                 if pat in entities_part.lower():
                      # Be careful, "There are no dogs" contains "no dogs"
                      # But "A dog and a cat" does not.
                      pass
                      
            # A safer way is to check if it clearly says "no pets" or similar
            if not any(entities_part.lower().startswith(p) for p in ["no ", "none", "n/a"]):
                if "no pets" not in entities_part.lower() and "no dogs or cats" not in entities_part.lower() and "no pets," not in entities_part.lower():
                    # Split by comma and remove empty strings
                    pets = [p.strip() for p in entities_part.split(",") if p.strip()]
                    for pet in pets:
                        # Basic filtering to avoid injecting full sentences
                        if len(pet) < 30 and "no " not in pet.lower() and "not " not in pet.lower():
                             pet_name_formatted = pet.replace(".", "").capitalize()
                             cursor.execute("INSERT INTO entities (photo_id, entity_type, entity_name) VALUES (?, ?, ?)", (photo_id, 'pet', f"Unknown {pet_name_formatted}"))
                             entities_found.append({"type": "pet", "name": f"Unknown {pet_name_formatted}"})
    except Exception as e:
        print(f"Error parsing pets: {e}")

    # DeepFace extraction
    if DEEPFACE_AVAILABLE:
        try:
            # OpenCV imread fails silently on Windows paths with Unicode characters.
            # We bypass this by reading the file into a NumPy array first, then decoding.
            file_bytes = np.fromfile(file_path, dtype=np.uint8)
            img_array = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
            
            if img_array is None:
                raise ValueError("cv2.imdecode failed to decode the image file.")

            # Using 'retinaface' as it performs much better on angled/rotated faces than default opencv
            representations = DeepFace.represent(img_path=img_array, model_name="VGG-Face", detector_backend="retinaface", enforce_detection=True)
            for rep in representations:
                embedding = rep.get("embedding")
                facial_area = rep.get("facial_area", {})
                face_confidence = rep.get("face_confidence", 1.0)
                
                has_eyes = facial_area.get('left_eye') is not None and facial_area.get('right_eye') is not None
                
                if embedding and face_confidence > 0.85 and has_eyes:
                    matched_name = find_best_face_match(embedding, conn)
                    if not matched_name:
                        cursor.execute("SELECT COUNT(*) FROM entities WHERE entity_type = 'person' AND entity_name LIKE 'Unknown Person%'")
                        unknown_count = cursor.fetchone()[0]
                        matched_name = f"Unknown Person {unknown_count + 1}"
                        
                    cursor.execute("""
                        INSERT INTO entities (photo_id, entity_type, entity_name, bounding_box, embedding)
                        VALUES (?, ?, ?, ?, ?)
                    """, (photo_id, 'person', matched_name, json.dumps(facial_area) if facial_area else None, json.dumps(embedding)))
                    entities_found.append({"type": "person", "name": matched_name, "bounding_box": json.dumps(facial_area) if facial_area else None})
        except ValueError:
            pass # No face found
        except Exception as e:
            print(f"DeepFace processing error: {e}")

    # Commit our results so they are visible in the history query
    conn.commit()
    
    # --- Fetch historical scans of THIS EXACT file_hash for cross-model comparison ---
    history = []
    try:
         # Need to find all other test scans that match our hash, excluding our current photo_id
         cursor.execute("SELECT id, description, ai_model FROM photos WHERE file_hash = ? AND status = 'processed' AND id != ?", (file_hash, photo_id))
         historical_scans = cursor.fetchall()
         
         for hs_id, hs_desc, hs_model in historical_scans:
              # Fetch the entities for this historical scan
              cursor.execute("SELECT entity_type, entity_name, bounding_box FROM entities WHERE photo_id = ?", (hs_id,))
              hs_entities = cursor.fetchall()
              hs_ents_formatted = [{"type": t, "name": n, "bounding_box": b} for t, n, b in hs_entities]
              
              history.append({
                  "photo_id": hs_id,
                  "ai_model": hs_model or "Unknown Model",
                  "description": hs_desc,
                  "entities": hs_ents_formatted
              })
              
    except Exception as e:
         print(f"Failed to fetch historical model comparisons: {e}")
         
    conn.close()

    return {
        "success": True,
        "photo_id": photo_id,
        "filename": file.filename,
        "ai_model": model_to_use,
        "description": description,
        "entities": entities_found,
        "metadata": metadata_extracted,
        "gps_lat": gps_data.get('gps_lat'),
        "gps_lon": gps_data.get('gps_lon'),
        "history": history
    }

@app.get("/api/image/{photo_id}")
async def get_image(photo_id: int):
    """Returns the actual image file for a given photo ID."""
    # First check main DB
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT filepath FROM photos WHERE id = ?", (photo_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not os.path.exists(row[0]):
        # Fallback to check test DB
        conn_test = sqlite3.connect(DB_TEST_FILE)
        cursor_test = conn_test.cursor()
        cursor_test.execute("SELECT filepath FROM photos WHERE id = ?", (photo_id,))
        row_test = cursor_test.fetchone()
        conn_test.close()
        
        if not row_test or not os.path.exists(row_test[0]):
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(row_test[0])
        
    return FileResponse(row[0])

@app.get("/api/search")
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
    limit: int = 500
):
    """Searches photos with full filter and sort support."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    
    conditions = ["p.status = 'processed'"]
    params = []
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
        joins.append("JOIN entities et ON p.id = et.photo_id" if "en" not in ''.join(joins) else "")
        if entity_type == 'person':
            conditions.append("EXISTS (SELECT 1 FROM entities e2 WHERE e2.photo_id = p.id AND e2.entity_type = 'person')")
        elif entity_type == 'pet':
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
        conditions.append("EXISTS (SELECT 1 FROM entities e4 WHERE e4.photo_id = p.id AND e4.entity_name LIKE 'Unknown%')")
    
    join_sql = ' '.join(dict.fromkeys(joins))  # Deduplicate joins
    where_sql = ' AND '.join(conditions) if conditions else '1=1'
    
    # Sort
    sort_column_map = {
        'date_taken': 'p.date_taken',
        'date_created': 'p.date_created',
        'date_modified': 'p.date_modified',
        'name': 'p.filename',
        'filename': 'p.filename'
    }
    order_col = sort_column_map.get(sort_by, 'p.date_taken')
    order_dir = 'ASC' if sort_dir.lower() == 'asc' else 'DESC'
    nulls = 'NULLS LAST' if order_dir == 'DESC' else 'NULLS FIRST'
    
    sql = f"SELECT DISTINCT p.id, p.filepath, p.filename, p.description, p.date_taken, p.date_created, p.date_modified FROM photos p {join_sql} WHERE {where_sql} ORDER BY {order_col} {order_dir} {nulls} LIMIT ?"
    params.append(limit)
    
    cursor.execute(sql, params)
    results = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": row[0],
            "filepath": row[1], 
            "filename": row[2], 
            "description": row[3],
            "date_taken": row[4],
            "date_created": row[5],
            "date_modified": row[6]
        } 
        for row in results
    ]

@app.get("/api/duplicates")
async def get_duplicates():
    """Returns grouped duplicate files."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
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
        # Get the 'original' processed photo for this hash
        cursor.execute('''
            SELECT id, filepath, filename, file_size 
            FROM photos 
            WHERE file_hash = ? AND status = 'processed' 
            LIMIT 1
        ''', (file_hash,))
        original = cursor.fetchone()
        
        # Get all duplicate copies for this hash
        cursor.execute('''
            SELECT id, filepath, filename, file_size 
            FROM photos 
            WHERE file_hash = ? AND status = 'duplicate'
        ''', (file_hash,))
        duplicates = cursor.fetchall()
        
        if original and duplicates:
            response_data.append({
                "hash": file_hash,
                "count": duplicate_count,
                "original": {
                    "id": original[0],
                    "filepath": original[1],
                    "filename": original[2],
                    "file_size": original[3]
                },
                "copies": [
                    {
                        "id": dup[0],
                        "filepath": dup[1],
                        "filename": dup[2],
                        "file_size": dup[3]
                    } for dup in duplicates
                ]
            })
            
    conn.close()
    return response_data

@app.get("/api/gallery/filters")
async def get_gallery_filters():
    """Returns available filter options for the gallery."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get all unique named entities (non-Unknown)
    cursor.execute("SELECT DISTINCT entity_name, entity_type FROM entities WHERE entity_name NOT LIKE 'Unknown%' ORDER BY entity_name")
    named_entities = [{"name": r[0], "type": r[1]} for r in cursor.fetchall()]
    
    # Get all unique cameras
    cursor.execute("SELECT DISTINCT camera_make || ' ' || camera_model FROM photos WHERE camera_make IS NOT NULL AND camera_make != '' AND status = 'processed' ORDER BY 1")
    cameras = [r[0] for r in cursor.fetchall() if r[0] and r[0].strip()]
    
    # Get date range
    cursor.execute("SELECT MIN(date_taken), MAX(date_taken) FROM photos WHERE date_taken IS NOT NULL AND date_taken != '' AND status = 'processed'")
    date_range = cursor.fetchone()
    
    # Counts for quick stats
    cursor.execute("SELECT COUNT(DISTINCT e.photo_id) FROM entities e JOIN photos p ON e.photo_id = p.id WHERE e.entity_type = 'person' AND p.status = 'processed'")
    photos_with_faces = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT e.photo_id) FROM entities e JOIN photos p ON e.photo_id = p.id WHERE e.entity_name LIKE 'Unknown%' AND p.status = 'processed'")
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
        "photos_unidentified": photos_unidentified
    }

@app.get("/api/gallery/years")
async def get_gallery_years():
    """Returns years that have photos, with counts, for the timeline sidebar."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT SUBSTR(date_taken, 1, 4) as year, COUNT(*) as count
        FROM photos
        WHERE date_taken IS NOT NULL AND date_taken != '' AND status = 'processed'
        GROUP BY year
        ORDER BY year DESC
    """)
    years = [{"year": r[0], "count": r[1]} for r in cursor.fetchall() if r[0] and r[0].strip()]
    conn.close()
    return years

@app.get("/api/unidentified")
async def get_unidentified_entities():
    """Gets a list of people/pets that currently have an 'Unknown' name."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Group by name to just return one instance of each unknown person/pet
    cursor.execute("""
        SELECT e.id, e.entity_type, e.entity_name, p.id, e.bounding_box
        FROM entities e
        JOIN photos p ON e.photo_id = p.id
        WHERE e.entity_name LIKE 'Unknown%' AND p.status = 'processed'
        GROUP BY e.entity_name, e.entity_type
    """)
    results = cursor.fetchall()
    conn.close()
    
    return [{"id": row[0], "type": row[1], "name": row[2], "photo_id": row[3], "bounding_box": row[4]} for row in results]

@app.get("/api/photo/{photo_id}/entities")
async def get_photo_entities(photo_id: int):
    """Gets ALL entities (both identified and unidentified) for a specific photo."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.id, e.entity_type, e.entity_name, e.bounding_box
        FROM entities e
        WHERE e.photo_id = ?
    """, (photo_id,))
    results = cursor.fetchall()
    conn.close()
    
    return [{"id": row[0], "type": row[1], "name": row[2], "bounding_box": row[3]} for row in results]



def parse_name(full_name: str):
    """Splits a full name into first and last name."""
    parts = full_name.strip().split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]

@app.post("/api/entities/name")
async def name_main_entity(req: UpdateEntityRequest):
    """Updates the name of a person in the MAIN database globally."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    old_name = str(req.entity_id)
    new_name = req.new_name.strip()
    
    # Check if we are merging with an existing named person
    cursor.execute("SELECT first_name, last_name FROM entities WHERE entity_type = 'person' AND entity_name = ? COLLATE NOCASE LIMIT 1", (new_name,))
    existing_person = cursor.fetchone()
    
    if existing_person:
        first, last = existing_person
    else:
        first, last = parse_name(new_name)

    cursor.execute("UPDATE entities SET entity_name = ?, first_name = ?, last_name = ? WHERE entity_name = ?", (new_name, first, last, old_name))
    conn.commit()
    conn.close()
    return {"success": True, "updated": old_name, "to": new_name}

@app.delete("/api/entities/{entity_name}")
async def delete_main_entity(entity_name: str):
    """Deletes all entities in the MAIN db matching the specific name."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM entities WHERE entity_name = ?", (entity_name,))
    conn.commit()
    conn.close()
    return {"success": True, "deleted": entity_name}

@app.post("/api/test/entities/name")
async def name_test_entity(req: UpdateEntityRequest):
    """Updates the name of a person in the TEST database, saving first and last name separately.
       Acts as a merge by assigning the identity of an existing person if the name matches.
    """
    conn = sqlite3.connect(DB_TEST_FILE)
    cursor = conn.cursor()
    
    old_name = str(req.entity_id) # ScanTest passes the current name as the ID
    new_name = req.new_name.strip()
    
    # Check if this person already exists in the test DB to merge identities
    cursor.execute("SELECT first_name, last_name FROM entities WHERE entity_type = 'person' AND entity_name = ? COLLATE NOCASE LIMIT 1", (new_name,))
    existing_person = cursor.fetchone()
    
    if existing_person:
        # Merge: Adopt their exact name formatting
        first, last = existing_person
    else:
        # Check main DB for the identity
        try:
            main_conn = sqlite3.connect(DB_FILE)
            main_cursor = main_conn.cursor()
            main_cursor.execute("SELECT first_name, last_name FROM entities WHERE entity_type = 'person' AND entity_name = ? COLLATE NOCASE LIMIT 1", (new_name,))
            main_existing = main_cursor.fetchone()
            main_conn.close()
            
            if main_existing:
                first, last = main_existing
            else:
                first, last = parse_name(new_name)
        except Exception:
            first, last = parse_name(new_name)

    # Note: We do NOT overwrite the 'embedding' or 'bounding_box'. 
    # Multiple rows for the SAME person are exactly what we want. It builds a diverse face-profile 
    # for them (different angles, lighting) which makes future clustering much more accurate!
    
    cursor.execute("UPDATE entities SET entity_name = ?, first_name = ?, last_name = ? WHERE entity_name = ?", (new_name, first, last, old_name))
    conn.commit()
    conn.close()
    return {"success": True, "updated": old_name, "to": new_name}

@app.delete("/api/test/entities/{entity_name}")
async def delete_test_entity(entity_name: str):
    """Deletes all entities in the test db matching the specific name/label."""
    conn = sqlite3.connect(DB_TEST_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM entities WHERE entity_name = ?", (entity_name,))
    conn.commit()
    conn.close()
    return {"success": True, "deleted": entity_name}

@app.post("/api/test/clear")
async def clear_test_db():
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
                try:
                    os.remove(os.path.join(upload_dir, f))
                except Exception:
                    pass
    
    return {"success": True, "message": "Test sandbox cleared"}

@app.get("/api/select-folder")
async def select_folder():
    """Opens a native file dialog to select a directory."""
    if not TKINTER_AVAILABLE:
        raise HTTPException(status_code=500, detail="Tkinter is not available. Please type the path manually.")
        
    def _open_dialog():
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = filedialog.askdirectory(parent=root, title="Select Photo Directory")
        root.destroy()
        return folder
        
    # Run in a separate thread so it doesn't block the async event loop
    folder_path = await asyncio.to_thread(_open_dialog)
    return {"path": folder_path}

@app.get("/api/models")
async def get_ollama_models():
    """Fetches available models from local Ollama and flags vision models."""
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            # Workaround for Ollama issue #10002 not broadcasting vision capabilities correctly for all architectures
            vision_keywords = ["llava", "vision", "bakllava", "minicpm-v", "moondream", "xcomposer", "qwen2-vl", "qwen3-vl", "pixtral"]
            result = []
            for m in models:
                name = m.get("name")
                is_vision = any(kw in name.lower() for kw in vision_keywords)
                result.append({"name": name, "is_vision": is_vision})
            return {"models": result, "active": ACTIVE_OLLAMA_MODEL}
    except Exception as e:
        print(f"Error fetching Ollama models: {e}")
    # Fallback if connection fails
    return {"models": [{"name": ACTIVE_OLLAMA_MODEL, "is_vision": True}], "active": ACTIVE_OLLAMA_MODEL}

@app.post("/api/settings/model")
async def update_settings_model(req: SettingsUpdateRequest):
    """Updates the active Ollama model for processing."""
    global ACTIVE_OLLAMA_MODEL
    ACTIVE_OLLAMA_MODEL = req.model_name
    return {"success": True, "active": ACTIVE_OLLAMA_MODEL}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)