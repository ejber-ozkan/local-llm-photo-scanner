import contextlib
import json
import os
import runpy
from pathlib import Path


def test_backup_restore_scripts(mock_db_file, monkeypatch):
    import backup_db
    import core.config
    import restore_db

    # Override settings explicitly for exactly where mock_db_file points
    backup_db.DB_FILE = mock_db_file
    backup_db.BACKUP_DIR = "test_backups_dir"
    restore_db.DB_FILE = mock_db_file
    restore_db.BACKUP_DIR = "test_backups_dir"
    core.config.BACKUPS_DIR = "test_backups_dir"

    os.makedirs("test_backups_dir", exist_ok=True)

    # Run backup
    b_path = backup_db.backup_database()
    assert b_path is not None

    # Run restore
    b_filename = os.path.basename(b_path)
    res = restore_db.restore_database(b_filename)
    assert res is True


def test_fix_db_script(mock_db_file, monkeypatch):
    import fix_db

    fix_db.run_migration(mock_db_file)


def test_build_test_script(mock_db_file, monkeypatch, tmp_path):
    # build_test hardcodes 'photometadata.db'. We'll run it in a temp dir.
    import shutil

    shutil.copy(mock_db_file, tmp_path / "photometadata.db")
    monkeypatch.chdir(tmp_path)

    with contextlib.suppress(SystemExit):
        runpy.run_path(os.path.join(os.path.dirname(__file__), "..", "build_test.py"))


def test_test_duplicates_script(mock_db_file, monkeypatch):
    # This calls requests.post... we can't easily mock that so we just mock requests
    import requests

    class MockResponse:
        def __init__(self, data, status=200):
            self._data = data
            self.status_code = status
            self.text = ""

        def json(self):
            return self._data

    def fake_post(*args, **kwargs):
        return MockResponse({"message": "success"})

    def fake_get(*args, **kwargs):
        url = args[0] if args else kwargs.get("url", "")
        if "duplicates" in url:
            return MockResponse(
                [{"hash": "abc", "count": 2, "original": {"filename": "1.jpg"}, "copies": [{"filename": "2.jpg"}]}]
            )
        return MockResponse([])

    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests, "get", fake_get)

    with contextlib.suppress(SystemExit):
        runpy.run_path(os.path.join(os.path.dirname(__file__), "..", "test_duplicates.py"))


def test_version_metadata_is_aligned():
    root = Path(__file__).resolve().parents[2]
    version = (root / "VERSION").read_text(encoding="utf-8").strip()

    import core.config

    package_json = json.loads((root / "frontend" / "package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((root / "frontend" / "package-lock.json").read_text(encoding="utf-8"))
    mock_version_file = (root / "frontend" / "src" / "test" / "mocks" / "version.ts").read_text(encoding="utf-8")

    assert core.config.VERSION == version
    assert package_json["version"] == version
    assert package_lock["version"] == version
    assert f'"{version}"' in mock_version_file


def test_bump_version_check_passes():
    root = Path(__file__).resolve().parents[2]
    script = root / "scripts" / "bump_version.py"

    import subprocess
    import sys

    completed = subprocess.run(
        [sys.executable, str(script), "--check"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "Version metadata aligned" in completed.stdout
