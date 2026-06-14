import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import ScanPage from '../ScanPage';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

function renderScan() {
    return render(<ScanPage />);
}

describe('ScanPage', () => {
    beforeEach(() => {
        localStorage.removeItem('activeModel');
    });

    it('renders one merged local scan panel with AI and non-AI modes', () => {
        renderScan();
        expect(screen.getByRole('heading', { name: 'Scan' })).toBeInTheDocument();
        expect(screen.getByText('Local Scan')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ai gallery/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /non-ai folder/i })).toBeInTheDocument();
        expect(screen.getByText('Live Scan Logs')).toBeInTheDocument();
    });

    it('starts a background AI scan with selected options', async () => {
        const user = userEvent.setup();
        localStorage.setItem('activeModel', 'llava:7b');
        let scanPayload: unknown = null;
        server.use(
            http.post(`${BASE}/api/scan`, async ({ request }) => {
                scanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderScan();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path...'), 'C:\\Photos');
        await user.click(screen.getByLabelText(/Generate Ollama Text Descriptions/i));
        await user.click(screen.getByLabelText(/Ignore Screenshots/i));
        await user.click(screen.getByRole('button', { name: /start background scan/i }));

        await waitFor(() => {
            expect(scanPayload).toEqual({
                directory_path: 'C:\\Photos',
                force_rescan: false,
                ignore_screenshots: true,
                use_ollama: false,
                use_clip: true,
                active_model: 'llava:7b',
            });
        });
    });

    it('starts a non-AI folder scan with metadata extraction disabled', async () => {
        const user = userEvent.setup();
        let folderScanPayload: unknown = null;
        server.use(
            http.post(`${BASE}/api/folder-scan`, async ({ request }) => {
                folderScanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderScan();
        await user.click(screen.getByRole('button', { name: /non-ai folder/i }));
        await user.type(await screen.findByPlaceholderText('Type or paste folder path to scan...'), 'D:\\Media');
        await user.click(screen.getByLabelText(/Extract Rich Media Metadata/i));
        await user.click(screen.getByRole('button', { name: /start non-ai scan/i }));

        await waitFor(() => {
            expect(folderScanPayload).toEqual({
                directory_path: 'D:\\Media',
                force_rescan: false,
                extract_metadata: false,
            });
        });
    });

    it('uses recent scan history entries for the selected scan mode', async () => {
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/scan/history`, () => HttpResponse.json({
                history: [{ directory_path: 'C:\\History\\AI', last_scanned: '2026-06-01T10:00:00' }],
            })),
            http.get(`${BASE}/api/folder-scan/history`, () => HttpResponse.json({
                history: [{ directory_path: 'D:\\History\\Local', last_scanned: '2026-06-02T10:00:00' }],
            })),
        );

        renderScan();
        await user.click(await screen.findByRole('button', { name: /recently scanned folders/i }));
        await user.click(screen.getByRole('button', { name: /C:\\History\\AI/i }));
        expect(screen.getByPlaceholderText('Type or paste folder path...')).toHaveValue('C:\\History\\AI');

        await user.click(screen.getByRole('button', { name: /non-ai folder/i }));
        await user.click(await screen.findByRole('button', { name: /recently scanned folders/i }));
        await user.click(screen.getByRole('button', { name: /D:\\History\\Local/i }));
        expect(screen.getByPlaceholderText('Type or paste folder path to scan...')).toHaveValue('D:\\History\\Local');
    });

    it('prompts before force rescanning a previously scanned AI folder', async () => {
        const user = userEvent.setup();
        let scanPayload: unknown = null;
        server.use(
            http.get(`${BASE}/api/scan/history`, () => HttpResponse.json({
                history: [{ directory_path: 'C:\\Photos', last_scanned: '2026-06-01T10:00:00' }],
            })),
            http.post(`${BASE}/api/scan`, async ({ request }) => {
                scanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderScan();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path...'), 'C:\\Photos');
        await user.click(screen.getByRole('button', { name: /start background scan/i }));
        await user.click(await screen.findByRole('button', { name: /force rescan/i }));

        await waitFor(() => {
            expect(scanPayload).toMatchObject({ directory_path: 'C:\\Photos', force_rescan: true });
        });
    });

    it('shows api error when AI scan start fails', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(`${BASE}/api/scan`, () => HttpResponse.json({ detail: 'Scan start error detail' }, { status: 500 })),
        );

        renderScan();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path...'), 'C:\\Photos');
        await user.click(screen.getByRole('button', { name: /start background scan/i }));

        expect(await screen.findByText('Scan start error detail')).toBeInTheDocument();
    });

    it('shows api error when non-AI folder scan fails', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(`${BASE}/api/folder-scan`, () => HttpResponse.json({ detail: 'Folder scan error detail' }, { status: 500 })),
        );

        renderScan();
        await user.click(screen.getByRole('button', { name: /non-ai folder/i }));
        await user.type(await screen.findByPlaceholderText('Type or paste folder path to scan...'), 'D:\\Media');
        await user.click(screen.getByRole('button', { name: /start non-ai scan/i }));

        expect(await screen.findByText('Folder scan error detail')).toBeInTheDocument();
    });

    it('shows api error when scan control actions fail', async () => {
        vi.useFakeTimers();
        localStorage.setItem('activeModel', 'llava:7b');
        let controlPayload: unknown = null;
        server.use(
            http.get(`${BASE}/api/scan/status`, () => HttpResponse.json({
                state: 'running',
                total_gallery: 5,
                total_duplicates: 1,
                scan_total: 10,
                scan_processed: 2,
            })),
            http.post(`${BASE}/api/scan/control`, async ({ request }) => {
                controlPayload = await request.json();
                return HttpResponse.json({ detail: 'Control failed' }, { status: 500 });
            }),
        );

        renderScan();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        vi.useRealTimers();

        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /pause/i }));

        await waitFor(() => {
            expect(controlPayload).toEqual({ action: 'pause', active_model: 'llava:7b' });
        });
        expect(await screen.findByText('Control failed')).toBeInTheDocument();
    });

    it('shows api error when folder scan control actions fail', async () => {
        vi.useFakeTimers();
        server.use(
            http.get(`${BASE}/api/folder-scan/status`, () => HttpResponse.json({
                state: 'running',
                scan_total: 10,
                scan_processed: 2,
            })),
            http.post(`${BASE}/api/folder-scan/control`, () => HttpResponse.json({ detail: 'Control failed' }, { status: 500 })),
        );

        renderScan();
        fireEvent.click(screen.getByRole('button', { name: /non-ai folder/i }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        vi.useRealTimers();

        const realUser = userEvent.setup();
        await realUser.click(await screen.findByRole('button', { name: /pause/i }));
        expect(await screen.findByText('Control failed')).toBeInTheDocument();
    });
});
