// ─── Shared TypeScript interfaces for the frontend ─────────────────────────

// Gallery
export interface Photo {
    id: number;
    filepath: string;
    filename: string;
    description: string;
    date_taken?: string;
    date_created?: string;
    date_modified?: string;
    scanned_at?: string;
}

export interface PhotoEntity {
    id: number;
    type: string;
    name: string;
    bounding_box?: string;
}

export interface PhotoDetail {
    id: number;
    filepath: string;
    filename: string;
    description: string;
    entities: PhotoEntity[];
    metadata: Record<string, string>;
    gps_lat?: number;
    gps_lon?: number;
    ai_model?: string;
}

export interface FilterOptions {
    names: { name: string; type: string }[];
    cameras: string[];
    date_min: string | null;
    date_max: string | null;
    total_photos: number;
    photos_with_faces: number;
    photos_unidentified: number;
}

export interface YearInfo {
    year: string;
    count: number;
}

// Identify
export interface Entity {
    id: number;
    type: string;
    name: string;
    photo_id: number;
    bounding_box?: string;
}

export interface UniquePhoto {
    photo_id: number;
    entities: Entity[];
}

// Duplicates
export interface DuplicatePhoto {
    id: number;
    filepath: string;
    filename: string;
    file_size: number;
    scanned_at?: string;
}

export interface DuplicateGroup {
    hash: string;
    count: number;
    original: DuplicatePhoto;
    copies: DuplicatePhoto[];
}

// Settings / Scan
export interface ScanStatus {
    state: 'idle' | 'running' | 'paused';
    total_gallery: number;
    total_duplicates: number;
    scan_total: number;
    scan_processed: number;
}

export interface ScanHistoryItem {
    directory_path: string;
    last_scanned: string;
}

// ScanTest
export interface TestResult {
    photo_id: number;
    filename: string;
    description: string;
    entities: { id: number; type: string; name: string; bounding_box?: string }[];
    metadata: Record<string, string>;
    gps_lat?: number;
    gps_lon?: number;
    ai_model?: string;
    history?: {
        photo_id: number;
        ai_model: string;
        description: string;
        entities: { id: number; type: string; name: string; bounding_box?: string }[];
    }[];
}

// Local Folders view & Non-AI scanner
export interface LocalMediaItem {
    id: number;
    filepath: string;
    filename: string;
    parent_path: string;
    file_size: number;
    file_hash: string;
    duplicate_count?: number;
    media_type: 'image' | 'video';
    date_taken?: string;
    date_modified?: string;
    date_created?: string;
    date_fallback?: string;
    year?: number;
    month?: number;
    day?: number;
    width?: number;
    height?: number;
    duration?: number;
    codec?: string;
    validation_status?: 'valid' | 'invalid_media_stub' | 'unvalidated';
    validation_error?: string;
    frame_rate?: number;
    bit_rate?: number;
    camera_make?: string;
    camera_model?: string;
    lens_model?: string;
    exposure_time?: string;
    f_number?: number;
    iso?: number;
    focal_length?: number;
    gps_lat?: number;
    gps_lon?: number;
    scanned_at?: string;
}

export interface FolderExplorerResponse {
    current_path: string;
    parent_path: string | null;
    directories: string[];
    files: LocalMediaItem[];
}

export interface DateDrilldownItem {
    label: string;
    value: number;
    count: number;
}

export interface FolderScanStatus {
    state: 'idle' | 'running' | 'paused';
    scan_total: number;
    scan_processed: number;
}

export interface DuplicateReportFile {
    id: number;
    filepath: string;
    filename: string;
    parent_path: string;
    file_size: number;
    file_hash: string;
    media_type: 'image' | 'video';
    validation_status?: 'valid' | 'invalid_media_stub' | 'unvalidated';
    validation_error?: string;
    date_taken?: string;
    date_modified?: string;
    date_created?: string;
    date_fallback?: string;
    year?: number;
    month?: number;
    day?: number;
    scanned_at?: string;
}

export interface DuplicateReportGroup {
    match_type: 'exact_hash' | 'invalid_media_stub';
    file_hash: string;
    count: number;
    total_bytes: number;
    wasted_bytes: number;
    files: DuplicateReportFile[];
}

export interface DuplicateReportResponse {
    match_type: 'exact_hash' | 'invalid_media_stub';
    available_match_types: string[];
    future_match_types: string[];
    summary: {
        group_count: number;
        file_count: number;
        total_bytes: number;
        wasted_bytes: number;
    };
    pagination: {
        page: number;
        page_size: number;
        total_groups: number;
        total_pages: number;
        has_next: boolean;
        has_previous: boolean;
    };
    groups: DuplicateReportGroup[];
}
