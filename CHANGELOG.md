# Changelog

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
