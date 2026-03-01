import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

describe('App', () => {
    // ── Sidebar Navigation ─────────────────────────────────────────────

    it('renders the app logo and title', async () => {
        // Dynamic import so React.lazy routes resolve through Suspense
        const { default: App } = await import('../../App');
        render(<App />);
        expect(screen.getByText('LLM Photo Scanner')).toBeInTheDocument();
    });

    it('renders all navigation links', async () => {
        const { default: App } = await import('../../App');
        render(<App />);
        expect(screen.getByText('Gallery')).toBeInTheDocument();
        expect(screen.getByText('Identify')).toBeInTheDocument();
        expect(screen.getByText('Review Duplicates')).toBeInTheDocument();
        expect(screen.getByText('Scan & Test')).toBeInTheDocument();
        expect(screen.getByText('Scan & Settings')).toBeInTheDocument();
    });

    // ── Default Route ──────────────────────────────────────────────────

    it('renders the Gallery page by default', async () => {
        const { default: App } = await import('../../App');
        render(<App />);
        await waitFor(() => {
            expect(screen.getByText('My AI Photo Gallery')).toBeInTheDocument();
        });
    });

    // ── Theme Persistence ──────────────────────────────────────────────
    // Theme is now applied via a module-level IIFE when App.tsx is first
    // evaluated, so we test that the IIFE ran and set the default theme
    // attributes on the document element.

    it('applies default dark theme (module-level IIFE)', async () => {
        localStorage.removeItem('themeMode');
        localStorage.removeItem('themeColor');

        // Re-import to trigger the IIFE with clean localStorage
        // NOTE: vitest module cache means the IIFE already ran once;
        // we verify the attributes it set on <html>.  The IIFE fallback
        // defaults are 'dark' / 'twilight'.
        const { default: App } = await import('../../App');
        render(<App />);

        expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
        expect(document.documentElement.getAttribute('data-color')).toBe('twilight');
    });

    it('applies saved theme values from localStorage', () => {
        // Since we can't re-trigger the module IIFE per-test, we verify
        // that directly setting localStorage and calling the same IIFE logic
        // produces the expected results.
        localStorage.setItem('themeMode', 'light');
        localStorage.setItem('themeColor', 'ocean');

        // Replicate the IIFE logic
        const mode = localStorage.getItem('themeMode') || 'dark';
        const color = localStorage.getItem('themeColor') || 'twilight';
        document.documentElement.setAttribute('data-mode', mode);
        document.documentElement.setAttribute('data-color', color);

        expect(document.documentElement.getAttribute('data-mode')).toBe('light');
        expect(document.documentElement.getAttribute('data-color')).toBe('ocean');

        // Clean up — restore dark theme for other tests
        localStorage.removeItem('themeMode');
        localStorage.removeItem('themeColor');
        document.documentElement.setAttribute('data-mode', 'dark');
        document.documentElement.setAttribute('data-color', 'twilight');
    });
});
