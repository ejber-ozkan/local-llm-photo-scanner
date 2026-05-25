import os

import pytest

from core import ffmpeg_check


def _assert_same_path(actual, expected):
    """Compare paths using the platform's path casing rules."""
    assert os.path.normcase(actual) == os.path.normcase(os.path.abspath(expected))


def _write_fake_ffmpeg(directory):
    """Create fake ffmpeg binaries that can be found on Windows or POSIX."""
    ffmpeg = directory / "ffmpeg"
    ffmpeg.write_text("")
    ffmpeg.chmod(0o755)

    ffmpeg_exe = directory / "ffmpeg.exe"
    ffmpeg_exe.write_text("")
    ffmpeg_exe.chmod(0o755)

    return ffmpeg_exe if os.name == "nt" else ffmpeg


def test_get_ffmpeg_path_uses_explicit_env_file(tmp_path, monkeypatch):
    """Explicit FFMPEG_PATH file overrides PATH discovery."""
    fake_ffmpeg = _write_fake_ffmpeg(tmp_path)

    monkeypatch.setenv("FFMPEG_PATH", str(fake_ffmpeg))
    monkeypatch.setenv("PATH", "")
    monkeypatch.setattr(ffmpeg_check, "_read_windows_path_entries", lambda: [])
    monkeypatch.setattr(ffmpeg_check, "_common_windows_ffmpeg_candidates", lambda: [])

    _assert_same_path(ffmpeg_check.get_ffmpeg_path(), fake_ffmpeg)


def test_get_ffmpeg_path_uses_explicit_env_directory(tmp_path, monkeypatch):
    """Explicit FFMPEG_PATH directory resolves to the ffmpeg binary inside it."""
    fake_ffmpeg = _write_fake_ffmpeg(tmp_path)

    monkeypatch.setenv("FFMPEG_PATH", str(tmp_path))
    monkeypatch.setenv("PATH", "")
    monkeypatch.setattr(ffmpeg_check, "_read_windows_path_entries", lambda: [])
    monkeypatch.setattr(ffmpeg_check, "_common_windows_ffmpeg_candidates", lambda: [])

    _assert_same_path(ffmpeg_check.get_ffmpeg_path(), fake_ffmpeg)


def test_get_ffmpeg_path_uses_registry_path_entries(tmp_path, monkeypatch):
    """Registry PATH entries are searched when the process PATH does not include FFmpeg."""
    fake_ffmpeg = _write_fake_ffmpeg(tmp_path)

    monkeypatch.delenv("FFMPEG_PATH", raising=False)
    monkeypatch.delenv("FFMPEG_BINARY", raising=False)
    monkeypatch.delenv("IMAGEIO_FFMPEG_EXE", raising=False)
    monkeypatch.setenv("PATH", "")
    monkeypatch.setattr(ffmpeg_check, "_read_windows_path_entries", lambda: [str(tmp_path)])
    monkeypatch.setattr(ffmpeg_check, "_common_windows_ffmpeg_candidates", lambda: [])

    _assert_same_path(ffmpeg_check.get_ffmpeg_path(), fake_ffmpeg)


def test_get_ffmpeg_path_raises_when_not_found(monkeypatch):
    """A clear RuntimeError is raised when no detection route finds FFmpeg."""
    monkeypatch.delenv("FFMPEG_PATH", raising=False)
    monkeypatch.delenv("FFMPEG_BINARY", raising=False)
    monkeypatch.delenv("IMAGEIO_FFMPEG_EXE", raising=False)
    monkeypatch.setenv("PATH", "")
    monkeypatch.setattr(ffmpeg_check, "_read_windows_path_entries", lambda: [])
    monkeypatch.setattr(ffmpeg_check, "_common_windows_ffmpeg_candidates", lambda: [])

    with pytest.raises(RuntimeError, match="FFmpeg is not installed"):
        ffmpeg_check.get_ffmpeg_path()
