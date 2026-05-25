#!/usr/bin/env python3
"""
Standalone utility script to identify duplicate media files in a directory using MD5 hashes,
and suggest metadata-tagging and de-duplication strategies.
"""

import argparse
import hashlib
import os
import sys
from collections import defaultdict

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".heif", ".tiff", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v", ".3gp", ".mpeg", ".mpg"}


def calculate_md5(filepath: str) -> str:
    """Calculates MD5 hash of a file efficiently by reading in chunks."""
    hasher = hashlib.md5()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception as e:
        print(f"Error reading file {filepath}: {e}", file=sys.stderr)
        return ""


def format_bytes(bytes_count: int) -> str:
    """Formats byte counts into a human-readable string."""
    if bytes_count == 0:
        return '0 B'
    k = 1024
    sizes = ['B', 'KB', 'MB', 'GB']
    import math
    i = int(math.floor(math.log(bytes_count) / math.log(k)))
    return f"{bytes_count / (k ** i):.2f} {sizes[i]}"


def find_duplicates(directory: str) -> tuple[dict[str, list[str]], dict[str, int]]:
    """Scans the directory recursively and groups files by their MD5 hash."""
    hashes = defaultdict(list)
    sizes = {}

    print(f"[*] Recursively scanning: {directory}")
    file_count = 0
    duplicate_count = 0

    for root, _, files in os.walk(directory):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in IMAGE_EXTENSIONS or ext in VIDEO_EXTENSIONS:
                filepath = os.path.join(root, file)
                file_hash = calculate_md5(filepath)
                if file_hash:
                    hashes[file_hash].append(filepath)
                    sizes[file_hash] = os.path.getsize(filepath)
                    file_count += 1
                    if len(hashes[file_hash]) > 1:
                        duplicate_count += 1

    # Filter only hashes that have duplicates (more than 1 filepath)
    duplicates = {h: paths for h, paths in hashes.items() if len(paths) > 1}
    return duplicates, sizes


def print_tagging_strategies():
    """Prints guidance on duplicate detection tagging strategies."""
    print("=" * 80)
    print("DUPLICATE DETECTION & TAGGING STRATEGIES GUIDANCE")
    print("=" * 80)
    print("1. Is MD5 Hash Enough?")
    print("   - YES, for exact binary duplicates (identical file content).")
    print("     It has zero false positives, which makes it safe for automated deletions.")
    print("   - NO, if images are visually identical but differ in:")
    print("     * EXIF Metadata: Saving an image from a chat app strips EXIF, changing the MD5.")
    print("     * Compression/Resolution: Re-saving at different quality levels produces different MD5s.")
    print("     * Formats: Converting PNG to JPEG changes the MD5 completely.")
    print()
    print("2. Recommended Advanced Tagging Strategies:")
    print("   A. Perceptual Hashing (pHash, dHash, aHash):")
    print("      - Hashes the visual structure rather than binary bytes.")
    print("      - Libraries like 'imagehash' generate a 64-bit fingerprint of the image.")
    print("      - Identical visuals resized or converted will have a Hamming Distance of 0 or < 4.")
    print("   B. Vector Embeddings (CLIP Semantic Models):")
    print("      - (Already integrated in LLM Photo Scanner!)")
    print("      - Generating visual embeddings (CLIP ViT) and checking cosine similarity.")
    print("      - If similarity > 0.98, the photos are visual duplicates (even with watermarks or crops).")
    print("   C. File Stats Fallback (Name + Size + Date):")
    print("      - Match combination of filename (ignoring suffixes like '_1'), file size (within 1%),")
    print("        and Date Taken (EXIF) or Date Modified.")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Find duplicate media files in a directory recursively.")
    parser.add_argument("directory", help="The absolute directory path to scan.")
    parser.add_argument("--tagging-strategies", action="store_true", help="Print guidance on duplicate tagging strategies.")

    args = parser.parse_args()

    if args.tagging_strategies:
        print_tagging_strategies()
        sys.exit(0)

    if not os.path.exists(args.directory):
        print(f"Error: Path '{args.directory}' does not exist.", file=sys.stderr)
        sys.exit(1)

    if not os.path.isdir(args.directory):
        print(f"Error: Path '{args.directory}' is not a directory.", file=sys.stderr)
        sys.exit(1)

    duplicates, sizes = find_duplicates(args.directory)

    print()
    print("=" * 80)
    print(f"DUPLICATE DETECTOR REPORT: {args.directory}")
    print("=" * 80)

    if not duplicates:
        print("[+] No duplicate media files found.")
        print("=" * 80)
        sys.exit(0)

    total_wasted_space = 0
    group_idx = 1

    for file_hash, paths in duplicates.items():
        size = sizes[file_hash]
        wasted = size * (len(paths) - 1)
        total_wasted_space += wasted

        print(f"Group {group_idx} | MD5: {file_hash} | Size: {format_bytes(size)}")
        # Recommend the copy with the shortest filepath or shortest name (often the original)
        paths_sorted = sorted(paths, key=lambda p: (len(os.path.basename(p)), len(p)))
        recommend_keep = paths_sorted[0]

        for p in paths:
            marker = "[KEEP RECOMMENDATION]" if p == recommend_keep else "[DUPLICATE COPY]"
            print(f"  - {marker} {p}")
        print()
        group_idx += 1

    print("=" * 80)
    print(f"Summary: Found {len(duplicates)} duplicate groups.")
    print(f"Total potential disk space reclaimed by deduplication: {format_bytes(total_wasted_space)}")
    print("=" * 80)
    print("[*] Run this script with '--tagging-strategies' to learn about visual de-duplication patterns.")


if __name__ == "__main__":
    main()
