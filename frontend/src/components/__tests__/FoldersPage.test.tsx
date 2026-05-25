import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FoldersPage from '../FoldersPage';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

function renderFoldersPage(initialEntry = '/folders') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/folders/:year?/:month?/:day?" element={<FoldersPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('FoldersPage timeline', () => {
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
});
