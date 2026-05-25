"""
FFmpeg detection utility.

Provides a single helper to locate the ffmpeg binary and retrieve its version
string. Used by the transcoding endpoint to give a clean error rather than a
confusing subprocess failure if FFmpeg is missing.
"""

import glob
import os
import shutil
import subprocess
import sys

WINDOWS_FFMPEG_EXE = "ffmpeg.exe"
FFMPEG_EXE = WINDOWS_FFMPEG_EXE if sys.platform == "win32" else "ffmpeg"


def _split_path_entries(path_value: str | None) -> list[str]:
    """Split a PATH-style string into non-empty entries."""
    if not path_value:
        return []
    return [entry for entry in path_value.split(os.pathsep) if entry]


def _read_windows_path_entries() -> list[str]:
    """Return machine/user PATH entries from the Windows registry.

    Desktop-launched apps can inherit a stale or reduced PATH compared with a
    freshly opened terminal. Reading the registry lets the backend see the
    current user and machine PATH values without requiring an app restart after
    FFmpeg is installed.
    """
    if sys.platform != "win32":
        return []

    try:
        import winreg
    except ImportError:
        return []

    registry_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
        (winreg.HKEY_CURRENT_USER, "Environment"),
    ]
    entries: list[str] = []

    for hive, subkey in registry_paths:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                value, _ = winreg.QueryValueEx(key, "Path")
        except OSError:
            continue

        expanded = os.path.expandvars(value)
        entries.extend(_split_path_entries(expanded))

    return entries


def _candidate_from_env_value(value: str | None) -> str | None:
    """Normalize an explicit FFmpeg override from environment variables."""
    if not value:
        return None

    candidate = os.path.expandvars(os.path.expanduser(value.strip().strip('"')))
    if os.path.isdir(candidate):
        candidate = os.path.join(candidate, FFMPEG_EXE)
    return candidate


def _explicit_ffmpeg_candidates() -> list[str]:
    """Return explicit FFmpeg binary candidates from common env vars."""
    candidates = []
    for env_name in ("FFMPEG_PATH", "FFMPEG_BINARY", "IMAGEIO_FFMPEG_EXE"):
        candidate = _candidate_from_env_value(os.environ.get(env_name))
        if candidate:
            candidates.append(candidate)
    return candidates


def _common_windows_ffmpeg_candidates() -> list[str]:
    """Return FFmpeg paths used by common Windows installers/package managers."""
    if sys.platform != "win32":
        return []

    user_profile = os.environ.get("USERPROFILE", "")
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    scoop = os.environ.get("SCOOP", os.path.join(user_profile, "scoop") if user_profile else "")
    chocolatey = os.environ.get("CHOCOLATEYINSTALL", r"C:\ProgramData\chocolatey")

    candidates = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        os.path.join(chocolatey, "bin", "ffmpeg.exe"),
        os.path.join(scoop, "shims", "ffmpeg.exe"),
        os.path.join(scoop, "apps", "ffmpeg", "current", "bin", "ffmpeg.exe"),
    ]

    if local_app_data:
        winget_packages = os.path.join(local_app_data, "Microsoft", "WinGet", "Packages")
        candidates.extend(glob.glob(os.path.join(winget_packages, "*", "ffmpeg*", "bin", "ffmpeg.exe")))

    return candidates


def _first_existing_file(candidates: list[str]) -> str | None:
    """Return the first existing file path from a list of candidate paths."""
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return os.path.abspath(candidate)
    return None


def _find_ffmpeg_on_path() -> str | None:
    """Find FFmpeg using the current process PATH plus Windows registry PATHs."""
    path_entries = _split_path_entries(os.environ.get("PATH"))
    path_entries.extend(_read_windows_path_entries())

    seen = set()
    merged_entries = []
    for entry in path_entries:
        normalized = os.path.normcase(os.path.abspath(os.path.expandvars(entry)))
        if normalized not in seen:
            seen.add(normalized)
            merged_entries.append(entry)

    search_path = os.pathsep.join(merged_entries)
    return shutil.which("ffmpeg", path=search_path)


def get_ffmpeg_path() -> str:
    """Return absolute path to the ffmpeg binary.

    Raises
    ------
    RuntimeError
        If ffmpeg is not found on the system PATH.
    """
    path = _first_existing_file(_explicit_ffmpeg_candidates())
    if not path:
        path = _find_ffmpeg_on_path()
    if not path:
        path = _first_existing_file(_common_windows_ffmpeg_candidates())

    if not path:
        raise RuntimeError(
            "FFmpeg is not installed or not found by the application. "
            "Install FFmpeg from https://ffmpeg.org/download.html and ensure "
            "the 'ffmpeg' binary is accessible, or set FFMPEG_PATH to the full "
            "path of ffmpeg.exe. "
            "Windows: add the 'bin/' folder from the extracted FFmpeg archive to PATH. "
            "Linux: sudo apt install ffmpeg | macOS: brew install ffmpeg"
        )
    return os.path.abspath(path)


def get_ffmpeg_version(ffmpeg_path: str) -> str:
    """Return the ffmpeg version string (first line of ffmpeg -version output).

    Returns an empty string if the subprocess call fails.
    """
    try:
        result = subprocess.run(
            [ffmpeg_path, "-version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        first_line = result.stdout.splitlines()[0] if result.stdout else ""
        return first_line
    except Exception:
        return ""


def check_ffmpeg_available() -> dict:
    """Return a dict with availability status, binary path, and version string.

    Returns
    -------
    dict
        ``{"available": bool, "path": str | None, "version": str | None}``
    """
    try:
        path = get_ffmpeg_path()
        version = get_ffmpeg_version(path)
        return {"available": True, "path": path, "version": version}
    except RuntimeError:
        return {"available": False, "path": None, "version": None}


# ---------------------------------------------------------------------------
# Transcoding quality presets
# ---------------------------------------------------------------------------

# Maps a quality label to (ffmpeg_preset, crf_value).
# preset controls encode speed; crf controls quality (lower = better, larger file).
QUALITY_PRESETS: dict[str, tuple[str, int]] = {
    "fast": ("ultrafast", 28),       # Fastest encode, slightly lower quality
    "balanced": ("fast", 23),        # Good default — fast with decent quality
    "quality": ("medium", 18),       # Slower encode, noticeably better quality
}

DEFAULT_QUALITY = "balanced"


def get_ffmpeg_preset(quality: str) -> tuple[str, int]:
    """Return (preset, crf) tuple for the given quality label.

    Falls back to 'balanced' for unrecognised labels.
    """
    return QUALITY_PRESETS.get(quality.lower(), QUALITY_PRESETS[DEFAULT_QUALITY])
