# Changelog

## [3.3.1] - 2026-06-06

### Added

- Comprehensive backend unit and integration test coverage for `services/scan_worker.py` and `api/routes/system.py` raising overall backend line coverage from 76% to 86%+.
- Covered edge cases: state transitions, duplicate checks, third-party exceptions, and custom mock-cursors.

## [3.3.0] - 2026-06-06

### Added

- Frontend lazy loading support using a new `<LazyImage />` component with skeleton placeholders and fade-in animations across `Gallery.tsx`, `FoldersPage.tsx`, `Identify.tsx`, and `DuplicatesPage.tsx`.
- Gzip compression on the backend via FastAPI's `GZipMiddleware` for large JSON payloads.
- New database indexes in SQLite schema:
  - `idx_entities_photo_id` on `entities(photo_id)`
  - `idx_entities_entity_name` on `entities(entity_name)`
  - `idx_entities_type_name` on `entities(entity_type, entity_name)`
  - `idx_photos_status_date_taken` on `photos(status, date_taken)`
- Unit tests for `<LazyImage />` and global IntersectionObserver testing mocks in `setup.ts`.

### Changed

- Configured SQLite performance PRAGMAs (`synchronous = NORMAL` and `cache_size = -64000`) for database connections.
- Enabled ETag caching for `/api/image/{photo_id}` by updating the Cache-Control header to enable browser caching.
- Added 300ms input debouncing to the filename search query in Folder Explorer to reduce redundant database queries.

### Fixed

- Seeding issues in tests for `date_taken` sorting to ensure consistent results under new query indexing.

## [3.2.0] - 2026-06-06

### Added

- Comprehensive behavior-focused tests for all major page components including `SettingsPage`, `FoldersPage`, `Gallery`, `Identify`, `DuplicatesPage`, `ScanTest`, and `VideoPlayer` (raising overall frontend line coverage to 85.41%).
- Unit tests for reusable UI elements: `Toast`, `ErrorBoundary`, `ConfirmDialog`, `EntityRow`, and `dateFormatters` utility.
- Vitest coverage threshold enforcement (85% lines, 83% statements, 79% functions, 76% branches) for product code.
- Dedicated `filename` parameter to the backend search endpoint to support direct filename filtering.

### Changed

- Refactored Local Folder Explorer backend API (`/api/scan/explorer`) to serve folder lists from the database index, removing direct filesystem access and avoiding disk-read bottlenecks.
- Updated CSS nesting settings in `postcss.config.js` to resolve Vite compiler warnings.

### Fixed

- Handled CLIP AI failure states gracefully in the frontend to avoid unhandled modal exceptions.

## [3.1.0] - 2026-05-28

### Added

- Durable scan sessions for pausing and resuming AI and non-AI folder scans after app restarts.
- Full-size image viewing from the Local Folder Explorer file information panel.
- Full AI and CLIP AI actions for viewed folder images, with live in-app queue progress updates.
- In-memory HEIC/HEIF preview conversion for folder thumbnails and detail views without writing local sidecar files.
- New Local Folder Explorer screenshots in the README.

### Changed

- Folder scans now persist their queue and session counts so interrupted scans can be resumed.
- AI scanning can queue a single existing folder image while keeping the user on the current Explorer view.

### Fixed

- Video stream validation now uses a bounded FFmpeg probe so broken media cannot stall a folder scan indefinitely.

## [3.0.0] - 2026-05-25

### Added

- Non-AI local folder scanner with folder and timeline browsing for images and videos.
- Exact-hash duplicate reporting with CSV export and clickable duplicate-count card badges.
- In-app video viewing and optional FFmpeg transcoding for legacy browser playback formats.
- Invalid media stub classification and dedicated timeline/report filtering for non-decodable videos.

### Changed

- Ordinary timeline totals exclude invalid media stubs while retaining valid duplicate files at distinct paths.
- Database setup now maintains local-media schema, validation metadata, and duplicate-report indexes.
- Settings now includes local folder scan controls, history, progress, and logs.

### Fixed

- CSV duplicate-report exports sanitize embedded NUL characters before serialization.
- Identical tiny video container stubs are no longer highlighted as legitimate duplicate media.
