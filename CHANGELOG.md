# Changelog

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
