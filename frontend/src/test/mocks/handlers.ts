import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:8000';

// ── Sample data used across tests ──────────────────────────────────────────

export const mockPhotos = [
    {
        id: 1,
        filepath: '/photos/holiday/beach.jpg',
        filename: 'beach.jpg',
        description: 'A sunny beach with palm trees',
        date_taken: '2024:06:15 10:30:00',
        date_created: '2024:06:15 10:30:00',
        date_modified: '2024:06:16 08:00:00',
    },
    {
        id: 2,
        filepath: '/photos/holiday/mountain.jpg',
        filename: 'mountain.jpg',
        description: 'Snow-capped mountains at sunrise',
        date_taken: '2023:12:01 07:45:00',
        date_created: '2023:12:01 07:45:00',
        date_modified: '2023:12:02 09:00:00',
    },
];

export const mockPhotoDetail = {
    id: 1,
    filepath: '/photos/holiday/beach.jpg',
    filename: 'beach.jpg',
    description: 'A sunny beach with palm trees',
    entities: [
        { id: 1, type: 'person', name: 'Alice', bounding_box: '{"x":100,"y":50,"w":80,"h":120}' },
        { id: 2, type: 'pet', name: 'Max', bounding_box: '{"x":200,"y":150,"w":60,"h":80}' },
    ],
    metadata: {
        Make: 'Canon',
        Model: 'EOS R5',
        'Exposure Time': '1/250',
        'F-stop': 'f/2.8',
        'ISO Speed': '100',
        Dimensions: '8192×5464',
    },
    gps_lat: 51.5074,
    gps_lon: -0.1278,
    ai_model: 'llava:13b',
};

export const mockFilterOptions = {
    names: [
        { name: 'Alice', type: 'person' },
        { name: 'Bob', type: 'person' },
        { name: 'Max', type: 'pet' },
    ],
    cameras: ['Canon EOS R5', 'iPhone 15 Pro'],
    date_min: '2020:01:01 00:00:00',
    date_max: '2024:12:31 23:59:59',
    total_photos: 150,
    photos_with_faces: 42,
    photos_unidentified: 8,
};

export const mockYears = [
    { year: '2024', count: 80 },
    { year: '2023', count: 50 },
    { year: '2022', count: 20 },
];

export const mockModels = {
    models: [
        { name: 'llava:13b', is_vision: true },
        { name: 'llava:7b', is_vision: true },
    ],
    active: 'llava:13b',
};

export const mockScanStatus = {
    state: 'idle' as const,
    total_gallery: 150,
    total_duplicates: 5,
    scan_total: 0,
    scan_processed: 0,
};

export const mockUnidentified = [
    { id: 10, type: 'person', name: 'Unknown Person 1', photo_id: 1, bounding_box: '{"x":100,"y":50,"w":80,"h":120}' },
];

export const mockDuplicates = [
    {
        hash: 'abc123',
        count: 2,
        original: { id: 1, filepath: '/photos/a.jpg', filename: 'a.jpg', file_size: 5000000 },
        copies: [{ id: 2, filepath: '/photos/copy_a.jpg', filename: 'copy_a.jpg', file_size: 5000000 }],
    },
];

// ── MSW Request Handlers ───────────────────────────────────────────────────

export const handlers = [
    // Gallery
    http.get(`${BASE}/api/search`, () => {
        return HttpResponse.json(mockPhotos);
    }),

    http.get(`${BASE}/api/gallery/filters`, () => {
        return HttpResponse.json(mockFilterOptions);
    }),

    http.get(`${BASE}/api/gallery/years`, () => {
        return HttpResponse.json(mockYears);
    }),

    http.get(`${BASE}/api/photo/:photoId/detail`, () => {
        return HttpResponse.json(mockPhotoDetail);
    }),

    http.get(`${BASE}/api/image/:photoId`, () => {
        // Return a tiny transparent 1x1 PNG
        const pixel = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
            0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
            0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62,
            0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ]);
        return new HttpResponse(pixel, {
            headers: { 'Content-Type': 'image/png' },
        });
    }),

    // Entities
    http.post(`${BASE}/api/entities/name`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.delete(`${BASE}/api/entities/:name`, () => {
        return HttpResponse.json({ success: true });
    }),

    // Identify
    http.get(`${BASE}/api/unidentified`, () => {
        return HttpResponse.json(mockUnidentified);
    }),

    http.get(`${BASE}/api/photo/:photoId/entities`, () => {
        return HttpResponse.json(mockPhotoDetail.entities);
    }),

    // Settings / Scan
    http.get(`${BASE}/api/models`, () => {
        return HttpResponse.json(mockModels);
    }),

    http.get(`${BASE}/api/version`, () => {
        return HttpResponse.json({ version: '1.0.0' });
    }),

    http.get(`${BASE}/api/scan/status`, () => {
        return HttpResponse.json(mockScanStatus);
    }),

    http.get(`${BASE}/api/scan/logs`, () => {
        return HttpResponse.json({ logs: [] });
    }),

    http.get(`${BASE}/api/scan/history`, () => {
        return HttpResponse.json({ history: [] });
    }),

    http.get(`${BASE}/api/database/backups`, () => {
        return HttpResponse.json({ backups: [] });
    }),

    http.post(`${BASE}/api/database/backup`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.get(`${BASE}/api/select-folder`, () => {
        return HttpResponse.json({ path: 'C:\\Photos' });
    }),

    http.post(`${BASE}/api/settings/model`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.post(`${BASE}/api/scan`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.post(`${BASE}/api/scan/control`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.post(`${BASE}/api/database/restore`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.post(`${BASE}/api/database/clean`, () => {
        return HttpResponse.json({ success: true });
    }),

    // ScanTest
    http.post(`${BASE}/api/scan/single`, () => {
        return HttpResponse.json({
            photo_id: 99,
            ai_model: 'llava:13b',
            description: 'A test image description',
            entities: [
                { type: 'person', name: 'TestPerson', bounding_box: '{"x":10,"y":10,"w":50,"h":50}' },
            ],
            faces: [],
        });
    }),

    http.post(`${BASE}/api/test/clear`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.post(`${BASE}/api/test/entities/name`, () => {
        return HttpResponse.json({ success: true });
    }),

    http.delete(`${BASE}/api/test/entities/:name`, () => {
        return HttpResponse.json({ success: true });
    }),

    // Duplicates
    http.get(`${BASE}/api/duplicates`, () => {
        return HttpResponse.json(mockDuplicates);
    }),
];
