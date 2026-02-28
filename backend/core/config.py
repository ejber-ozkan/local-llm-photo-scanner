"""
Configuration constants and global environment states for the application.
"""

import os

from dotenv import load_dotenv

load_dotenv()

VERSION = "1.4.0"

# Directories
BACKUPS_DIR = "backups"
DB_FILE = "photometadata.db"
DB_TEST_FILE = "test_photometadata.db"

# LLM Constants
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "127.0.0.1")
OLLAMA_PORT = os.environ.get("OLLAMA_PORT", "11434")
OLLAMA_URL = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/generate"
OLLAMA_MODELS_URL = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/tags"

# System Config
ACTIVE_OLLAMA_MODEL = "llama3.2-vision:latest"
