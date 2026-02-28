import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Identify from '../Identify';

function renderIdentify() {
    return render(
        <BrowserRouter>
            <Identify />
        </BrowserRouter>
    );
}

describe('Identify', () => {
    // ── Initial Render ─────────────────────────────────────────────────

    it('renders the page title', async () => {
        renderIdentify();
        await waitFor(() => {
            expect(screen.getByText(/Identify Unknown Faces/i)).toBeInTheDocument();
        });
    });

    it('loads unidentified entities from the API', async () => {
        renderIdentify();
        await waitFor(() => {
            // Mock returns one Unknown Person — the badge shows "1 unknown"
            expect(screen.getByText(/1 unknown/i)).toBeInTheDocument();
        });
    });

    // ── Photo Entity Card ──────────────────────────────────────────────

    it('renders photo cards with entity context images', async () => {
        renderIdentify();
        await waitFor(() => {
            expect(screen.getByAltText('Entity context')).toBeInTheDocument();
        });
    });

    it('shows the entity name on the card', async () => {
        renderIdentify();
        await waitFor(() => {
            expect(screen.getByText('Unknown Person 1')).toBeInTheDocument();
        });
    });
});
