"""
Global application state management (e.g. background worker scanning state).
"""

from collections import deque
from datetime import datetime

# Global structural properties
SCAN_STATE = "idle"  # idle, scanning, paused
IGNORE_SCREENSHOTS = False
USE_OLLAMA = True
USE_CLIP = True
scan_logs: deque[dict[str, str]] = deque(maxlen=200)

current_scan_total = 0
current_scan_processed = 0

# Folder Scan (Non-AI) structural properties
FOLDER_SCAN_STATE = "idle"  # idle, running, paused
folder_scan_logs: deque[dict[str, str]] = deque(maxlen=200)
folder_scan_total = 0
folder_scan_processed = 0


def add_log(msg: str) -> None:
    """Appends a new formatted log frame to the global historical log buffer."""
    timestamp = datetime.now().strftime("%I:%M:%S %p")
    scan_logs.appendleft({"time": timestamp, "message": msg})
    print(msg)


def add_folder_log(msg: str) -> None:
    """Appends a new formatted log frame to the global folder scan log buffer."""
    timestamp = datetime.now().strftime("%I:%M:%S %p")
    folder_scan_logs.appendleft({"time": timestamp, "message": msg})
    print(f"[Folder Scan] {msg}")
