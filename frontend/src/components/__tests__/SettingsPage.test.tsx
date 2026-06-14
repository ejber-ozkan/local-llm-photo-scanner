import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import SettingsPage from '../SettingsPage';
import { MOCK_APP_VERSION } from '../../test/mocks/version';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

function renderSettings() {
    return render(<SettingsPage />);
}

describe('SettingsPage', () => {
    beforeEach(() => {
        localStorage.setItem('themeMode', 'dark');
        localStorage.setItem('themeColor', 'twilight');
        localStorage.removeItem('activeModel');
    });

    it('renders the settings-only page title', async () => {
        renderSettings();
        expect(await screen.findByText('Settings')).toBeInTheDocument();
        expect(screen.queryByText('Start Background Scan')).not.toBeInTheDocument();
    });

    it('loads and displays available models from the API', async () => {
        renderSettings();
        expect(await screen.findByDisplayValue('llava:13b')).toBeInTheDocument();
    });

    it('posts model changes and persists the active model', async () => {
        const user = userEvent.setup();
        let selectedPayload: unknown = null;
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
        let restorePayload: unknown = null;
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
        let cleanPayload: unknown = null;
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

    it('displays the app version', async () => {
        renderSettings();
        const versionPattern = new RegExp(MOCK_APP_VERSION.replaceAll('.', '\\.'));
        expect(await screen.findByText(versionPattern)).toBeInTheDocument();
    });
});
