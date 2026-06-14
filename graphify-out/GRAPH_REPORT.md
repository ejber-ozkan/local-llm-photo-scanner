# Graph Report - LocalAIPhotoMetadataApplication  (2026-06-14)

## Corpus Check
- 57 files · ~47,979 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 604 nodes · 932 edges · 57 communities (33 shown, 24 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d68f2176`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Image Processing Services|Image Processing Services]]
- [[_COMMUNITY_Frontend Application Dependencies|Frontend Application Dependencies]]
- [[_COMMUNITY_Image Search Endpoints|Image Search Endpoints]]
- [[_COMMUNITY_Repository Version Management|Repository Version Management]]
- [[_COMMUNITY_System Testing and Debugging|System Testing and Debugging]]
- [[_COMMUNITY_Backend Infrastructure Setup|Backend Infrastructure Setup]]
- [[_COMMUNITY_Background Scanner Framework|Background Scanner Framework]]
- [[_COMMUNITY_Chroma Client API Module|Chroma Client API Module]]
- [[_COMMUNITY_CLIP Model Management System|CLIP Model Management System]]
- [[_COMMUNITY_API Scan Tests Suite|API Scan Tests Suite]]
- [[_COMMUNITY_Database Backup and Restore|Database Backup and Restore]]
- [[_COMMUNITY_FFmpeg Detection Utility|FFmpeg Detection Utility]]
- [[_COMMUNITY_Folder Scan and Duplicate Report|Folder Scan and Duplicate Report]]
- [[_COMMUNITY_Folder Scanner Management|Folder Scanner Management]]
- [[_COMMUNITY_Compiler Configuration Settings|Compiler Configuration Settings]]
- [[_COMMUNITY_Local Media Scanner Tools|Local Media Scanner Tools]]
- [[_COMMUNITY_Database and Configuration Management|Database and Configuration Management]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_File Management and Duplicate Detection|File Management and Duplicate Detection]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Path Navigation Utilities|Path Navigation Utilities]]
- [[_COMMUNITY_Error Handling Component Module|Error Handling Component Module]]
- [[_COMMUNITY_Database Schema Maintenance|Database Schema Maintenance]]
- [[_COMMUNITY_Application Shell Setup|Application Shell Setup]]
- [[_COMMUNITY_Git Configuration Management|Git Configuration Management]]
- [[_COMMUNITY_Image Capture and Storage|Image Capture and Storage]]
- [[_COMMUNITY_Image Capture and Storage|Image Capture and Storage]]
- [[_COMMUNITY_Image Display and Capture|Image Display and Capture]]
- [[_COMMUNITY_Photo Asset Management System|Photo Asset Management System]]
- [[_COMMUNITY_Unsplash Image Utilities Library|Unsplash Image Utilities Library]]
- [[_COMMUNITY_Image Processing Functions|Image Processing Functions]]
- [[_COMMUNITY_Image Upload Module|Image Upload Module]]
- [[_COMMUNITY_Image Processing Module|Image Processing Module]]
- [[_COMMUNITY_Image Processing Module|Image Processing Module]]
- [[_COMMUNITY_Image Processing Framework|Image Processing Framework]]
- [[_COMMUNITY_React Component Assets|React Component Assets]]
- [[_COMMUNITY_React JSX Validation Rules|React JSX Validation Rules]]
- [[_COMMUNITY_Code Analysis Tool Integration|Code Analysis Tool Integration]]
- [[_COMMUNITY_Python Project Dependencies|Python Project Dependencies]]
- [[_COMMUNITY_Image Processing Module|Image Processing Module]]
- [[_COMMUNITY_Image Rendering Pipeline|Image Rendering Pipeline]]
- [[_COMMUNITY_Application Configuration Management|Application Configuration Management]]
- [[_COMMUNITY_User Interface Settings|User Interface Settings]]
- [[_COMMUNITY_Test Automation Dashboard|Test Automation Dashboard]]
- [[_COMMUNITY_Vite SVG Assets|Vite SVG Assets]]

## God Nodes (most connected - your core abstractions)
1. `FoldersPage` - 15 edges
2. `Connection` - 14 edges
3. `Changelog` - 14 edges
4. `Any` - 12 edges
5. `build_duplicate_report()` - 12 edges
6. `Any` - 12 edges
7. `ScanRequest` - 12 edges
8. `ScanControlRequest` - 12 edges
9. `get_resumable_session()` - 12 edges
10. `DuplicateReportFile` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Map a local_media row tuple to the duplicate report file payload.` --rationale_for--> `DuplicateReportFile`  [EXTRACTED]
  backend/api/routes/folder_scan.py → frontend/src/types.ts
- `Return exact duplicates or invalid media stubs grouped by file hash.` --rationale_for--> `DuplicateReportFile`  [EXTRACTED]
  backend/api/routes/folder_scan.py → frontend/src/types.ts
- `Export the selected report category as one CSV row per media file.` --rationale_for--> `DuplicateReportFile`  [EXTRACTED]
  backend/api/routes/folder_scan.py → frontend/src/types.ts
- `_read_app_version()` --calls--> `Path`  [INFERRED]
  backend/core/config.py → scripts/bump_version.py
- `Connection` --uses--> `UpdateEntityRequest`  [INFERRED]
  backend/api/routes/entities.py → backend/models/schemas.py

## Import Cycles
- None detected.

## Communities (57 total, 24 thin omitted)

### Community 0 - "Image Processing Services"
Cohesion: 0.08
Nodes (29): Any, Exception, clear_gallery_filters_cache(), Invalidate cached gallery filter metadata after photo/entity changes., _convert_gps_to_decimal(), _convert_heic_to_jpeg_bytes(), encode_image_to_base64(), extract_all_exif() (+21 more)

### Community 1 - "Frontend Application Dependencies"
Cohesion: 0.40
Nodes (5): Babel, OXC, Rolldown Vite, SWC, ViteJS Plugin React

### Community 2 - "Image Search Endpoints"
Cohesion: 0.06
Nodes (39): [3.0.0] - 2026-05-25, [3.1.0] - 2026-05-28, [3.2.0] - 2026-06-06, [3.3.0] - 2026-06-06, [3.3.1] - 2026-06-06, [3.4.0] - 2026-06-07, [3.5.0] - 2026-06-07, [3.6.0] - 2026-06-07 (+31 more)

### Community 3 - "Repository Version Management"
Cohesion: 0.12
Nodes (28): Load the application version from the repository root VERSION file., _read_app_version(), Path, apply_version(), build_repo_paths(), check_alignment(), collect_version_state(), main() (+20 more)

### Community 4 - "System Testing and Debugging"
Cohesion: 0.08
Nodes (23): 1. Backend Setup, 1. Ensure Ollama is Running, 2. Frontend Setup, 2. Start using provided scripts (Recommended), 3. How to Stop, 4. Open the Application, 4. Start Manually (Alternative), 5. Managing Your Database (+15 more)

### Community 5 - "Backend Infrastructure Setup"
Cohesion: 0.08
Nodes (29): Main APIRouter registry aggregating all individual route namespaces., Any, Connection, Connection, Main entrypoint for the Local AI Photo Scanner backend application.  This module, Application startup hook triggering local database initialization., startup_event(), Configuration constants and global environment states for the application. (+21 more)

### Community 6 - "Background Scanner Framework"
Cohesion: 0.05
Nodes (70): Any, BackgroundTasks, Connection, Any, Connection, BaseModel, Cursor, DatabaseCleanRequest (+62 more)

### Community 7 - "Chroma Client API Module"
Cohesion: 0.12
Nodes (20): ClientAPI, get_chroma_client(), get_chroma_data_dir(), get_clip_collection(), get_faces_collection(), get_photos_collection(), Return the filesystem path used by the persistent Chroma client., Returns the singleton ChromaDB client instance.     During normal operation, th (+12 more)

### Community 8 - "CLIP Model Management System"
Cohesion: 0.11
Nodes (28): Any, Connection, Response, get_clip_model(), Returns the singleton SentenceTransformer CLIP model., Request, _compute_gallery_filters(), get_duplicates() (+20 more)

### Community 9 - "API Scan Tests Suite"
Cohesion: 0.17
Nodes (11): ScanTest(), COLOR_THEMES, ConfirmModal, SettingsPage(), ACCENT, ICONS, ToastContainer(), ToastMessage (+3 more)

### Community 10 - "Database Backup and Restore"
Cohesion: 0.09
Nodes (26): Any, backup_database(), Duplicates the main library database into the backups folder.      Generates a, Restores the database from a backup file, keeping a safety copy of the current D, restore_database(), clean_database(), clear_test_db(), get_backups() (+18 more)

### Community 11 - "FFmpeg Detection Utility"
Cohesion: 0.09
Nodes (30): _candidate_from_env_value(), check_ffmpeg_available(), _common_windows_ffmpeg_candidates(), _explicit_ffmpeg_candidates(), _find_ffmpeg_on_path(), _first_existing_file(), get_ffmpeg_path(), get_ffmpeg_preset() (+22 more)

### Community 12 - "Folder Scan and Duplicate Report"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

### Community 13 - "Folder Scanner Management"
Cohesion: 0.16
Nodes (8): Gallery(), LocationMapProps, MetadataSectionProps, FilterOptions, Photo, PhotoDetail, formatDateGroup(), getYearFromDate()

### Community 14 - "Compiler Configuration Settings"
Cohesion: 0.36
Nodes (9): FileCard(), FileCardProps, FoldersPage(), VideoPlayer, FoldersPage, DateDrilldownItem, DuplicateReportResponse, FolderExplorerResponse (+1 more)

### Community 18 - "Local Media Scanner Tools"
Cohesion: 0.10
Nodes (27): Any, calculate_md5(), find_duplicates(), format_bytes(), main(), print_tagging_strategies(), Calculates MD5 hash of a file efficiently by reading in chunks., Formats byte counts into a human-readable string. (+19 more)

### Community 19 - "Database and Configuration Management"
Cohesion: 0.33
Nodes (4): formatScanCount(), GlobalScanStatusPanel(), ScanPanelItem, FolderScanStatus

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (4): ConfirmModal, ScanLog, ScanMode, ScanHistoryItem

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (3): ConfirmDialogProps, EntityRow, EntityRowProps

### Community 23 - "File Management and Duplicate Detection"
Cohesion: 0.20
Nodes (13): DuplicatesPage(), Identify(), LazyImageProps, DuplicatesPage, Identify, DuplicateGroup, DuplicatePhoto, DuplicateReportGroup (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (15): clamp(), DEFAULT_CENTER, formatLocation(), getPhotoImageUrl(), ImageMapPage(), latToY(), lonToX(), MapProvider (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.24
Nodes (9): find_best_face_match(), get_connection(), init_db(), init_single_db(), Connection, Initialize both the main and test databases.      This function iterates throu, Initialize a single SQLite database with the required schema.      Creates the, Get a connection to the specified database.      Args:         use_test_db (b (+1 more)

### Community 29 - "Path Navigation Utilities"
Cohesion: 0.07
Nodes (57): Any, BackgroundTasks, Connection, Response, FileResponse, build_duplicate_report(), _csv_safe_row(), dates_explorer() (+49 more)

### Community 32 - "Error Handling Component Module"
Cohesion: 0.12
Nodes (8): ErrorBoundary, Props, State, Gallery, ImageMapPage, ScanPage, ScanTest, SettingsPage

## Knowledge Gaps
- **107 isolated node(s):** `StreamingResponse`, `Request`, `Any`, `Any`, `Gallery` (+102 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DuplicateReportFile` connect `Path Navigation Utilities` to `Compiler Configuration Settings`, `File Management and Duplicate Detection`?**
  _High betweenness centrality (0.250) - this node is a cross-community bridge._
- **Why does `FoldersPage` connect `Compiler Configuration Settings` to `Error Handling Component Module`, `API Scan Tests Suite`, `Path Navigation Utilities`, `File Management and Duplicate Detection`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `_read_app_version()` connect `Repository Version Management` to `Backend Infrastructure Setup`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **What connects `Main APIRouter registry aggregating all individual route namespaces.`, `API Router grouping entity naming, extraction, and management algorithms.`, `Splits a full name into first and last name components.` to the rest of the system?**
  _264 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Image Processing Services` be split into smaller, more focused modules?**
  _Cohesion score 0.08172043010752689 - nodes in this community are weakly interconnected._
- **Should `Image Search Endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.057692307692307696 - nodes in this community are weakly interconnected._
- **Should `Repository Version Management` be split into smaller, more focused modules?**
  _Cohesion score 0.1206896551724138 - nodes in this community are weakly interconnected._