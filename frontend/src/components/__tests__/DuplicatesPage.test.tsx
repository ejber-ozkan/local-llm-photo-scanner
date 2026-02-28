import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DuplicatesPage from '../DuplicatesPage';

function renderDuplicates() {
    return render(
        <BrowserRouter>
            <DuplicatesPage />
        </BrowserRouter>
    );
}

describe('DuplicatesPage', () => {
    // ── Initial Render ─────────────────────────────────────────────────

    it('renders the page title', async () => {
        renderDuplicates();
        await waitFor(() => {
            expect(screen.getByText('Duplicate Media')).toBeInTheDocument();
        });
    });

    it('loads and displays duplicate groups from the API', async () => {
        renderDuplicates();
        await waitFor(() => {
            // Should show the original file from our mock
            expect(screen.getByAltText('a.jpg')).toBeInTheDocument();
        });
    });

    it('shows the copy count badge', async () => {
        renderDuplicates();
        await waitFor(() => {
            // Our mock has count: 2 — rendered as "2 Copies" badge
            expect(screen.getByText('2 Copies')).toBeInTheDocument();
        });
    });

    it('shows "View all copies" button', async () => {
        renderDuplicates();
        await waitFor(() => {
            expect(screen.getByText('View all copies')).toBeInTheDocument();
        });
    });
});
