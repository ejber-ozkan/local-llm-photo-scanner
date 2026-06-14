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

        expect(screen.getByRole('button', { name: /zoom to 2 images/i })).toBeInTheDocument();
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
                },
            ])),
        );

        const user = userEvent.setup();
        render(<ImageMapPage />);

        await user.click(await screen.findByRole('button', { name: /open solo-map\.jpg/i }));

        expect(await screen.findByAltText('solo-map.jpg')).toBeInTheDocument();
        expect(screen.getByText('37.7749, -122.4194')).toBeInTheDocument();
    });
});
