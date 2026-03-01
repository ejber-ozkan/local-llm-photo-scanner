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
    entities: { type: string; name: string; bounding_box?: string }[];
    metadata: Record<string, string>;
    gps_lat?: number;
    gps_lon?: number;
    ai_model?: string;
    history?: {
        photo_id: number;
        ai_model: string;
        description: string;
        entities: { type: string; name: string; bounding_box?: string }[];
    }[];
}
