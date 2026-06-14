import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import ImageMapPage from '../ImageMapPage';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

describe('ImageMapPage', () => {
    it('loads geotagged photos and renders clustered image markers', async () => {
        render(<ImageMapPage />);

        expect(screen.getByRole('application', { name: /image maps/i })).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText(/2 geotagged photos/i)).toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: /show 2 images/i })).toBeInTheDocument();
    });

    it('switches between OpenStreetMap and Google Maps tiles', async () => {
        const user = userEvent.setup();
        render(<ImageMapPage />);

        expect(await screen.findByText(/OpenStreetMap tiles/i)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /current provider is OpenStreetMap/i }));

        expect(await screen.findByText(/Google Maps tiles/i)).toBeInTheDocument();
    });

    it('opens a full image when a single photo marker is clicked', async () => {
        server.use(
            http.get(`${BASE}/api/gallery/map`, () => HttpResponse.json([
                {
                    id: 42,
                    filename: 'solo-map.jpg',
                    description: 'One mapped image',
                    date_taken: '2024:06:15 10:30:00',
                    gps_lat: 37.7749,
                    gps_lon: -122.4194,
                    source: 'gallery',
                },
            ])),
        );

        const user = userEvent.setup();
        render(<ImageMapPage />);

        await user.click(await screen.findByRole('button', { name: /open solo-map\.jpg/i }));

        expect(await screen.findByAltText('solo-map.jpg')).toBeInTheDocument();
        expect(screen.getByText('37.7749, -122.4194')).toBeInTheDocument();
    });

    it('spreads a multi-photo cluster into clickable thumbnails', async () => {
        const user = userEvent.setup();
        render(<ImageMapPage />);

        await user.click(await screen.findByRole('button', { name: /show 2 images/i }));

        expect(await screen.findByRole('button', { name: /open beach\.jpg/i })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /open beach\.jpg/i }));

        expect(await screen.findByAltText('beach.jpg')).toBeInTheDocument();
    });

    it('requests local indexed images only when enabled', async () => {
        const observedQueries: string[] = [];
        server.use(
            http.get(`${BASE}/api/gallery/map`, ({ request }) => {
                observedQueries.push(new URL(request.url).search);
                const includeLocal = new URL(request.url).searchParams.get('include_local') === 'true';
                return HttpResponse.json(includeLocal ? [
                    {
                        id: 88,
                        filename: 'local-indexed.jpg',
                        filepath: 'C:\\Photos\\local-indexed.jpg',
                        description: '',
                        date_taken: '2024:08:01',
                        gps_lat: 34.0522,
                        gps_lon: -118.2437,
                        source: 'local',
                    },
                ] : []);
            }),
        );

        const user = userEvent.setup();
        render(<ImageMapPage />);

        expect(await screen.findByText(/No geotagged photos yet/i)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /include non-ai scanned images/i }));

        expect(await screen.findByRole('button', { name: /open local-indexed\.jpg/i })).toBeInTheDocument();
        expect(observedQueries).toContain('');
        expect(observedQueries).toContain('?include_local=true');
    });

    it('keeps map controls clickable', async () => {
        const user = userEvent.setup();
        render(<ImageMapPage />);

        await screen.findByText(/OpenStreetMap tiles/i);
        await user.click(screen.getByRole('button', { name: /zoom in/i }));
        await user.click(screen.getByRole('button', { name: /zoom out/i }));
        await user.click(screen.getByRole('button', { name: /recenter photos/i }));
        await user.click(screen.getByRole('button', { name: /current provider is OpenStreetMap/i }));

        expect(await screen.findByText(/Google Maps tiles/i)).toBeInTheDocument();
    });
});
