import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Gallery from '../Gallery';

// Helper to render Gallery wrapped in required providers
function renderGallery() {
    return render(
        <BrowserRouter>
            <Gallery />
        </BrowserRouter>
    );
}

describe('Gallery', () => {
    // ── Initial Render ─────────────────────────────────────────────────

    it('renders the page title', async () => {
        renderGallery();
        expect(screen.getByText('My AI Photo Gallery')).toBeInTheDocument();
    });

    it('renders the search input', () => {
        renderGallery();
        expect(
            screen.getByPlaceholderText(/search by description/i)
        ).toBeInTheDocument();
    });

    it('loads and displays photos from the API', async () => {
        renderGallery();
        // Wait for the mock API photos to load
        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });
        expect(screen.getByAltText('mountain.jpg')).toBeInTheDocument();
    });

    it('shows photo description on hover overlay', async () => {
        renderGallery();
        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });
        // The description text should be in the DOM (shown on hover via CSS opacity)
        expect(screen.getByText('A sunny beach with palm trees')).toBeInTheDocument();
    });

    // ── Sort Dropdown ──────────────────────────────────────────────────

    it('renders the sort dropdown defaulting to "Date taken"', async () => {
        renderGallery();
        await waitFor(() => {
            expect(screen.getByText('Date taken')).toBeInTheDocument();
        });
    });

    // ── Filters ────────────────────────────────────────────────────────

    it('shows filter panel when Filters button is clicked', async () => {
        const user = userEvent.setup();
        renderGallery();

        await waitFor(() => {
            expect(screen.getByText('Filters')).toBeInTheDocument();
        });

        await user.click(screen.getByText('Filters'));

        await waitFor(() => {
            expect(screen.getByText('Filter Gallery')).toBeInTheDocument();
        });
    });

    it('shows filter chips for Has Faces, Unidentified, People, Pets', async () => {
        const user = userEvent.setup();
        renderGallery();

        await waitFor(() => {
            expect(screen.getByText('Filters')).toBeInTheDocument();
        });
        await user.click(screen.getByText('Filters'));

        await waitFor(() => {
            expect(screen.getByText('Has Faces')).toBeInTheDocument();
            expect(screen.getByText('Unidentified')).toBeInTheDocument();
            expect(screen.getByText('People')).toBeInTheDocument();
            expect(screen.getByText('Pets')).toBeInTheDocument();
        });
    });

    it('shows filter stats from API', async () => {
        const user = userEvent.setup();
        renderGallery();

        await waitFor(() => {
            expect(screen.getByText('Filters')).toBeInTheDocument();
        });
        await user.click(screen.getByText('Filters'));

        await waitFor(() => {
            expect(screen.getByText('150 total photos')).toBeInTheDocument();
            expect(screen.getByText('42 with faces')).toBeInTheDocument();
            expect(screen.getByText('8 unidentified')).toBeInTheDocument();
        });
    });

    // ── Photo Detail Modal ─────────────────────────────────────────────

    it('opens photo detail modal on click', async () => {
        const user = userEvent.setup();
        renderGallery();

        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });

        // Click the photo card
        await user.click(screen.getByAltText('beach.jpg'));

        // Wait for the modal to load photo details
        await waitFor(() => {
            // Should show the filepath
            expect(screen.getByText('/photos/holiday/beach.jpg')).toBeInTheDocument();
        });
    });

    it('shows detected entities in the modal', async () => {
        const user = userEvent.setup();
        renderGallery();

        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });

        await user.click(screen.getByAltText('beach.jpg'));

        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Max')).toBeInTheDocument();
        });
    });

    it('shows metadata in the modal', async () => {
        const user = userEvent.setup();
        renderGallery();

        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });

        await user.click(screen.getByAltText('beach.jpg'));

        await waitFor(() => {
            expect(screen.getByText('Canon')).toBeInTheDocument();
            expect(screen.getByText('EOS R5')).toBeInTheDocument();
            expect(screen.getByText('1/250')).toBeInTheDocument();
        });
    });

    // ── Year Timeline ──────────────────────────────────────────────────

    it('renders year timeline with years from API', async () => {
        renderGallery();

        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });

        // Year labels are present
        await waitFor(() => {
            expect(screen.getByText('2024')).toBeInTheDocument();
            expect(screen.getByText('2023')).toBeInTheDocument();
            expect(screen.getByText('2022')).toBeInTheDocument();
        });
    });

    // ── Search ─────────────────────────────────────────────────────────

    it('submits search form on Enter', async () => {
        const user = userEvent.setup();
        renderGallery();

        const input = screen.getByPlaceholderText(/search by description/i);
        await user.type(input, 'sunset{Enter}');

        // The search just triggers a re-fetch — verify input value was set
        expect(input).toHaveValue('sunset');
    });

    // ── Empty State ────────────────────────────────────────────────────

    it('shows empty state when no photos are returned', async () => {
        // Override the handler to return empty array
        const { server } = await import('../../test/mocks/server');
        const { http, HttpResponse } = await import('msw');
        server.use(
            http.get('http://localhost:8000/api/search', () => {
                return HttpResponse.json([]);
            })
        );

        renderGallery();

        await waitFor(() => {
            expect(
                screen.getByText(/no photos found/i)
            ).toBeInTheDocument();
        });
    });
});
