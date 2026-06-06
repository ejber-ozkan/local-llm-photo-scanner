import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { BrowserRouter } from 'react-router-dom';
import SettingsPage from '../SettingsPage';
import { MOCK_APP_VERSION } from '../../test/mocks/version';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

function renderSettings() {
    return render(
        <BrowserRouter>
            <SettingsPage />
        </BrowserRouter>
    );
}

describe('SettingsPage', () => {
    beforeEach(() => {
        localStorage.setItem('themeMode', 'dark');
        localStorage.setItem('themeColor', 'twilight');
        localStorage.removeItem('activeModel');
    });

    // ── Initial Render ─────────────────────────────────────────────────

    it('renders the page title', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText(/Settings & Agent Config/i)).toBeInTheDocument();
        });
    });

    it('loads and displays available models from the API', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByDisplayValue('llava:13b')).toBeInTheDocument();
        });
    });

    it('renders the scan directory input', async () => {
        renderSettings();
        await waitFor(() => {
            expect(
                screen.getByPlaceholderText('Type or paste folder path…', { exact: true })
            ).toBeInTheDocument();
        });
    });

    // ── Scan Controls ──────────────────────────────────────────────────

    it('renders the Start Background Scan button', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText(/Start Background Scan/i)).toBeInTheDocument();
        });
    });

    it('shows gallery stats section', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText('Total in Gallery')).toBeInTheDocument();
            expect(screen.getByText('Duplicates Avoided')).toBeInTheDocument();
        });
    });

    // ── Theme Toggle ───────────────────────────────────────────────────

    it('renders Appearance section', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText('Appearance')).toBeInTheDocument();
        });
    });

    // ── Version Display ────────────────────────────────────────────────

    it('displays the app version', async () => {
        renderSettings();
        const versionPattern = new RegExp(MOCK_APP_VERSION.replaceAll('.', '\\.'));
        await waitFor(() => {
            expect(screen.getByText(versionPattern)).toBeInTheDocument();
        });
    });

    // ── Database Management ────────────────────────────────────────────

    it('renders Database section', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText(/Database Integrity/i)).toBeInTheDocument();
        });
    });

    it('renders backup button', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText(/Create Backup Now/i)).toBeInTheDocument();
        });
    });

    // ── Danger Zone ────────────────────────────────────────────────────

    it('renders Danger Zone section', async () => {
        renderSettings();
        await waitFor(() => {
            expect(screen.getByText('Danger Zone')).toBeInTheDocument();
        });
    });

    // ── Phase 3 Workflow Coverage ─────────────────────────────────────

    it('posts model changes and persists the active model', async () => {
        const user = userEvent.setup();
        let selectedPayload: any = null;
        server.use(
            http.post(`${BASE}/api/settings/model`, async ({ request }) => {
                selectedPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        const modelSelect = await screen.findByDisplayValue('llava:13b');
        await user.selectOptions(modelSelect, 'llava:7b');

        await waitFor(() => {
            expect(selectedPayload).toEqual({ active_model: 'llava:7b' });
        });
        expect(localStorage.getItem('activeModel')).toBe('llava:7b');
    });

    it('persists appearance mode and accent choices', async () => {
        const user = userEvent.setup();
        renderSettings();

        await user.click(await screen.findByRole('button', { name: /^light$/i }));
        await user.click(screen.getByTitle('Ocean'));

        expect(document.documentElement).toHaveAttribute('data-mode', 'light');
        expect(document.documentElement).toHaveAttribute('data-color', 'ocean');
        expect(localStorage.getItem('themeMode')).toBe('light');
        expect(localStorage.getItem('themeColor')).toBe('ocean');
    });

    it('starts a background AI scan with selected options', async () => {
        const user = userEvent.setup();
        let scanPayload: any = null;
        server.use(
            http.post(`${BASE}/api/scan`, async ({ request }) => {
                scanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path…'), 'C:\\Photos');
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
            });
        });
    });

    it('prompts before force rescanning a previously scanned AI folder', async () => {
        const user = userEvent.setup();
        let scanPayload: any = null;
        server.use(
            http.get(`${BASE}/api/scan/history`, () => HttpResponse.json({
                history: [{ directory_path: 'C:\\Photos', last_scanned: '2026-06-01T10:00:00' }],
            })),
            http.post(`${BASE}/api/scan`, async ({ request }) => {
                scanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path…'), 'C:\\Photos');
        await user.click(screen.getByRole('button', { name: /start background scan/i }));

        const forceRescanButton = await screen.findByRole('button', { name: /force rescan/i });
        await user.click(forceRescanButton);

        await waitFor(() => {
            expect(scanPayload).toMatchObject({ directory_path: 'C:\\Photos', force_rescan: true });
        });
    });

    it('starts a non-AI folder scan with metadata extraction disabled', async () => {
        const user = userEvent.setup();
        let folderScanPayload: any = null;
        server.use(
            http.post(`${BASE}/api/folder-scan`, async ({ request }) => {
                folderScanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path to scan…'), 'D:\\Media');
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

    it('uses recent scan history entries to fill both scan path fields', async () => {
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/scan/history`, () => HttpResponse.json({
                history: [{ directory_path: 'C:\\History\\AI', last_scanned: '2026-06-01T10:00:00' }],
            })),
            http.get(`${BASE}/api/folder-scan/history`, () => HttpResponse.json({
                history: [{ directory_path: 'D:\\History\\Local', last_scanned: '2026-06-02T10:00:00' }],
            })),
        );

        renderSettings();
        await user.click(await screen.findAllByRole('button', { name: /recently scanned folders/i }).then(buttons => buttons[0]));
        await user.click(screen.getByRole('button', { name: /C:\\History\\AI/i }));
        await user.click(screen.getAllByRole('button', { name: /recently scanned folders/i })[1]);
        await user.click(screen.getByRole('button', { name: /D:\\History\\Local/i }));

        expect(screen.getByPlaceholderText('Type or paste folder path…')).toHaveValue('C:\\History\\AI');
        expect(screen.getByPlaceholderText('Type or paste folder path to scan…')).toHaveValue('D:\\History\\Local');
    });

    it('creates a backup and refreshes backup options', async () => {
        const user = userEvent.setup();
        let backupCreated = false;
        server.use(
            http.get(`${BASE}/api/database/backups`, () => HttpResponse.json({
                backups: backupCreated
                    ? [{ filename: 'after.sqlite', size: 2048, created: 1780000000 }]
                    : [],
            })),
            http.post(`${BASE}/api/database/backup`, () => {
                backupCreated = true;
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        await user.click(await screen.findByRole('button', { name: /create backup now/i }));

        expect(await screen.findByText(/Backup created successfully/i)).toBeInTheDocument();
        expect(await screen.findByText(/after\.sqlite/i)).toBeInTheDocument();
    });

    it('confirms restore from a selected backup', async () => {
        const user = userEvent.setup();
        let restorePayload: any = null;
        server.use(
            http.get(`${BASE}/api/database/backups`, () => HttpResponse.json({
                backups: [{ filename: 'backup.sqlite', size: 2048, created: 1780000000 }],
            })),
            http.post(`${BASE}/api/database/restore`, async ({ request }) => {
                restorePayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        await user.click(await screen.findByRole('button', { name: /restore/i }));
        await user.click(screen.getByRole('button', { name: /confirm wipe/i }));

        await waitFor(() => {
            expect(restorePayload).toEqual({ filename: 'backup.sqlite' });
        });
        expect(await screen.findByText(/Successfully restored DB to version: backup\.sqlite/i)).toBeInTheDocument();
    });

    it('uses the two-step confirmation before cleaning the main gallery database', async () => {
        const user = userEvent.setup();
        let cleanPayload: any = null;
        server.use(
            http.post(`${BASE}/api/database/clean`, async ({ request }) => {
                cleanPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderSettings();
        await user.click(await screen.findByRole('button', { name: /clean main gallery database/i }));
        await user.click(screen.getByRole('button', { name: /yes, proceed/i }));
        expect(screen.getByText(/really sure/i)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /confirm wipe/i }));

        await waitFor(() => {
            expect(cleanPayload).toEqual({ target: 'main' });
        });
    });

    it('logs error when vision model update fails', async () => {
        const user = userEvent.setup();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.post(`${BASE}/api/settings/model`, () => HttpResponse.error()),
        );

        renderSettings();
        const modelSelect = await screen.findByDisplayValue('llava:13b');
        await user.selectOptions(modelSelect, 'llava:7b');

        await waitFor(() => {
            expect(consoleError).toHaveBeenCalledWith("Failed to update model");
        });
        consoleError.mockRestore();
    });

    it('shows api error when AI scan start fails', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(`${BASE}/api/scan`, () => HttpResponse.json({ detail: 'Scan start error detail' }, { status: 500 })),
        );

        renderSettings();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path…'), 'C:\\Photos');
        await user.click(screen.getByRole('button', { name: /start background scan/i }));

        expect(await screen.findByText('Scan start error detail')).toBeInTheDocument();
    });

    it('shows api error when non-AI folder scan fails', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(`${BASE}/api/folder-scan`, () => HttpResponse.json({ detail: 'Folder scan error detail' }, { status: 500 })),
        );

        renderSettings();
        await user.type(await screen.findByPlaceholderText('Type or paste folder path to scan…'), 'D:\\Media');
        await user.click(screen.getByRole('button', { name: /start non-ai scan/i }));

        expect(await screen.findByText('Folder scan error detail')).toBeInTheDocument();
    });

    it('shows api error when scan control actions fail', async () => {
        vi.useFakeTimers();
        server.use(
            http.get(`${BASE}/api/scan/status`, () => HttpResponse.json({
                state: 'running',
                total_gallery: 5,
                total_duplicates: 1,
                scan_total: 10,
                scan_processed: 2,
            })),
            http.post(`${BASE}/api/scan/control`, () => HttpResponse.json({ detail: 'Control failed' }, { status: 500 })),
        );

        renderSettings();

        // Advance timer by 3000ms to trigger the status poll interval
        await vi.advanceTimersByTimeAsync(3000);
        vi.useRealTimers();

        const pauseBtn = await screen.findByRole('button', { name: /pause/i });

        const user = userEvent.setup();
        await user.click(pauseBtn);

        expect(await screen.findByText('Request failed with status code 500')).toBeInTheDocument();
    });

    it('shows api error when folder scan control actions fail', async () => {
        vi.useFakeTimers();
        server.use(
            http.get(`${BASE}/api/scan/status`, () => HttpResponse.json({
                state: 'idle',
                total_gallery: 5,
                total_duplicates: 1,
                scan_total: 0,
                scan_processed: 0,
            })),
            http.get(`${BASE}/api/folder-scan/status`, () => HttpResponse.json({
                state: 'running',
                total_gallery: 5,
                total_duplicates: 1,
                scan_total: 10,
                scan_processed: 2,
            })),
            http.post(`${BASE}/api/folder-scan/control`, () => HttpResponse.json({ detail: 'Control failed' }, { status: 500 })),
        );

        renderSettings();

        // Advance timer by 3000ms to trigger the status poll interval
        await vi.advanceTimersByTimeAsync(3000);
        vi.useRealTimers();

        const pauseBtn = await screen.findByRole('button', { name: /pause/i });

        const user = userEvent.setup();
        await user.click(pauseBtn);

        expect(await screen.findByText('Request failed with status code 500')).toBeInTheDocument();
    });

    it('shows api error when database restore fails', async () => {
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/database/backups`, () => HttpResponse.json({
                backups: [{ filename: 'backup.sqlite', size: 2048, created: 1780000000 }],
            })),
            http.post(`${BASE}/api/database/restore`, () => HttpResponse.json({ detail: 'Restore error detail' }, { status: 500 })),
        );

        renderSettings();
        await user.click(await screen.findByRole('button', { name: /restore/i }));
        await user.click(screen.getByRole('button', { name: /confirm wipe/i }));

        expect(await screen.findByText('Restore error detail')).toBeInTheDocument();
    });

    it('shows api error when clean database fails', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(`${BASE}/api/database/clean`, () => HttpResponse.json({ detail: 'Clean error detail' }, { status: 500 })),
        );

        renderSettings();
        await user.click(await screen.findByRole('button', { name: /clean main gallery database/i }));
        await user.click(screen.getByRole('button', { name: /yes, proceed/i }));
        await user.click(screen.getByRole('button', { name: /confirm wipe/i }));

        expect(await screen.findByText('Clean error detail')).toBeInTheDocument();
    });

    it('dismisses confirm modal on cancel click or backdrop click', async () => {
        const user = userEvent.setup();
        renderSettings();
        await user.click(await screen.findByRole('button', { name: /clean main gallery database/i }));

        expect(screen.getByText(/Warning: Destructive Action/i)).toBeInTheDocument();

        // Click Cancel button
        await user.click(screen.getByRole('button', { name: /cancel/i }));
        expect(screen.queryByText(/Warning: Destructive Action/i)).not.toBeInTheDocument();

        // Re-open and click backdrop
        await user.click(await screen.findByRole('button', { name: /clean main gallery database/i }));
        expect(screen.getByText(/Warning: Destructive Action/i)).toBeInTheDocument();

        const modalBackdrop = screen.getByText(/Warning: Destructive Action/i).closest('.fixed');
        expect(modalBackdrop).toBeInTheDocument();
        await user.click(modalBackdrop!);
        expect(screen.queryByText(/Warning: Destructive Action/i)).not.toBeInTheDocument();
    });
});
