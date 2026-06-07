# Graph Report - .  (2026-06-07)

## Corpus Check
- Large corpus: 119 files À ~635,414 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 884 nodes · 1243 edges · 89 communities (55 shown, 34 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

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
- [[_COMMUNITY_TypeScript Configuration Settings|TypeScript Configuration Settings]]
- [[_COMMUNITY_Component Library Codebase|Component Library Codebase]]
- [[_COMMUNITY_Duplicate Report Features|Duplicate Report Features]]
- [[_COMMUNITY_Local Media Scanner Tools|Local Media Scanner Tools]]
- [[_COMMUNITY_Database and Configuration Management|Database and Configuration Management]]
- [[_COMMUNITY_File and Folder Management|File and Folder Management]]
- [[_COMMUNITY_scan related components|scan related components]]
- [[_COMMUNITY_FFmpeg Detection and Setup|FFmpeg Detection and Setup]]
- [[_COMMUNITY_File Management and Duplicate Detection|File Management and Duplicate Detection]]
- [[_COMMUNITY_Database Connection and Setup|Database Connection and Setup]]
- [[_COMMUNITY_Image Display Module|Image Display Module]]
- [[_COMMUNITY_Image Optimization Tools|Image Optimization Tools]]
- [[_COMMUNITY_Mock Data Providers|Mock Data Providers]]
- [[_COMMUNITY_Path Navigation Utilities|Path Navigation Utilities]]
- [[_COMMUNITY_Video Stream Validation|Video Stream Validation]]
- [[_COMMUNITY_Media Content Serving Logic|Media Content Serving Logic]]
- [[_COMMUNITY_Error Handling Component Module|Error Handling Component Module]]
- [[_COMMUNITY_Photo Gallery Features|Photo Gallery Features]]
- [[_COMMUNITY_Duplicate File Detection|Duplicate File Detection]]
- [[_COMMUNITY_Folder Explorer Integration Tests|Folder Explorer Integration Tests]]
- [[_COMMUNITY_Confirm Dialog Implementation|Confirm Dialog Implementation]]
- [[_COMMUNITY_Main Application Entry Point|Main Application Entry Point]]
- [[_COMMUNITY_FFmpeg Utility Functions|FFmpeg Utility Functions]]
- [[_COMMUNITY_Duplicate Report Handling|Duplicate Report Handling]]
- [[_COMMUNITY_Local Directory Scanner|Local Directory Scanner]]
- [[_COMMUNITY_Intersection Observer Service|Intersection Observer Service]]
- [[_COMMUNITY_Database Management Tools|Database Management Tools]]
- [[_COMMUNITY_Video Player Component Suite|Video Player Component Suite]]
- [[_COMMUNITY_Media Date Extraction Logic|Media Date Extraction Logic]]
- [[_COMMUNITY_Database Schema Maintenance|Database Schema Maintenance]]
- [[_COMMUNITY_System Boot Process Scripts|System Boot Process Scripts]]
- [[_COMMUNITY_Project Build Configuration Files|Project Build Configuration Files]]
- [[_COMMUNITY_Python Documentation Generation|Python Documentation Generation]]
- [[_COMMUNITY_API Search Filter Tests|API Search Filter Tests]]
- [[_COMMUNITY_Duplicate Detection Tests|Duplicate Detection Tests]]
- [[_COMMUNITY_Backend Test Infrastructure|Backend Test Infrastructure]]
- [[_COMMUNITY_Frontend Test Automation Scripts|Frontend Test Automation Scripts]]
- [[_COMMUNITY_System Shutdown and Startup Scripts|System Shutdown and Startup Scripts]]
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
- [[_COMMUNITY_React Build Infrastructure|React Build Infrastructure]]
- [[_COMMUNITY_Code Analysis Tool Integration|Code Analysis Tool Integration]]
- [[_COMMUNITY_Python Project Dependencies|Python Project Dependencies]]
- [[_COMMUNITY_Image Processing Module|Image Processing Module]]
- [[_COMMUNITY_Image Rendering Pipeline|Image Rendering Pipeline]]
- [[_COMMUNITY_Application Configuration Management|Application Configuration Management]]
- [[_COMMUNITY_User Interface Settings|User Interface Settings]]
- [[_COMMUNITY_Test Automation Dashboard|Test Automation Dashboard]]
- [[_COMMUNITY_Vite SVG Assets|Vite SVG Assets]]

## God Nodes (most connected - your core abstractions)
1. `background_processor()` - 25 edges
2. `compilerOptions` - 20 edges
3. `FoldersPage` - 19 edges
4. `compilerOptions` - 18 edges
5. `seed_db_for_processing()` - 17 edges
6. `background_folder_processor()` - 14 edges
7. `Any` - 12 edges
8. `ScanRequest` - 12 edges
9. `ScanControlRequest` - 12 edges
10. `get_resumable_session()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `test_version_metadata_is_aligned()` --calls--> `Path`  [INFERRED]
  backend/tests/test_scripts.py → scripts/bump_version.py
- `test_bump_version_check_passes()` --calls--> `Path`  [INFERRED]
  backend/tests/test_scripts.py → scripts/bump_version.py
- `DuplicateReportFile` --references--> `Any`  [EXTRACTED]
  frontend/src/types.ts → backend/api/routes/folder_scan.py
- `DuplicateReportFile` --references--> `Connection`  [EXTRACTED]
  frontend/src/types.ts → backend/api/routes/folder_scan.py
- `DuplicateReportFile` --references--> `Response`  [EXTRACTED]
  frontend/src/types.ts → backend/api/routes/folder_scan.py

## Import Cycles
- None detected.

## Communities (89 total, 34 thin omitted)

### Community 0 - "Image Processing Services"
Cohesion: 0.06
Nodes (56): Any, _convert_gps_to_decimal(), _convert_heic_to_jpeg_bytes(), encode_image_to_base64(), extract_all_exif(), extract_exif_for_filters(), extract_gps_from_exif(), ImageServiceError (+48 more)

### Community 1 - "Frontend Application Dependencies"
Cohesion: 0.04
Nodes (46): dependencies, axios, lucide-react, react, react-dom, react-router-dom, @videojs/react, devDependencies (+38 more)

### Community 2 - "Image Search Endpoints"
Cohesion: 0.06
Nodes (20): Exception, Test serving an HEIC image when conversion fails, falling back to original., test_get_image_heic_convert_error_fallback(), Verify search endpoint falls back to standard SQLite query when ChromaDB raises, Test that searching invokes ChromaDB and returns the expected photo., Test the Find Similar Photos endpoint., Test get_clip_model handles ImportError gracefully., Sets up SQLite and ChromaDB with initial test data. (+12 more)

### Community 3 - "Repository Version Management"
Cohesion: 0.09
Nodes (30): Load the application version from the repository root VERSION file., _read_app_version(), Path, apply_version(), build_repo_paths(), check_alignment(), collect_version_state(), main() (+22 more)

### Community 4 - "System Testing and Debugging"
Cohesion: 0.06
Nodes (7): The frontend checks FFmpeg availability via the /api/system route., seed_extra_db(), test_check_ffmpeg_frontend_route_alias(), test_get_duplicates(), test_get_photo_and_thumbnail(), test_get_photo_detail_success(), test_get_years()

### Community 5 - "Backend Infrastructure Setup"
Cohesion: 0.08
Nodes (30): Main APIRouter registry aggregating all individual route namespaces., Any, Connection, Connection, Main entrypoint for the Local AI Photo Scanner backend application.  This module, Application startup hook triggering local database initialization., startup_event(), Configuration constants and global environment states for the application. (+22 more)

### Community 6 - "Background Scanner Framework"
Cohesion: 0.11
Nodes (33): Any, BackgroundTasks, Connection, Cursor, Payload specifying the absolute directory path to scan., Payload dictating control signals ('pause', 'resume', 'cancel') to the scanner., ScanControlRequest, ScanRequest (+25 more)

### Community 7 - "Chroma Client API Module"
Cohesion: 0.07
Nodes (31): ClientAPI, get_chroma_client(), get_chroma_data_dir(), get_clip_collection(), get_faces_collection(), get_photos_collection(), Return the filesystem path used by the persistent Chroma client., Returns the singleton ChromaDB client instance.     During normal operation, th (+23 more)

### Community 8 - "CLIP Model Management System"
Cohesion: 0.11
Nodes (27): Any, Connection, Response, get_clip_model(), Returns the singleton SentenceTransformer CLIP model., clear_gallery_filters_cache(), _compute_gallery_filters(), get_duplicates() (+19 more)

### Community 9 - "API Scan Tests Suite"
Cohesion: 0.08
Nodes (28): Test that scanning a non-existent directory returns 400., Test that starting a scan correctly enqueue background tasks., Test renaming an entity., Test deleting an entity., Test getting an image that does not exist in DB., Test serving a standard JPEG image., Test serving an HEIC image that already has a cached JPEG version., Test serving an HEIC image triggering conversion on-the-fly. (+20 more)

### Community 10 - "Database Backup and Restore"
Cohesion: 0.10
Nodes (23): Any, backup_database(), Duplicates the main library database into the backups folder.      Generates a, Restores the database from a backup file, keeping a safety copy of the current D, restore_database(), RestoreRequest, clear_test_db(), get_backups() (+15 more)

### Community 11 - "FFmpeg Detection Utility"
Cohesion: 0.11
Nodes (24): _candidate_from_env_value(), _common_windows_ffmpeg_candidates(), _explicit_ffmpeg_candidates(), _find_ffmpeg_on_path(), _first_existing_file(), get_ffmpeg_path(), get_ffmpeg_preset(), FFmpeg detection utility.  Provides a single helper to locate the ffmpeg binar (+16 more)

### Community 12 - "Folder Scan and Duplicate Report"
Cohesion: 0.14
Nodes (22): Any, Connection, build_duplicate_report(), dates_explorer(), _duplicate_hashes_cte(), _duplicate_report_where_clause(), get_folder_scan_history(), get_folder_scan_logs() (+14 more)

### Community 13 - "Folder Scanner Management"
Cohesion: 0.11
Nodes (22): Any, Connection, control_folder_scan(), FolderScanControlRequest, Payload to pause, resume, or cancel the folder scanner., Pauses, resumes, or cancels/stops the active background directory scan., _clear_gallery_filters_cache(), Scans a local directory and adds new images to the database queue. (+14 more)

### Community 14 - "Compiler Configuration Settings"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+13 more)

### Community 15 - "TypeScript Configuration Settings"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 16 - "Component Library Codebase"
Cohesion: 0.15
Nodes (12): FoldersPage(), Gallery(), ScanTest(), SettingsPage(), ACCENT, ICONS, ToastContainer(), ToastMessage (+4 more)

### Community 17 - "Duplicate Report Features"
Cohesion: 0.11
Nodes (18): Helper to seed exact duplicate groups for report endpoints., The duplicate report returns only file-hash duplicate groups., Duplicate report filters apply before file-hash grouping., Timeline file cards receive the count of eligible duplicate locations., Exact duplicates do not present invalid videos as real duplicate media., Invalid media stubs appear only in their dedicated report category., An invalid video is not advertised as a duplicate from file actions., CSV export emits one file row per duplicate item in the filtered report. (+10 more)

### Community 18 - "Local Media Scanner Tools"
Cohesion: 0.17
Nodes (16): Any, background_folder_processor(), calculate_md5(), extract_rich_image_metadata(), extract_rich_video_metadata(), folder_scan_generator(), format_exposure_time(), format_rational() (+8 more)

### Community 19 - "Database and Configuration Management"
Cohesion: 0.17
Nodes (16): BaseModel, DatabaseCleanRequest, DatabaseCleanRequest, Pydantic data transfer objects (DTOs) for the application's API endpoints., Payload to update application settings, such as active LLM models., Response payload containing database items conforming to the query., Payload to obliterate all existing table architectures and recreate them., Payload conveying the filename of an SQL dump to restore. (+8 more)

### Community 20 - "File and Folder Management"
Cohesion: 0.12
Nodes (16): Folder image previews convert in memory without writing a local JPEG., A paused folder scan can continue from persisted queue rows after worker memory, A backend restart leaves durable work resumable rather than pretending it is run, Scanned videos without a decodable stream are marked as invalid stubs., Ordinary timeline views hide invalid stubs while the stub category exposes them., CSV export handles paths and filenames containing quotes and delimiters., CSV export handles EXIF strings terminated with a NUL byte., Duplicate report pagination limits returned groups without changing summary tota (+8 more)

### Community 21 - "scan related components"
Cohesion: 0.17
Nodes (6): ScanPanelItem, server, FolderScanStatus, ScanHistoryItem, ScanStatus, renderIdentify()

### Community 22 - "FFmpeg Detection and Setup"
Cohesion: 0.16
Nodes (11): _assert_same_path(), Compare paths using the platform's path casing rules., Create fake ffmpeg binaries that can be found on Windows or POSIX., Explicit FFMPEG_PATH file overrides PATH discovery., Explicit FFMPEG_PATH directory resolves to the ffmpeg binary inside it., Registry PATH entries are searched when the process PATH does not include FFmpeg, A clear RuntimeError is raised when no detection route finds FFmpeg., test_get_ffmpeg_path_raises_when_not_found() (+3 more)

### Community 23 - "File Management and Duplicate Detection"
Cohesion: 0.20
Nodes (12): FileCardProps, FoldersPage, Identify, DateDrilldownItem, DuplicatePhoto, DuplicateReportResponse, Entity, FolderExplorerResponse (+4 more)

### Community 24 - "Database Connection and Setup"
Cohesion: 0.16
Nodes (13): find_best_face_match(), get_connection(), init_db(), init_single_db(), Connection, Initialize both the main and test databases.      This function iterates throu, Initialize a single SQLite database with the required schema.      Creates the, Get a connection to the specified database.      Args:         use_test_db (b (+5 more)

### Community 25 - "Image Display Module"
Cohesion: 0.20
Nodes (7): LocationMapProps, MetadataSectionProps, FilterOptions, Photo, PhotoDetail, formatDateGroup(), getYearFromDate()

### Community 27 - "Image Optimization Tools"
Cohesion: 0.18
Nodes (4): LazyImageProps, DuplicatesPage, DuplicateGroup, MockIntersectionObserver

### Community 28 - "Mock Data Providers"
Cohesion: 0.20
Nodes (9): handlers, mockDuplicates, mockFilterOptions, mockModels, mockPhotoDetail, mockPhotos, mockScanStatus, mockUnidentified (+1 more)

### Community 29 - "Path Navigation Utilities"
Cohesion: 0.20
Nodes (10): explorer(), _immediate_child_path(), _is_same_or_descendant_path(), _normalize_directory_path(), _path_parts(), Split a normalized path into anchor, remaining path parts, and separator., Return whether path is ancestor itself or a descendant, without stat calls., Return the first child folder below parent when descendant is inside parent. (+2 more)

### Community 30 - "Video Stream Validation"
Cohesion: 0.20
Nodes (10): Check whether a purported video contains a decodable video stream., validate_video_stream(), Empty MP4 containers are not valid video media., Trivial container stubs are rejected without invoking FFmpeg., FFmpeg probe failures classify videos as invalid without blocking the scan., Slow probes are bounded so one awkward video cannot stall the whole scan., test_validate_video_stream_does_not_probe_tiny_container_stub(), test_validate_video_stream_marks_ffmpeg_failure_as_invalid() (+2 more)

### Community 31 - "Media Content Serving Logic"
Cohesion: 0.28
Nodes (9): Response, FileResponse, _ensure_scanned_media_access(), Streams local media file content using Starlette range support (essential for br, Serve image previews in a browser-compatible format, including HEIC/HEIF convers, Serve browser-displayable image content, converting HEIC/HEIF to JPEG in memory., Ensure a file belongs to a scanned dataset before serving it., _serve_image_preview() (+1 more)

### Community 32 - "Error Handling Component Module"
Cohesion: 0.22
Nodes (3): ErrorBoundary, Props, State

### Community 33 - "Photo Gallery Features"
Cohesion: 0.22
Nodes (5): renderDuplicates(), renderFoldersPage(), renderGallery(), renderScanTest(), renderSettings()

### Community 34 - "Duplicate File Detection"
Cohesion: 0.28
Nodes (8): calculate_md5(), format_bytes(), main(), print_tagging_strategies(), Calculates MD5 hash of a file efficiently by reading in chunks., Formats byte counts into a human-readable string., Scans the directory recursively and groups files by their MD5 hash., Prints guidance on duplicate detection tagging strategies.

### Community 35 - "Folder Explorer Integration Tests"
Cohesion: 0.22
Nodes (9): Helper to seed the test db with folder explorer records., Explorer lists only folders and files that were indexed in the database., Tests drilling down hierarchical dates (Year -> Month -> Day -> Files)., Tests searching and duplicates resolution APIs., Tests that the Dates Explorer API correctly filters by date range and media type, seed_folders_test_db(), test_api_folder_scan_dates(), test_api_folder_scan_explorer() (+1 more)

### Community 36 - "Confirm Dialog Implementation"
Cohesion: 0.29
Nodes (3): EntityRowProps, defaultProps, baseProps

### Community 37 - "Main Application Entry Point"
Cohesion: 0.29
Nodes (3): Gallery, ScanTest, SettingsPage

### Community 38 - "FFmpeg Utility Functions"
Cohesion: 0.33
Nodes (6): check_ffmpeg_available(), get_ffmpeg_version(), Return the ffmpeg version string (first line of ffmpeg -version output)., Return a dict with availability status, binary path, and version string., check_ffmpeg(), Checks whether FFmpeg is installed and available on the system PATH.      Retu

### Community 39 - "Duplicate Report Handling"
Cohesion: 0.33
Nodes (6): _csv_safe_row(), Map a local_media row tuple to the duplicate report file payload., Remove NUL bytes that Python's CSV writer cannot serialize., Return exact duplicates or invalid media stubs grouped by file hash., Export the selected report category as one CSV row per media file., DuplicateReportFile

### Community 40 - "Local Directory Scanner"
Cohesion: 0.40
Nodes (5): BackgroundTasks, FolderScanRequest, Payload to trigger a local directory scan., Triggers recursive scan of a local directory to populate non-AI local_media data, scan_folder()

### Community 42 - "Database Management Tools"
Cohesion: 0.83
Nodes (3): init_db(), main(), wipe_database()

### Community 44 - "Media Date Extraction Logic"
Cohesion: 0.50
Nodes (4): extract_media_date(), Extracts dates using the fallback hierarchy:     1. EXIF Date Taken (images onl, Verifies the Date Fallback Strategy prioritizes dates correctly., test_extract_media_date_fallbacks()

## Knowledge Gaps
- **142 isolated node(s):** `StreamingResponse`, `Any`, `Any`, `name`, `private` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DuplicateReportFile` connect `Duplicate Report Handling` to `Folder Scan and Duplicate Report`, `Media Content Serving Logic`, `File Management and Duplicate Detection`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `ImageServiceError` connect `Image Processing Services` to `Image Search Endpoints`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `FoldersPage` connect `File Management and Duplicate Detection` to `Photo Gallery Features`, `Main Application Entry Point`, `Duplicate Report Handling`, `Video Player Component Suite`, `Component Library Codebase`, `scan related components`, `Image Optimization Tools`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `background_processor()` (e.g. with `find_best_face_match()` and `get_clip_model()`) actually correct?**
  _`background_processor()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Main APIRouter registry aggregating all individual route namespaces.`, `API Router grouping entity naming, extraction, and management algorithms.`, `Splits a full name into first and last name components.` to the rest of the system?**
  _376 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Image Processing Services` be split into smaller, more focused modules?**
  _Cohesion score 0.055191256830601096 - nodes in this community are weakly interconnected._
- **Should `Frontend Application Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._