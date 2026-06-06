import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import DuplicatesPage from '../DuplicatesPage';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

function renderDuplicates() {
    return render(
        <BrowserRouter>
            <DuplicatesPage />
        </BrowserRouter>
    );
}

async function expandDuplicateScanGroup() {
    const user = userEvent.setup();
    const scanHistory = await screen.findByText('Scan History');
    await user.click(scanHistory.closest('button')!);
}

function duplicateGroup(overrides: Partial<any> = {}) {
    return {
        hash: 'abc123',
        count: 2,
        original: {
            id: 1,
            filepath: '/photos/original/a.jpg',
            filename: 'a.jpg',
            file_size: 5_000_000,
            scanned_at: '2024-06-15T10:30:00Z',
        },
        copies: [
            {
                id: 2,
                filepath: '/photos/copies/copy_a.jpg',
                filename: 'copy_a.jpg',
                file_size: 5_000_000,
            },
        ],
        ...overrides,
    };
}

describe('DuplicatesPage', () => {
    // ── Initial Render ─────────────────────────────────────────────────

    it('renders the page title', async () => {
        renderDuplicates();
        await waitFor(() => {
            expect(screen.getByText('Review Skipped & Duplicate Media')).toBeInTheDocument();
        });
    });

    it('loads and displays duplicate groups from the API', async () => {
        renderDuplicates();
        await expandDuplicateScanGroup();
        await waitFor(() => {
            // Should show the original file from our mock
            expect(screen.getByAltText('a.jpg')).toBeInTheDocument();
        });
    });

    it('shows the copy count badge', async () => {
        renderDuplicates();
        await expandDuplicateScanGroup();
        await waitFor(() => {
            // Our mock has count: 2, rendered as "2 Copies" badge.
            expect(screen.getByText('2 Copies')).toBeInTheDocument();
        });
    });

    it('shows "View all copies" button', async () => {
        renderDuplicates();
        await expandDuplicateScanGroup();
        await waitFor(() => {
            expect(screen.getByText('View all copies')).toBeInTheDocument();
        });
    });

    it('shows the clean-library empty state when duplicates and skipped media are empty', async () => {
        server.use(
            http.get(`${BASE}/api/duplicates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/skipped`, () => HttpResponse.json([])),
        );

        renderDuplicates();

        expect(await screen.findByText('No Duplicates or Skipped Media Found')).toBeInTheDocument();
        expect(screen.getByText('Your library is perfectly clean and identical!')).toBeInTheDocument();
    });

    it('falls back to empty state when duplicate loading fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/duplicates`, () => HttpResponse.json({ detail: 'offline' }, { status: 500 })),
            http.get(`${BASE}/api/skipped`, () => HttpResponse.json([])),
        );

        renderDuplicates();

        expect(await screen.findByText('No Duplicates or Skipped Media Found')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('expands a duplicate group to show original and hidden copy paths', async () => {
        server.use(
            http.get(`${BASE}/api/duplicates`, () => HttpResponse.json([
                duplicateGroup({
                    original: {
                        id: 11,
                        filepath: '/photos/original/original.jpg',
                        filename: 'original.jpg',
                        file_size: 1_048_576,
                        scanned_at: '2024-06-15T10:30:00Z',
                    },
                    copies: [
                        { id: 12, filepath: '/photos/copies/copy-one.jpg', filename: 'copy-one.jpg', file_size: 1_048_576 },
                        { id: 13, filepath: '/photos/copies/copy-two.jpg', filename: 'copy-two.jpg', file_size: 2_097_152 },
                    ],
                }),
            ])),
            http.get(`${BASE}/api/skipped`, () => HttpResponse.json([])),
        );

        const user = userEvent.setup();
        renderDuplicates();
        await expandDuplicateScanGroup();

        expect(await screen.findByAltText('original.jpg')).toBeInTheDocument();
        expect(screen.getByText('3 MB')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /view all copies/i }));

        expect(await screen.findByText('Original (Kept in Gallery):')).toBeInTheDocument();
        expect(screen.getByText('/photos/original/original.jpg')).toBeInTheDocument();
        expect(screen.getByText('/photos/copies/copy-one.jpg')).toBeInTheDocument();
        expect(screen.getByText('/photos/copies/copy-two.jpg')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /view all copies/i }));
        expect(screen.queryByText('/photos/copies/copy-one.jpg')).not.toBeInTheDocument();
    });

    it('renders skipped media groups with reasons and pluralized counts', async () => {
        server.use(
            http.get(`${BASE}/api/duplicates`, () => HttpResponse.json([])),
            http.get(`${BASE}/api/skipped`, () => HttpResponse.json([
                {
                    id: 21,
                    filename: 'broken-one.mp4',
                    reason: 'No decodable video stream found.',
                    scanned_at: '2024-06-15T10:30:00Z',
                },
                {
                    id: 22,
                    filename: 'broken-two.mov',
                    reason: 'File could not be read.',
                    scanned_at: '2024-06-15T10:30:00Z',
                },
            ])),
        );

        const user = userEvent.setup();
        renderDuplicates();

        const scanHistory = await screen.findByText('Scan History');
        expect(screen.getByText('2 Ignored Media Items')).toBeInTheDocument();
        await user.click(scanHistory.closest('button')!);

        expect(await screen.findByAltText('broken-one.mp4')).toBeInTheDocument();
        expect(screen.getAllByText('NOT IMPORTED')).toHaveLength(2);
        expect(screen.getByText('No decodable video stream found.')).toBeInTheDocument();
        expect(screen.getByText('File could not be read.')).toBeInTheDocument();
    });

    it('timeline marker expands a collapsed scan group', async () => {
        Element.prototype.scrollIntoView = vi.fn();
        server.use(
            http.get(`${BASE}/api/duplicates`, () => HttpResponse.json([
                duplicateGroup({
                    original: {
                        id: 31,
                        filepath: '/photos/original/timeline.jpg',
                        filename: 'timeline.jpg',
                        file_size: 500,
                        scanned_at: '2024-06-15T10:30:00Z',
                    },
                }),
            ])),
            http.get(`${BASE}/api/skipped`, () => HttpResponse.json([])),
        );

        const user = userEvent.setup();
        renderDuplicates();

        const marker = await screen.findByTitle(/duplicates-scan-/i);
        await user.click(marker);

        expect(await screen.findByAltText('timeline.jpg')).toBeInTheDocument();
        await waitFor(() => {
            expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        });
    });
});
