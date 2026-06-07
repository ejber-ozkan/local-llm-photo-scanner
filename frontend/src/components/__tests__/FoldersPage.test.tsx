import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FoldersPage from '../FoldersPage';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

afterEach(() => {
    localStorage.removeItem('activeModel');
});

function renderFoldersPage(initialEntry = '/folders') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/folders/:year?/:month?/:day?" element={<FoldersPage />} />
                <Route path="/" element={<div>Gallery Destination</div>} />
                <Route path="/identify" element={<div>Identify Destination</div>} />
            </Routes>
        </MemoryRouter>
    );
}

function localMedia(overrides: Partial<any> = {}) {
    return {
        id: 1,
        filepath: 'C:\\Photos\\sample.jpg',
        filename: 'sample.jpg',
        parent_path: 'C:\\Photos',
        file_size: 1024,
        file_hash: 'hash-sample',
        media_type: 'image',
        duplicate_count: 0,
        date_taken: '2024:05:24 10:00:00',
        date_modified: '2024:05:25 10:00:00',
        date_created: '2024:05:23 10:00:00',
        date_fallback: 'taken',
        scanned_at: '2024-05-25T10:00:00',
        ...overrides,
    };
}

function duplicateReport(overrides: Partial<any> = {}) {
    return {
        match_type: 'exact_hash',
        available_match_types: ['exact_hash'],
        future_match_types: ['possible_visual', 'possible_metadata'],
        summary: {
            group_count: 1,
            file_count: 2,
            total_bytes: 2048,
            wasted_bytes: 1024,
        },
        pagination: {
            page: 1,
            page_size: 10,
            total_groups: 2,
            total_pages: 2,
            has_next: true,
            has_previous: false,
        },
        groups: [
            {
                match_type: 'exact_hash',
                file_hash: 'hash-page-1',
                count: 2,
                total_bytes: 2048,
                wasted_bytes: 1024,
                files: [
                    localMedia({ id: 11, filename: 'page-one-a.jpg', filepath: 'C:\\Dupes\\page-one-a.jpg' }),
                    localMedia({ id: 12, filename: 'page-one-b.jpg', filepath: 'C:\\Dupes\\page-one-b.jpg' }),
                ],
            },
        ],
        ...overrides,
    };
}

describe('FoldersPage timeline', () => {
    it('filters scanned local media by partial filename match', async () => {
        let observedQuery = '';
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([{ label: 'Year2024', value: 2024, count: 2 }])),
            http.get(`${BASE}/api/folder-scan/search`, ({ request }) => {
                observedQuery = new URL(request.url).searchParams.get('filename') || '';
                return HttpResponse.json([
                    {
                        id: 1,
                        filepath: 'C:\\Photos\\beach-sunset.jpg',
                        filename: 'beach-sunset.jpg',
                        parent_path: 'C:\\Photos',
                        file_size: 100,
                        file_hash: 'hash-beach',
                        media_type: 'image',
                        duplicate_count: 0,
                        date_taken: '2024:05:24 10:00:00',
                    },
                ]);
            }),
        );

        renderFoldersPage();

        await userEvent.type(await screen.findByLabelText(/filename/i), 'beach');

        await waitFor(() => {
            expect(observedQuery).toBe('beach');
        });
        expect(await screen.findByText('beach-sunset.jpg')).toBeInTheDocument();
        expect(screen.getByText(/Filename Matches \(1\)/i)).toBeInTheDocument();
        expect(screen.queryByText('Year2024')).not.toBeInTheDocument();
    });

    it('offers invalid media stubs as a separate timeline category', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const mediaTypes = new URL(request.url).searchParams.get('media_types');
                return HttpResponse.json(
                    mediaTypes === 'invalid_media_stub'
                        ? [{ label: '2022', value: 2022, count: 3 }]
                        : [{ label: '2023', value: 2023, count: 427 }],
                );
            }),
        );

        renderFoldersPage();

        expect(await screen.findByText('427 files')).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText(/media type/i), 'invalid_media_stub');

        expect(await screen.findByText('3 files')).toBeInTheDocument();
    });

    it('shows a clickable badge only for files with duplicate locations', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 2 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 2 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 2 }]);
                return HttpResponse.json([
                    {
                        id: 1,
                        filepath: 'C:\\Photos\\duplicate.jpg',
                        filename: 'duplicate.jpg',
                        parent_path: 'C:\\Photos',
                        file_size: 100,
                        file_hash: 'hash-a',
                        media_type: 'image',
                        duplicate_count: 2,
                        date_taken: '2024:05:24 10:00:00',
                    },
                    {
                        id: 2,
                        filepath: 'C:\\Photos\\unique.jpg',
                        filename: 'unique.jpg',
                        parent_path: 'C:\\Photos',
                        file_size: 100,
                        file_hash: 'hash-b',
                        media_type: 'image',
                        duplicate_count: 0,
                        date_taken: '2024:05:24 10:00:00',
                    },
                ]);
            }),
            http.get(`${BASE}/api/folder-scan/duplicates/1`, () => HttpResponse.json({
                local_duplicates: [{ id: 3, filepath: 'C:\\Elsewhere\\duplicate.jpg', filename: 'duplicate.jpg', file_size: 100 }],
                gallery_duplicates: [],
            })),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));

        const badge = await screen.findByRole('button', { name: /2 duplicate locations/i });
        expect(screen.queryByTitle('Compare Duplicates')).not.toBeInTheDocument();
        await userEvent.click(badge);
        expect(await screen.findByText(/copies in scanned folders/i)).toBeInTheDocument();
    });

    it('queues an opened folder image for full AI without leaving the current view', async () => {
        localStorage.setItem('activeModel', 'llava:13b');
        let queuedPayload: any = null;
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/scan/logs`, () => HttpResponse.json({
                logs: [
                    { time: '10:00:03 AM', message: 'Background processor finished queue.' },
                    { time: '10:00:02 AM', message: 'Running DeepFace on: C:\\Photos\\ai-target.jpg' },
                    { time: '10:00:01 AM', message: 'Generating CLIP embedding for: C:\\Photos\\ai-target.jpg' },
                ],
            })),
            http.get(`${BASE}/api/scan/status`, () => HttpResponse.json({
                state: 'idle',
                total_gallery: 1,
                total_duplicates: 0,
                scan_total: 0,
                scan_processed: 0,
            })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([{
                    id: 1,
                    filepath: 'C:\\Photos\\ai-target.jpg',
                    filename: 'ai-target.jpg',
                    parent_path: 'C:\\Photos',
                    file_size: 100,
                    file_hash: 'hash-ai',
                    media_type: 'image',
                    duplicate_count: 0,
                    date_taken: '2024:05:24 10:00:00',
                }]);
            }),
            http.post(`${BASE}/api/scan/file`, async ({ request }) => {
                queuedPayload = await request.json();
                return HttpResponse.json({ message: 'queued', photo_id: 99, status: 'pending' });
            }),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));
        await userEvent.click(await screen.findByText('ai-target.jpg'));
        await userEvent.click(await screen.findByRole('button', { name: /full ai/i }));

        await waitFor(() => {
            expect(queuedPayload).toEqual({
                filepath: 'C:\\Photos\\ai-target.jpg',
                use_ollama: true,
                use_clip: true,
                active_model: 'llava:13b',
            });
        });
        expect(await screen.findByText(/Generating CLIP embedding for:/)).toBeInTheDocument();
        expect(await screen.findByText(/Running DeepFace on:/)).toBeInTheDocument();
        expect(await screen.findByText('AI scan complete.')).toBeInTheDocument();
        expect(screen.getByText('File Information')).toBeInTheDocument();
        expect(screen.queryByText('Identify Destination')).not.toBeInTheDocument();
    });

    it('bulk queues the selected timeline year for CLIP AI with screenshot filtering enabled', async () => {
        let bulkPayload: unknown = null;
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 3 }]);
                return HttpResponse.json([{ label: 'Month5', value: 5, count: 3 }]);
            }),
            http.post(`${BASE}/api/scan/local-date-scope`, async ({ request }) => {
                bulkPayload = await request.json();
                return HttpResponse.json({ message: 'Queued 3 images for AI processing.', queued_count: 3, skipped_count: 0 });
            }),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByRole('button', { name: /send visible timeline items to clip ai/i }));

        await waitFor(() => {
            expect(bulkPayload).toEqual({
                year: 2024,
                month: null,
                day: null,
                use_ollama: false,
                use_clip: true,
                ignore_screenshots: true,
                media_types: 'all',
                from_date: '',
                to_date: '',
            });
        });
        expect(await screen.findByText('Queued 3 images for AI processing.')).toBeInTheDocument();
    });

    it('adds date filters to timeline requests and clears back to the unfiltered timeline', async () => {
        const observedQueries: string[] = [];
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                observedQueries.push(new URL(request.url).search);
                return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
            }),
        );

        const { container } = renderFoldersPage();

        expect(await screen.findByText('Year2024')).toBeInTheDocument();
        const [fromInput, toInput] = Array.from(container.querySelectorAll('input[type="date"]'));
        await userEvent.type(fromInput, '2024-05-01');
        await userEvent.type(toInput, '2024-05-31');

        await waitFor(() => {
            expect(observedQueries.some(query => query.includes('from_date=2024-05-01') && query.includes('to_date=2024-05-31'))).toBe(true);
        });

        await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

        await waitFor(() => {
            expect(fromInput).toHaveValue('');
            expect(toInput).toHaveValue('');
            expect(observedQueries.at(-1)).not.toContain('from_date=');
        });
    });

    it('renders image thumbnails and timeline notches for dated files', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([localMedia({ filename: 'thumbnail-target.jpg' })]);
            }),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));
        expect(await screen.findByText('thumbnail-target.jpg')).toBeInTheDocument();

        await userEvent.click(screen.getByLabelText(/view image thumbnails/i));

        expect(await screen.findByAltText('thumbnail-target.jpg')).toHaveAttribute(
            'src',
            expect.stringContaining('/api/folder-scan/media-preview?path='),
        );
        expect(screen.getByRole('button', { name: /May 2024/i })).toBeInTheDocument();
    });

    it('shows filename empty state and returns to the timeline when the filename filter is cleared', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([{ label: 'Year2025', value: 2025, count: 4 }])),
            http.get(`${BASE}/api/folder-scan/search`, () => HttpResponse.json([])),
        );

        renderFoldersPage();

        await userEvent.type(await screen.findByLabelText(/filename/i), 'missing');
        expect(await screen.findByText(/No filenames match "missing"/i)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

        expect(screen.getByLabelText(/filename/i)).toHaveValue('');
        expect(await screen.findByText('Year2025')).toBeInTheDocument();
        expect(screen.queryByText(/No filenames match/i)).not.toBeInTheDocument();
    });
});

describe('FoldersPage duplicate report', () => {
    it('opens an exact hash duplicate report table from the folders page', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/folder-scan/duplicates/report`, () => HttpResponse.json({
                match_type: 'exact_hash',
                available_match_types: ['exact_hash'],
                future_match_types: ['possible_visual', 'possible_metadata'],
                summary: {
                    group_count: 1,
                    file_count: 2,
                    total_bytes: 200,
                    wasted_bytes: 100,
                },
                pagination: {
                    page: 1,
                    page_size: 10,
                    total_groups: 1,
                    total_pages: 1,
                    has_next: false,
                    has_previous: false,
                },
                groups: [
                    {
                        match_type: 'exact_hash',
                        file_hash: 'hash-a',
                        count: 2,
                        total_bytes: 200,
                        wasted_bytes: 100,
                        files: [
                            {
                                id: 1,
                                filepath: 'C:\\Photos\\dup-a-1.jpg',
                                filename: 'dup-a-1.jpg',
                                parent_path: 'C:\\Photos',
                                file_size: 100,
                                file_hash: 'hash-a',
                                media_type: 'image',
                                year: 2024,
                                month: 5,
                                day: 24,
                            },
                            {
                                id: 2,
                                filepath: 'C:\\Photos\\dup-a-2.jpg',
                                filename: 'dup-a-2.jpg',
                                parent_path: 'C:\\Photos',
                                file_size: 100,
                                file_hash: 'hash-a',
                                media_type: 'image',
                                year: 2024,
                                month: 5,
                                day: 24,
                            },
                        ],
                    },
                ],
            }))
        );

        renderFoldersPage();

        await userEvent.click(screen.getByRole('button', { name: /duplicate report/i }));

        await waitFor(() => {
            expect(screen.getByText('Exact Hash Duplicate Report')).toBeInTheDocument();
        });
        expect(screen.getByText('1 group')).toBeInTheDocument();
        expect(screen.getByText('2 files')).toBeInTheDocument();
        expect(screen.getByLabelText(/per page/i)).toHaveValue('10');
        expect(screen.getByText('dup-a-1.jpg')).toBeInTheDocument();
        expect(screen.getByText('dup-a-2.jpg')).toBeInTheDocument();
    });

    it('opens invalid media stubs as a separate report category', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/folder-scan/duplicates/report`, ({ request }) => {
                const category = new URL(request.url).searchParams.get('category');
                if (category !== 'invalid_media_stub') {
                    return HttpResponse.json({
                        match_type: 'exact_hash',
                        summary: { group_count: 0, file_count: 0, total_bytes: 0, wasted_bytes: 0 },
                        pagination: { page: 1, page_size: 10, total_groups: 0, total_pages: 1, has_next: false, has_previous: false },
                        groups: [],
                    });
                }
                return HttpResponse.json({
                    match_type: 'invalid_media_stub',
                    summary: { group_count: 1, file_count: 1, total_bytes: 36, wasted_bytes: 0 },
                    pagination: { page: 1, page_size: 10, total_groups: 1, total_pages: 1, has_next: false, has_previous: false },
                    groups: [{
                        match_type: 'invalid_media_stub',
                        file_hash: 'stub-hash',
                        count: 1,
                        total_bytes: 36,
                        wasted_bytes: 0,
                        files: [{
                            id: 7,
                            filepath: 'C:\\Videos\\stub.mp4',
                            filename: 'stub.mp4',
                            parent_path: 'C:\\Videos',
                            file_size: 36,
                            file_hash: 'stub-hash',
                            media_type: 'video',
                            validation_status: 'invalid_media_stub',
                            validation_error: 'No decodable video stream found.',
                        }],
                    }],
                });
            }),
        );

        renderFoldersPage();

        await userEvent.click(screen.getByRole('button', { name: /duplicate report/i }));
        await userEvent.click(screen.getByRole('button', { name: /invalid media stubs/i }));

        expect(await screen.findByText('stub.mp4')).toBeInTheDocument();
        expect(screen.getByText('No decodable video stream found.')).toBeInTheDocument();
        expect(screen.getByText('Invalid Media Stubs')).toBeInTheDocument();
    });

    it('paginates duplicate reports, changes page size, and exports matching CSV filters', async () => {
        const observedPages: string[] = [];
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/folder-scan/duplicates/report`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                observedPages.push(`${params.get('page')}:${params.get('page_size')}`);
                if (params.get('page') === '2') {
                    return HttpResponse.json(duplicateReport({
                        pagination: { page: 2, page_size: 10, total_groups: 2, total_pages: 2, has_next: false, has_previous: true },
                        groups: [{
                            match_type: 'exact_hash',
                            file_hash: 'hash-page-2',
                            count: 2,
                            total_bytes: 2048,
                            wasted_bytes: 1024,
                            files: [localMedia({ id: 21, filename: 'page-two.jpg', filepath: 'C:\\Dupes\\page-two.jpg' })],
                        }],
                    }));
                }
                return HttpResponse.json(duplicateReport());
            }),
        );

        renderFoldersPage();

        await userEvent.click(screen.getByRole('button', { name: /duplicate report/i }));
        expect(await screen.findByText('page-one-a.jpg')).toBeInTheDocument();

        expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
            'href',
            expect.stringContaining('/api/folder-scan/duplicates/report.csv?category=exact_hash'),
        );

        await userEvent.click(screen.getByTitle('Next page'));
        expect(await screen.findByText('page-two.jpg')).toBeInTheDocument();
        expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();

        await userEvent.selectOptions(screen.getByLabelText(/per page/i), '20');

        await waitFor(() => {
            expect(observedPages).toContain('1:20');
        });
    });

    it('shows the empty exact duplicate report state', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/folder-scan/duplicates/report`, () => HttpResponse.json(duplicateReport({
                summary: { group_count: 0, file_count: 0, total_bytes: 0, wasted_bytes: 0 },
                pagination: { page: 1, page_size: 10, total_groups: 0, total_pages: 1, has_next: false, has_previous: false },
                groups: [],
            }))),
        );

        renderFoldersPage();

        await userEvent.click(screen.getByRole('button', { name: /duplicate report/i }));

        expect(await screen.findByText('No exact duplicate hashes found.')).toBeInTheDocument();
        expect(screen.getByText('Only validated media with matching file hashes is included.')).toBeInTheDocument();
    });
});

describe('FoldersPage file explorer', () => {
    it('loads DB-backed roots, opens indexed child folders, and navigates breadcrumbs', async () => {
        const requestedPaths: string[] = [];
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/folder-scan/explorer`, ({ request }) => {
                const path = new URL(request.url).searchParams.get('path') || '';
                requestedPaths.push(path);
                if (path === 'C:\\Photos') {
                    return HttpResponse.json({
                        current_path: 'C:\\Photos',
                        parent_path: null,
                        directories: ['C:\\Photos\\Trips'],
                        files: [localMedia({ id: 31, filename: 'root-image.jpg', filepath: 'C:\\Photos\\root-image.jpg' })],
                    });
                }
                if (path === 'C:\\Photos\\Trips') {
                    return HttpResponse.json({
                        current_path: 'C:\\Photos\\Trips',
                        parent_path: 'C:\\Photos',
                        directories: [],
                        files: [localMedia({ id: 32, filename: 'trip-image.jpg', filepath: 'C:\\Photos\\Trips\\trip-image.jpg' })],
                    });
                }
                return HttpResponse.json({
                    current_path: '',
                    parent_path: null,
                    directories: ['C:\\Photos'],
                    files: [],
                });
            }),
        );

        renderFoldersPage();

        await userEvent.click(screen.getByRole('button', { name: /file explorer/i }));
        await userEvent.click(await screen.findByText('Photos'));
        expect(await screen.findByText('root-image.jpg')).toBeInTheDocument();

        await userEvent.click(screen.getByText('Trips'));
        expect(await screen.findByText('trip-image.jpg')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Photos' }));
        expect(await screen.findByText('root-image.jpg')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /roots/i }));

        await waitFor(() => {
            expect(requestedPaths).toContain('');
            expect(requestedPaths).toContain('C:\\Photos');
            expect(requestedPaths).toContain('C:\\Photos\\Trips');
        });
    });

    it('shows the indexed-folder empty state when a scanned folder has no children', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/folder-scan/explorer`, () => HttpResponse.json({
                current_path: '',
                parent_path: null,
                directories: [],
                files: [],
            })),
        );

        renderFoldersPage();

        await userEvent.click(screen.getByRole('button', { name: /file explorer/i }));

        expect(await screen.findByText('Empty directory or no folder scanned yet.')).toBeInTheDocument();
        expect(screen.getByText(/register and index folders/i)).toBeInTheDocument();
    });

    it('opens a search result parent folder without keeping the filename search active', async () => {
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, () => HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }])),
            http.get(`${BASE}/api/folder-scan/search`, () => HttpResponse.json([
                localMedia({ id: 41, filename: 'parent-match.jpg', filepath: 'C:\\Photos\\Trips\\parent-match.jpg', parent_path: 'C:\\Photos\\Trips' }),
            ])),
            http.get(`${BASE}/api/folder-scan/explorer`, ({ request }) => {
                const path = new URL(request.url).searchParams.get('path');
                return HttpResponse.json({
                    current_path: path,
                    parent_path: 'C:\\Photos',
                    directories: [],
                    files: [localMedia({ id: 42, filename: 'inside-parent.jpg', filepath: 'C:\\Photos\\Trips\\inside-parent.jpg' })],
                });
            }),
        );

        renderFoldersPage();

        await userEvent.type(await screen.findByLabelText(/filename/i), 'parent');
        await userEvent.click(await screen.findByText('Trips'));

        expect(await screen.findByText('inside-parent.jpg')).toBeInTheDocument();
        expect(screen.getByLabelText(/filename/i)).toHaveValue('');
        expect(screen.queryByText(/Filename Matches/i)).not.toBeInTheDocument();
    });
});

describe('FoldersPage file details', () => {
    it('opens image details, toggles full-size preview, and reveals the file location', async () => {
        let revealedPath = '';
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/system/open-location`, ({ request }) => {
                revealedPath = new URL(request.url).searchParams.get('path') || '';
                return HttpResponse.json({ success: true });
            }),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([localMedia({
                    filename: 'detail-image.jpg',
                    filepath: 'C:\\Photos\\detail-image.jpg',
                    width: 4000,
                    height: 3000,
                    camera_make: 'Canon',
                    camera_model: 'EOS R5',
                    gps_lat: 51.5074,
                    gps_lon: -0.1278,
                })]);
            }),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));
        await userEvent.click(await screen.findByText('detail-image.jpg'));

        expect(await screen.findByText('File Information')).toBeInTheDocument();
        expect(screen.getByText('4000 × 3000')).toBeInTheDocument();
        expect(screen.getByText('51.5074, -0.1278')).toBeInTheDocument();

        await userEvent.click(screen.getByTitle('View full size'));
        expect(screen.getAllByAltText('detail-image.jpg')).toHaveLength(2);

        await userEvent.click(screen.getByRole('button', { name: /open file location/i }));

        await waitFor(() => {
            expect(revealedPath).toBe('C:\\Photos\\detail-image.jpg');
        });
        expect(await screen.findByText('Opened file location.')).toBeInTheDocument();
    });

    it('falls back to the system player for legacy video when FFmpeg is unavailable', async () => {
        let openedPath = '';
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: false })),
            http.get(`${BASE}/api/system/open-file`, ({ request }) => {
                openedPath = new URL(request.url).searchParams.get('path') || '';
                return HttpResponse.json({ success: true });
            }),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([localMedia({
                    filename: 'legacy-video.avi',
                    filepath: 'C:\\Videos\\legacy-video.avi',
                    media_type: 'video',
                    codec: 'mpeg4',
                    duration: 125,
                    frame_rate: 29.97,
                    bit_rate: 2500000,
                })]);
            }),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));
        await userEvent.click(await screen.findByText('legacy-video.avi'));

        expect(await screen.findByText('FFmpeg Not Available')).toBeInTheDocument();
        expect(screen.getByText('2:05 (125s)')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /open in system player/i }));

        await waitFor(() => {
            expect(openedPath).toBe('C:\\Videos\\legacy-video.avi');
        });
    });

    it('shows CLIP AI queue failures in the progress panel', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([localMedia({ filename: 'clip-error.jpg', filepath: 'C:\\Photos\\clip-error.jpg' })]);
            }),
            http.post(`${BASE}/api/scan/file`, () => HttpResponse.json({ detail: 'Queue offline.' }, { status: 503 })),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));
        await userEvent.click(await screen.findByText('clip-error.jpg'));
        await userEvent.click(await screen.findByRole('button', { name: /clip ai/i }));

        expect(await screen.findByText('Queue offline.')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /dismiss ai progress/i }));
        expect(screen.queryByText('Queue offline.')).not.toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('covers all actions in the duplicate locations modal including playing local/gallery copies and closing', async () => {
        let openedPath = '';
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/system/open-file`, ({ request }) => {
                openedPath = new URL(request.url).searchParams.get('path') || '';
                return HttpResponse.json({ success: true });
            }),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([localMedia({ id: 1, filename: 'dupe-modal.jpg', duplicate_count: 2 })]);
            }),
            http.get(`${BASE}/api/folder-scan/duplicates/1`, () => HttpResponse.json({
                local_duplicates: [
                    { id: 10, filepath: 'C:\\Local\\dupe-modal.jpg', filename: 'dupe-modal.jpg', scanned_at: '2024-05-25' }
                ],
                gallery_duplicates: [
                    { id: 20, filepath: 'D:\\Gallery\\dupe-modal.jpg', filename: 'dupe-modal.jpg', scanned_at: '2024-05-26' }
                ],
            })),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));

        const badge = await screen.findByRole('button', { name: /2 duplicate locations/i });
        await userEvent.click(badge);

        // Verify duplicates are rendered
        expect(await screen.findByText('Copies In Scanned Folders (1)')).toBeInTheDocument();
        expect(await screen.findByText('Copies In Main Gallery (1)')).toBeInTheDocument();

        // Click Play on local copy
        const playButtons = screen.getAllByRole('button', { name: /play/i });
        expect(playButtons).toHaveLength(2);
        await userEvent.click(playButtons[0]);
        await waitFor(() => {
            expect(openedPath).toBe('C:\\Local\\dupe-modal.jpg');
        });

        // Click Play on gallery copy
        openedPath = '';
        await userEvent.click(playButtons[1]);
        await waitFor(() => {
            expect(openedPath).toBe('D:\\Gallery\\dupe-modal.jpg');
        });

        // Close via Close View button
        await userEvent.click(screen.getByRole('button', { name: /close view/i }));
        expect(screen.queryByText('Copies In Scanned Folders (1)')).not.toBeInTheDocument();

        // Re-open and close via top X button
        await userEvent.click(await screen.findByRole('button', { name: /2 duplicate locations/i }));
        expect(await screen.findByText('Copies In Scanned Folders (1)')).toBeInTheDocument();

        const buttons = screen.getAllByRole('button');
        const xBtn = buttons.find(b => b.querySelector('svg') && !b.textContent);
        expect(xBtn).toBeDefined();
        await userEvent.click(xBtn!);
        expect(screen.queryByText('Copies In Scanned Folders (1)')).not.toBeInTheDocument();
    });

    it('shows toast errors when system explorer or player calls fail', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/system/check-ffmpeg`, () => HttpResponse.json({ available: true })),
            http.get(`${BASE}/api/system/open-location`, () => HttpResponse.error()),
            http.get(`${BASE}/api/system/open-file`, () => HttpResponse.error()),
            http.get(`${BASE}/api/folder-scan/duplicates/1`, () => HttpResponse.error()),
            http.get(`${BASE}/api/folder-scan/dates`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (!params.get('year')) return HttpResponse.json([{ label: 'Year2024', value: 2024, count: 1 }]);
                if (!params.get('month')) return HttpResponse.json([{ label: 'Month5', value: 5, count: 1 }]);
                if (!params.get('day')) return HttpResponse.json([{ label: 'Day24', value: 24, count: 1 }]);
                return HttpResponse.json([localMedia({ id: 1, filename: 'action-fail.jpg', duplicate_count: 2 })]);
            }),
        );

        renderFoldersPage();

        await userEvent.click(await screen.findByText('Year2024'));
        await userEvent.click(await screen.findByText('Month5'));
        await userEvent.click(await screen.findByText('Day24'));
        await userEvent.click(await screen.findByText('action-fail.jpg'));

        await userEvent.click(screen.getByRole('button', { name: /open file location/i }));
        expect(await screen.findByText('Failed to open file location.')).toBeInTheDocument();

        const badge = await screen.findByRole('button', { name: /2 duplicate locations/i });
        await userEvent.click(badge);
        expect(await screen.findByText('Failed to check for duplicate locations.')).toBeInTheDocument();

        consoleError.mockRestore();
    });
});
