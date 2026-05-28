"""
Background processing worker for recursive local folder media scanning (Non-AI).
"""

import hashlib
import os
import re
import sqlite3
import subprocess
import time
from collections.abc import Generator
from datetime import datetime
from typing import Any

import core.state as state
from core.ffmpeg_check import get_ffmpeg_path
from services.scan_sessions import (
    create_scan_session,
    set_session_status,
    update_folder_session_counts,
)


def format_rational(val) -> float | None:
    if val is None:
        return None
    try:
        if hasattr(val, "numerator") and hasattr(val, "denominator"):
            if val.denominator == 0:
                return float(val.numerator)
            return float(val.numerator) / float(val.denominator)
        return float(val)
    except (ValueError, TypeError, ZeroDivisionError):
        return None


def format_exposure_time(val) -> str | None:
    if val is None:
        return None
    try:
        if hasattr(val, "numerator") and hasattr(val, "denominator"):
            if val.denominator == 0:
                return str(val.numerator)
            if val.numerator == 1 or (val.denominator % val.numerator == 0 and val.numerator > 0):
                den = val.denominator // val.numerator
                return f"1/{den}" if den > 0 else f"{val.numerator}/{val.denominator}"
            f_val = float(val.numerator) / float(val.denominator)
            if f_val >= 1.0:
                return f"{f_val:.1f}".rstrip('0').rstrip('.')
            return f"{val.numerator}/{val.denominator}"
        f_val = float(val)
        if f_val >= 1.0:
            return f"{f_val:.1f}".rstrip('0').rstrip('.')
        from fractions import Fraction
        frac = Fraction(f_val).limit_denominator(8000)
        if frac.numerator == 1:
            return f"1/{frac.denominator}"
        return f"{frac.numerator}/{frac.denominator}"
    except Exception:
        return str(val)


def extract_rich_image_metadata(filepath: str) -> dict[str, Any]:
    """Extracts width, height, camera make/model, lens model, exposure details, ISO, and GPS."""
    info = {
        "width": None,
        "height": None,
        "camera_make": None,
        "camera_model": None,
        "lens_model": None,
        "exposure_time": None,
        "f_number": None,
        "iso": None,
        "focal_length": None,
        "gps_lat": None,
        "gps_lon": None,
    }
    try:
        from PIL import Image

        from services.image_service import _convert_gps_to_decimal
        with Image.open(filepath) as img:
            info["width"] = img.width
            info["height"] = img.height
            exif_data = img.getexif()
            if exif_data:
                info["camera_make"] = str(exif_data.get(271, "")).strip() or None
                info["camera_model"] = str(exif_data.get(272, "")).strip() or None
                if hasattr(exif_data, "get_ifd"):
                    try:
                        exif_ifd = exif_data.get_ifd(0x8769)
                        if exif_ifd:
                            lens = exif_ifd.get(42036)
                            if lens:
                                info["lens_model"] = str(lens).strip() or None
                            exp = exif_ifd.get(33434)
                            if exp is not None:
                                info["exposure_time"] = format_exposure_time(exp)
                            fnum = exif_ifd.get(33437)
                            if fnum is not None:
                                info["f_number"] = format_rational(fnum)
                            iso_val = exif_ifd.get(34855)
                            if iso_val is not None:
                                info["iso"] = int(iso_val)
                            focal = exif_ifd.get(37386)
                            if focal is not None:
                                info["focal_length"] = format_rational(focal)
                    except Exception:
                        pass
                    try:
                        gps_ifd = exif_data.get_ifd(0x8825)
                        if gps_ifd:
                            gps_lat = gps_ifd.get(2)
                            gps_lat_ref = gps_ifd.get(1)
                            gps_lon = gps_ifd.get(4)
                            gps_lon_ref = gps_ifd.get(3)
                            if gps_lat and gps_lat_ref and gps_lon and gps_lon_ref:
                                info["gps_lat"] = _convert_gps_to_decimal(gps_lat, gps_lat_ref)
                                info["gps_lon"] = _convert_gps_to_decimal(gps_lon, gps_lon_ref)
                    except Exception:
                        pass
    except Exception:
        pass
    return info


def extract_rich_video_metadata(filepath: str, file_size: int) -> dict[str, Any]:
    """Extracts width, height, duration, codec, frame_rate, and bit_rate using OpenCV."""
    info = {
        "width": None,
        "height": None,
        "duration": None,
        "codec": None,
        "frame_rate": None,
        "bit_rate": None,
    }
    try:
        import cv2
        cap = cv2.VideoCapture(filepath)
        if cap.isOpened():
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            if w > 0:
                info["width"] = w
            if h > 0:
                info["height"] = h
            if fps > 0:
                info["frame_rate"] = round(fps, 3)
                if frame_count > 0:
                    dur = frame_count / fps
                    info["duration"] = round(dur, 2)
                    if dur > 0:
                        info["bit_rate"] = int((file_size * 8) / dur)
            fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
            if fourcc > 0:
                codec_chars = []
                for i in range(4):
                    c = (fourcc >> (8 * i)) & 0xFF
                    if 32 <= c <= 126:
                        codec_chars.append(chr(c))
                codec_str = "".join(codec_chars).strip()
                if codec_str:
                    info["codec"] = codec_str
            cap.release()
    except Exception:
        pass
    return info


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".heif", ".tiff", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v", ".3gp", ".mpeg", ".mpg"}
VALIDATION_VALID = "valid"
VALIDATION_INVALID_STUB = "invalid_media_stub"
VALIDATION_UNVALIDATED = "unvalidated"
MIN_PLAUSIBLE_VIDEO_BYTES = 1024
VIDEO_PROBE_TIMEOUT_SECONDS = 10


def calculate_md5(filepath: str) -> str:
    """Calculates the MD5 hash of a file efficiently by reading in chunks."""
    hasher = hashlib.md5()
    # Read-only mode prevents modifying file metadata
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_video_stream(filepath: str) -> tuple[str, str | None]:
    """Check whether a purported video contains a decodable video stream."""
    try:
        if os.path.getsize(filepath) < MIN_PLAUSIBLE_VIDEO_BYTES:
            return VALIDATION_INVALID_STUB, "File is too small to contain a decodable video stream."
    except OSError as exc:
        return VALIDATION_UNVALIDATED, f"Unable to inspect video file: {exc}"

    try:
        ffmpeg_path = get_ffmpeg_path()
    except RuntimeError as exc:
        return VALIDATION_UNVALIDATED, f"Video validation unavailable: {exc}"

    command = [
        ffmpeg_path,
        "-v",
        "error",
        "-nostdin",
        "-i",
        filepath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=VIDEO_PROBE_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return VALIDATION_UNVALIDATED, f"Video validation timed out after {VIDEO_PROBE_TIMEOUT_SECONDS} seconds."
    except Exception as exc:
        return VALIDATION_UNVALIDATED, f"Video validation failed: {exc}"

    if result.returncode != 0:
        error = (result.stderr or "").strip()
        if not error:
            error = "No readable video stream found."
        return VALIDATION_INVALID_STUB, error[:500]

    return VALIDATION_VALID, None


def extract_media_date(filepath: str, media_type: str) -> tuple[str, str, str, str, int, int, int]:
    """Extracts dates using the fallback hierarchy:
    1. EXIF Date Taken (images only)
    2. Date Modified
    3. Date Created
    4. Filename pattern (e.g. YYYY-MM-DD or YYYYMMDD)
    5. Parent folder pattern (e.g. YYYY-MM-DD or Year folder)
    6. Default Epoch (1970-01-01)

    Returns a tuple of:
    (date_taken, date_modified, date_created, fallback_source, year, month, day)
    """
    date_taken_exif = None
    date_modified = None
    date_created = None

    # Get file stats
    try:
        mtime = os.path.getmtime(filepath)
        date_modified = datetime.fromtimestamp(mtime).strftime("%Y:%m:%d %H:%M:%S")
    except Exception:
        pass

    try:
        ctime = os.path.getctime(filepath)
        date_created = datetime.fromtimestamp(ctime).strftime("%Y:%m:%d %H:%M:%S")
    except Exception:
        pass

    # Extract EXIF date for images
    if media_type == "image":
        try:
            from PIL import Image
            # Open image in read-only mode to prevent file touches
            with Image.open(filepath) as img:
                exif_data = img.getexif()
                if exif_data:
                    if hasattr(exif_data, "get_ifd"):
                        try:
                            ifd = exif_data.get_ifd(0x8769)  # EXIF IFD
                            dt = ifd.get(36867)  # DateTimeOriginal
                            if dt:
                                date_taken_exif = str(dt)
                        except Exception:
                            pass
                    if not date_taken_exif:
                        dt = exif_data.get(306)  # DateTime tag
                        if dt:
                            date_taken_exif = str(dt)
        except Exception:
            pass

    def clean_date_str(dt_str: str) -> datetime | None:
        if not dt_str:
            return None
        dt_str = dt_str.strip()
        # Common EXIF date formats
        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y:%m:%d %H:%M", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(dt_str[:19], fmt)
            except ValueError:
                continue
        return None

    resolved_dt = None
    source = None

    # 1. EXIF Date Taken
    if date_taken_exif:
        parsed = clean_date_str(date_taken_exif)
        if parsed:
            resolved_dt = parsed
            source = "date_taken"

    # 2. Date Modified
    if not resolved_dt and date_modified:
        parsed = clean_date_str(date_modified)
        if parsed:
            resolved_dt = parsed
            source = "date_modified"

    # 3. Date Created
    if not resolved_dt and date_created:
        parsed = clean_date_str(date_created)
        if parsed:
            resolved_dt = parsed
            source = "date_created"

    # 4. Filename pattern
    if not resolved_dt:
        filename = os.path.basename(filepath)
        # Look for YYYY-MM-DD or YYYY_MM_DD
        m = re.search(r'(\d{4})[-_](\d{2})[-_](\d{2})', filename)
        if m:
            try:
                resolved_dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                source = "filename_pattern"
            except ValueError:
                pass
        if not resolved_dt:
            # Look for YYYYMMDD
            m = re.search(r'\b(\d{4})(\d{2})(\d{2})\b', filename)
            if m:
                try:
                    resolved_dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                    source = "filename_pattern"
                except ValueError:
                    pass

    # 5. Parent folder pattern
    if not resolved_dt:
        parent_dir = os.path.basename(os.path.dirname(filepath))
        m = re.search(r'(\d{4})[-_](\d{2})[-_](\d{2})', parent_dir)
        if m:
            try:
                resolved_dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                source = "folder_pattern"
            except ValueError:
                pass
        if not resolved_dt:
            # Year only folder (e.g. 2023)
            m = re.search(r'\b(19\d{2}|20\d{2})\b', parent_dir)
            if m:
                try:
                    resolved_dt = datetime(int(m.group(1)), 1, 1)
                    source = "folder_pattern"
                except ValueError:
                    pass

    # 6. Default Epoch
    if not resolved_dt:
        resolved_dt = datetime(1970, 1, 1)
        source = "default_epoch"

    year = resolved_dt.year
    month = resolved_dt.month
    day = resolved_dt.day
    final_date_str = resolved_dt.strftime("%Y-%m-%d %H:%M:%S")

    # Keep exif date representation if it was matched, else normalized final date
    return (
        date_taken_exif or final_date_str,
        date_modified or "",
        date_created or "",
        source,
        year,
        month,
        day
    )


def folder_scan_generator(directory_path: str) -> Generator[str, None, None]:
    """Yields filepaths of media in the directory recursively."""
    for root, _, files in os.walk(directory_path):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in IMAGE_EXTENSIONS or ext in VIDEO_EXTENSIONS:
                yield os.path.join(root, file)


def background_folder_processor(
    directory_path: str,
    db_file: str,
    force_rescan: bool = False,
    extract_metadata: bool = False,
    session_id: int | None = None,
) -> None:
    """Recursively scans a directory for images/videos in the background."""
    state.add_folder_log(f"Initiating recursive media scan for: {directory_path} (Extract Rich Metadata: {extract_metadata})")

    if not os.path.exists(directory_path):
        state.add_folder_log(f"Aborting scan. Path does not exist: {directory_path}")
        state.FOLDER_SCAN_STATE = "idle"
        return

    conn = sqlite3.connect(db_file, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()

    if session_id is not None:
        row = cursor.execute(
            """
            SELECT root_path, force_rescan, extract_metadata
            FROM scan_sessions
            WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
        if not row:
            state.add_folder_log(f"Aborting scan. Session does not exist: {session_id}")
            state.FOLDER_SCAN_STATE = "idle"
            conn.close()
            return
        directory_path = row[0]
        force_rescan = bool(row[1])
        extract_metadata = bool(row[2])
        set_session_status(conn, session_id, "running")

    if session_id is None and force_rescan:
        state.add_folder_log(f"Force rescan enabled. Clearing existing folder metadata for: {directory_path}")
        cursor.execute("DELETE FROM local_media WHERE filepath LIKE ?", (f"{directory_path}%",))
        conn.commit()

    if session_id is None:
        session_id = create_scan_session(
            conn,
            "folder",
            directory_path,
            force_rescan=force_rescan,
            extract_metadata=extract_metadata,
        )

        # Pre-count matching files to set progress limit and persist the resume queue.
        state.add_folder_log("Counting media files...")
        for filepath in folder_scan_generator(directory_path):
            if not force_rescan:
                cursor.execute("SELECT id FROM local_media WHERE filepath = ?", (filepath,))
                if cursor.fetchone():
                    continue
            cursor.execute(
                """
                INSERT OR IGNORE INTO folder_scan_queue (session_id, filepath, status)
                VALUES (?, ?, 'pending')
                """,
                (session_id, filepath),
            )
        conn.commit()

    total_count, processed_count = update_folder_session_counts(conn, session_id)
    state.folder_scan_total = total_count
    state.folder_scan_processed = processed_count

    state.add_folder_log(f"Found {total_count} new/unprocessed media files.")

    if total_count == 0:
        state.add_folder_log("No new media files found to scan.")
        try:
            cursor.execute(
                """
                INSERT INTO folder_scan_history (directory_path)
                VALUES (?)
                ON CONFLICT(directory_path)
                DO UPDATE SET last_scanned = CURRENT_TIMESTAMP
            """,
                (directory_path,),
            )
            conn.commit()
        except Exception as e:
            state.add_folder_log(f"Failed to record history: {e}")

        state.FOLDER_SCAN_STATE = "idle"
        set_session_status(conn, session_id, "completed")
        conn.close()
        return

    state.FOLDER_SCAN_STATE = "running"
    scan_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    while True:
        while state.FOLDER_SCAN_STATE == "paused":
            set_session_status(conn, session_id, "paused")
            time.sleep(0.5)

        if state.FOLDER_SCAN_STATE == "idle":
            current_status = cursor.execute("SELECT status FROM scan_sessions WHERE id = ?", (session_id,)).fetchone()
            if current_status and current_status[0] == "cancelled":
                state.add_folder_log("Scan cancelled by user.")
            else:
                set_session_status(conn, session_id, "paused")
                state.add_folder_log("Scan paused before all queued files were processed.")
            break

        queue_row = cursor.execute(
            """
            SELECT id, filepath
            FROM folder_scan_queue
            WHERE session_id = ?
              AND status = 'pending'
            ORDER BY id ASC
            LIMIT 1
            """,
            (session_id,),
        ).fetchone()

        if not queue_row:
            set_session_status(conn, session_id, "completed")
            break

        queue_id, filepath = queue_row
        cursor.execute(
            """
            UPDATE folder_scan_queue
            SET status = 'processing', error = NULL
            WHERE id = ?
            """,
            (queue_id,),
        )
        conn.commit()

        filename = os.path.basename(filepath)
        ext = os.path.splitext(filename)[1].lower()
        media_type = "image" if ext in IMAGE_EXTENSIONS else "video"
        state.add_folder_log(f"[{state.folder_scan_processed + 1}/{total_count}] Processing: {filename}")

        try:
            file_size = os.path.getsize(filepath)
            file_hash = calculate_md5(filepath)
            date_taken, date_modified, date_created, date_fallback, year, month, day = extract_media_date(filepath, media_type)
            validation_status = VALIDATION_VALID
            validation_error = None
            if media_type == "video":
                validation_status, validation_error = validate_video_stream(filepath)

            width = None
            height = None
            duration = None
            codec = None
            frame_rate = None
            bit_rate = None
            camera_make = None
            camera_model = None
            lens_model = None
            exposure_time = None
            f_number = None
            iso = None
            focal_length = None
            gps_lat = None
            gps_lon = None

            if extract_metadata:
                if media_type == "image":
                    m_info = extract_rich_image_metadata(filepath)
                    width = m_info["width"]
                    height = m_info["height"]
                    camera_make = m_info["camera_make"]
                    camera_model = m_info["camera_model"]
                    lens_model = m_info["lens_model"]
                    exposure_time = m_info["exposure_time"]
                    f_number = m_info["f_number"]
                    iso = m_info["iso"]
                    focal_length = m_info["focal_length"]
                    gps_lat = m_info["gps_lat"]
                    gps_lon = m_info["gps_lon"]
                elif media_type == "video":
                    m_info = extract_rich_video_metadata(filepath, file_size)
                    width = m_info["width"]
                    height = m_info["height"]
                    duration = m_info["duration"]
                    codec = m_info["codec"]
                    frame_rate = m_info["frame_rate"]
                    bit_rate = m_info["bit_rate"]

            cursor.execute(
                """
                INSERT OR REPLACE INTO local_media (
                    filepath, filename, parent_path, file_size, file_hash, media_type,
                    validation_status, validation_error,
                    date_taken, date_modified, date_created, date_fallback, year, month, day,
                    width, height, duration, codec, frame_rate, bit_rate, camera_make, camera_model,
                    lens_model, exposure_time, f_number, iso, focal_length, gps_lat, gps_lon, scanned_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    filepath,
                    filename,
                    os.path.dirname(filepath),
                    file_size,
                    file_hash,
                    media_type,
                    validation_status,
                    validation_error,
                    date_taken,
                    date_modified,
                    date_created,
                    date_fallback,
                    year,
                    month,
                    day,
                    width,
                    height,
                    duration,
                    codec,
                    frame_rate,
                    bit_rate,
                    camera_make,
                    camera_model,
                    lens_model,
                    exposure_time,
                    f_number,
                    iso,
                    focal_length,
                    gps_lat,
                    gps_lon,
                    scan_time,
                ),
            )

            cursor.execute(
                """
                UPDATE folder_scan_queue
                SET status = 'processed', processed_at = CURRENT_TIMESTAMP, error = NULL
                WHERE id = ?
                """,
                (queue_id,),
            )
            total_count, processed_count = update_folder_session_counts(conn, session_id)
            state.folder_scan_total = total_count
            state.folder_scan_processed = processed_count

            state.add_folder_log(f"[{processed_count}/{total_count}] Scanned: {filename} (Source: {date_fallback})")
            if validation_status == VALIDATION_INVALID_STUB:
                state.add_folder_log(f"Classified invalid media stub: {filename} ({validation_error})")

        except Exception as e:
            cursor.execute(
                """
                UPDATE folder_scan_queue
                SET status = 'error', error = ?, processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (str(e), queue_id),
            )
            total_count, processed_count = update_folder_session_counts(conn, session_id)
            state.folder_scan_total = total_count
            state.folder_scan_processed = processed_count
            state.add_folder_log(f"Error processing file {filepath}: {str(e)}")

    conn.commit()

    try:
        cursor.execute(
            """
            INSERT INTO folder_scan_history (directory_path)
            VALUES (?)
            ON CONFLICT(directory_path)
            DO UPDATE SET last_scanned = CURRENT_TIMESTAMP
        """,
            (directory_path,),
        )
        conn.commit()
    except Exception as e:
        state.add_folder_log(f"Failed to record scan history: {e}")

    final_status = cursor.execute("SELECT status FROM scan_sessions WHERE id = ?", (session_id,)).fetchone()
    if final_status and final_status[0] == "completed":
        state.add_folder_log(f"Scan complete. Successfully processed {processed_count} files.")
        state.FOLDER_SCAN_STATE = "idle"
    conn.close()
