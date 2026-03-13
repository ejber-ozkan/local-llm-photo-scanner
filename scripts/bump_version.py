"""Update repository version metadata from a single source of truth.

Usage:
    python scripts/bump_version.py 2.0.2
    python scripts/bump_version.py --check
    python scripts/bump_version.py 2.0.2 --commit --tag
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
README_TITLE_RE = re.compile(r"^# Local AI Photo Gallery v[0-9]+\.[0-9]+\.[0-9]+$", re.MULTILINE)
README_FEATURES_RE = re.compile(r"^### v[0-9]+\.[0-9]+\.[0-9]+ Features$", re.MULTILINE)
TS_VERSION_RE = re.compile(r'export const MOCK_APP_VERSION = "[^"]+";')


@dataclass(frozen=True)
class RepoPaths:
    """Filesystem locations updated by the versioning workflow."""

    root: Path
    version_file: Path
    readme: Path
    frontend_package: Path
    frontend_lockfile: Path
    frontend_mock_version: Path


def build_repo_paths(root: Path) -> RepoPaths:
    """Construct the canonical set of paths used for version updates."""
    return RepoPaths(
        root=root,
        version_file=root / "VERSION",
        readme=root / "README.md",
        frontend_package=root / "frontend" / "package.json",
        frontend_lockfile=root / "frontend" / "package-lock.json",
        frontend_mock_version=root / "frontend" / "src" / "test" / "mocks" / "version.ts",
    )


def validate_version(version: str) -> None:
    """Raise if the supplied version string is not simple semantic versioning."""
    if not SEMVER_RE.fullmatch(version):
        raise ValueError(f"Invalid version '{version}'. Expected MAJOR.MINOR.PATCH.")


def read_version_file(path: Path) -> str:
    """Read the repository version file and normalize trailing whitespace."""
    return path.read_text(encoding="utf-8").strip()


def update_json_version(path: Path, version: str) -> None:
    """Write the version field in a JSON file while preserving stable formatting."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["version"] = version
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def update_readme(path: Path, version: str) -> None:
    """Update the top-level README version headings."""
    content = path.read_text(encoding="utf-8")
    content, title_count = README_TITLE_RE.subn(f"# Local AI Photo Gallery v{version}", content, count=1)
    content, features_count = README_FEATURES_RE.subn(f"### v{version} Features", content, count=1)
    if title_count != 1 or features_count != 1:
        raise ValueError("README version headings not found as expected.")
    path.write_text(content, encoding="utf-8")


def update_mock_version(path: Path, version: str) -> None:
    """Update the frontend test mock version constant."""
    content = path.read_text(encoding="utf-8")
    content, count = TS_VERSION_RE.subn(f'export const MOCK_APP_VERSION = "{version}";', content, count=1)
    if count != 1:
        raise ValueError("Frontend mock version constant not found as expected.")
    path.write_text(content, encoding="utf-8")


def apply_version(paths: RepoPaths, version: str) -> None:
    """Write the requested version into all generated metadata files."""
    validate_version(version)
    paths.version_file.write_text(version + "\n", encoding="utf-8")
    update_readme(paths.readme, version)
    update_json_version(paths.frontend_package, version)
    update_json_version(paths.frontend_lockfile, version)
    update_mock_version(paths.frontend_mock_version, version)


def collect_version_state(paths: RepoPaths) -> dict[str, str]:
    """Return the current version observed in each managed file."""
    package_json = json.loads(paths.frontend_package.read_text(encoding="utf-8"))
    package_lock = json.loads(paths.frontend_lockfile.read_text(encoding="utf-8"))
    mock_content = paths.frontend_mock_version.read_text(encoding="utf-8")
    mock_match = TS_VERSION_RE.search(mock_content)
    if mock_match is None:
        raise ValueError("Frontend mock version constant not found as expected.")

    title_match = README_TITLE_RE.search(paths.readme.read_text(encoding="utf-8"))
    if title_match is None:
        raise ValueError("README version title not found as expected.")

    return {
        "VERSION": read_version_file(paths.version_file),
        "README": title_match.group(0).removeprefix("# Local AI Photo Gallery v"),
        "frontend/package.json": str(package_json["version"]),
        "frontend/package-lock.json": str(package_lock["version"]),
        "frontend/src/test/mocks/version.ts": mock_match.group(0).split('"')[1],
    }


def check_alignment(paths: RepoPaths) -> list[str]:
    """Return mismatches from the repository version source of truth."""
    state = collect_version_state(paths)
    expected = state["VERSION"]
    mismatches = []
    for name, actual in state.items():
        if actual != expected:
            mismatches.append(f"{name}: expected {expected}, found {actual}")
    return mismatches


def run_git_command(paths: RepoPaths, *args: str) -> None:
    """Run a git command rooted at the repository path."""
    subprocess.run(["git", *args], cwd=paths.root, check=True)


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for applying or checking repository versions."""
    parser = argparse.ArgumentParser(description="Manage repository version metadata.")
    parser.add_argument("version", nargs="?", help="Version to apply (MAJOR.MINOR.PATCH).")
    parser.add_argument("--check", action="store_true", help="Verify all managed files match VERSION.")
    parser.add_argument("--commit", action="store_true", help="Create a release commit after updating files.")
    parser.add_argument("--tag", action="store_true", help="Create a git tag after updating files.")
    args = parser.parse_args(argv)

    root = Path(__file__).resolve().parents[1]
    paths = build_repo_paths(root)

    if args.check:
        mismatches = check_alignment(paths)
        if mismatches:
            for mismatch in mismatches:
                print(mismatch)
            return 1
        print(f"Version metadata aligned at {read_version_file(paths.version_file)}")
        return 0

    if not args.version:
        parser.error("version is required unless --check is used")

    apply_version(paths, args.version)
    print(f"Updated repository version to {args.version}")

    if args.commit:
        run_git_command(paths, "add", "VERSION", "README.md", "frontend/package.json", "frontend/package-lock.json", "frontend/src/test/mocks/version.ts")
        run_git_command(paths, "commit", "-m", f"Release v{args.version}")
    if args.tag:
        run_git_command(paths, "tag", f"v{args.version}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
