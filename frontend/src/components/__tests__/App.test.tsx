import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';

// Helper to render App with a specific route
function renderApp(initialRoute = '/') {
    // App has its own BrowserRouter, so we need to swap it for testing
    // We render App directly since it includes BrowserRouter internally
    return render(<App />);
}

describe('App', () => {
    // ── Sidebar Navigation ─────────────────────────────────────────────

    it('renders the app logo and title', () => {
        renderApp();
        expect(screen.getByText('LLM Photo Scanner')).toBeInTheDocument();
    });

    it('renders all navigation links', () => {
        renderApp();
        expect(screen.getByText('Gallery')).toBeInTheDocument();
        expect(screen.getByText('Identify')).toBeInTheDocument();
        expect(screen.getByText('Review Duplicates')).toBeInTheDocument();
        expect(screen.getByText('Scan & Test')).toBeInTheDocument();
        expect(screen.getByText('Scan & Settings')).toBeInTheDocument();
    });

    // ── Default Route ──────────────────────────────────────────────────

    it('renders the Gallery page by default', async () => {
        renderApp();
        await waitFor(() => {
            expect(screen.getByText('My AI Photo Gallery')).toBeInTheDocument();
        });
    });

    // ── Theme Persistence ──────────────────────────────────────────────

    it('applies saved theme on mount', () => {
        localStorage.setItem('themeMode', 'light');
        localStorage.setItem('themeColor', 'ocean');

        renderApp();

        expect(document.documentElement.getAttribute('data-mode')).toBe('light');
        expect(document.documentElement.getAttribute('data-color')).toBe('ocean');

        // Clean up
        localStorage.removeItem('themeMode');
        localStorage.removeItem('themeColor');
    });

    it('applies default dark theme when no saved theme', () => {
        localStorage.removeItem('themeMode');
        localStorage.removeItem('themeColor');

        renderApp();

        expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
        expect(document.documentElement.getAttribute('data-color')).toBe('twilight');
    });
});
