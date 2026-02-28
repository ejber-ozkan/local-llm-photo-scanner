import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SettingsPage from '../SettingsPage';

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
                screen.getByPlaceholderText(/C:\\Users/i)
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
        await waitFor(() => {
            expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
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
});
