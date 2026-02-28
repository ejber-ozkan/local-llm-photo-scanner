"""
Dependency injection definitions for yielding SQLite connections to FastAPI routers.
"""

import sqlite3
from collections.abc import Generator

from core.config import DB_FILE, DB_TEST_FILE


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    FastAPI Dependency: Yields a fresh uncommitted database session for the request scope,
    ensuring it correctly closes out upon termination.
    """
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()


def get_test_db() -> Generator[sqlite3.Connection, None, None]:
    """
    FastAPI Dependency: Yields a fresh connection exclusively for the sandbox test database.
    Prevents cross-contamination of isolated UI tests with the permanent user gallery.
    """
    conn = sqlite3.connect(DB_TEST_FILE, check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()
