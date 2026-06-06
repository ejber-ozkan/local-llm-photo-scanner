import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import Gallery from '../Gallery';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

// Helper to render Gallery wrapped in required providers
function renderGallery() {
    return render(
        <BrowserRouter>
            <Gallery />
        </BrowserRouter>
    );
}

function photo(overrides: Partial<any> = {}) {
    return {
        id: 101,
        filepath: '/photos/test.jpg',
        filename: 'test.jpg',
        description: 'A test gallery image',
        date_taken: '2024:06:15 10:30:00',
        date_created: '2024:06:14 10:30:00',
        date_modified: '2024:06:16 10:30:00',
        ...overrides,
    };
}

function photoDetail(overrides: Partial<any> = {}) {
    return {
        id: 101,
        filepath: '/photos/test.jpg',
        filename: 'test.jpg',
        description: 'A test gallery image',
        entities: [
            { id: 501, type: 'person', name: 'Alice', bounding_box: '{"x":100,"y":50,"w":80,"h":120}' },
            { id: 502, type: 'pet', name: 'Max', bounding_box: '{"x":200,"y":150,"w":60,"h":80}' },
        ],
        metadata: {
            Make: 'Canon',
            Model: 'EOS R5',
            'Exposure Time': '1/250',
            'F-stop': 'f/2.8',
            ISO: '100',
            Dimensions: '8192x5464',
            Software: 'Photo App',
        },
        gps_lat: 51.5074,
        gps_lon: -0.1278,
        ai_model: 'llava:13b',
        ...overrides,
    };
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
            screen.getByPlaceholderText(/semantic search/i)
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

    it('renders year timeline for visible media groups', async () => {
        renderGallery();

        await waitFor(() => {
            expect(screen.getByAltText('beach.jpg')).toBeInTheDocument();
        });

        // Markers are derived from the photos currently displayed.
        await waitFor(() => {
            expect(screen.getByText('2024')).toBeInTheDocument();
            expect(screen.getByText('2023')).toBeInTheDocument();
        });
    });

    // ── Search ─────────────────────────────────────────────────────────

    it('submits search form on Enter', async () => {
        const user = userEvent.setup();
        renderGallery();

        const input = screen.getByPlaceholderText(/semantic search/i);
        await user.type(input, 'sunset{Enter}');

        // The search just triggers a re-fetch — verify input value was set
        expect(input).toHaveValue('sunset');
    });

    it('sends sort field and direction params when sort controls change', async () => {
        const observedQueries: string[] = [];
        server.use(
            http.get(`${BASE}/api/search`, ({ request }) => {
                observedQueries.push(new URL(request.url).search);
                return HttpResponse.json([photo()]);
            }),
        );

        const user = userEvent.setup();
        renderGallery();

        await screen.findByAltText('test.jpg');
        await user.click(screen.getByRole('button', { name: /date taken/i }));
        await user.click(screen.getByRole('button', { name: /name/i }));
        await user.click(screen.getByRole('button', { name: /name/i }));
        await user.click(screen.getByRole('button', { name: /ascending/i }));

        await waitFor(() => {
            expect(observedQueries.some(query => query.includes('sort_by=name'))).toBe(true);
            expect(observedQueries.some(query => query.includes('sort_dir=asc'))).toBe(true);
        });
    });

    it('sends person, camera, face, and unidentified filter params then clears them', async () => {
        const observedQueries: string[] = [];
        server.use(
            http.get(`${BASE}/api/search`, ({ request }) => {
                observedQueries.push(new URL(request.url).search);
                return HttpResponse.json([photo()]);
            }),
        );

        const user = userEvent.setup();
        renderGallery();

        await screen.findByAltText('test.jpg');
        await user.click(screen.getByRole('button', { name: /^filters/i }));
        await user.click(screen.getByRole('button', { name: /has faces/i }));
        await user.click(screen.getByRole('button', { name: /unidentified/i }));
        await user.click(screen.getByRole('button', { name: /people/i }));
        await user.selectOptions(screen.getByLabelText(/person \/ pet name/i), 'Alice');
        await user.selectOptions(screen.getByLabelText(/camera \/ device/i), 'Canon EOS R5');

        await waitFor(() => {
            expect(observedQueries.some(query =>
                query.includes('has_faces=true') &&
                query.includes('unidentified=true') &&
                query.includes('entity_type=person') &&
                query.includes('name=Alice') &&
                query.includes('camera=Canon+EOS+R5')
            )).toBe(true);
        });

        await user.click(screen.getByRole('button', { name: /clear all filters/i }));

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /clear all filters/i })).not.toBeInTheDocument();
        });
        expect(screen.getByLabelText(/person \/ pet name/i)).toHaveValue('');
        expect(screen.getByLabelText(/camera \/ device/i)).toHaveValue('');
    });

    it('sends pet filter params when the pets chip is selected', async () => {
        const observedQueries: string[] = [];
        server.use(
            http.get(`${BASE}/api/search`, ({ request }) => {
                observedQueries.push(new URL(request.url).search);
                return HttpResponse.json([photo()]);
            }),
        );

        const user = userEvent.setup();
        renderGallery();

        await screen.findByAltText('test.jpg');
        await user.click(screen.getByRole('button', { name: /^filters/i }));
        await user.click(screen.getByRole('button', { name: /pets/i }));

        await waitFor(() => {
            expect(observedQueries.some(query => query.includes('entity_type=pet'))).toBe(true);
        });
    });

    it('replaces the grid with visually similar results and closes the detail modal', async () => {
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'source.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ id: 101, filename: 'source.jpg' }))),
            http.get(`${BASE}/api/gallery/similar/:photoId`, () => HttpResponse.json([
                photo({ id: 202, filename: 'similar.jpg', filepath: '/photos/similar.jpg', description: 'Looks alike' }),
            ])),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('source.jpg'));
        expect(await screen.findByText('/photos/test.jpg')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /find visually similar photos/i }));

        expect(await screen.findByAltText('similar.jpg')).toBeInTheDocument();
        expect(screen.queryByText('/photos/test.jpg')).not.toBeInTheDocument();
        expect(screen.queryByAltText('source.jpg')).not.toBeInTheDocument();
    });

    it('shows a toast when visually similar search fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'source.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ id: 101, filename: 'source.jpg' }))),
            http.get(`${BASE}/api/gallery/similar/:photoId`, () => HttpResponse.json({ detail: 'offline' }, { status: 503 })),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('source.jpg'));
        await user.click(await screen.findByRole('button', { name: /find visually similar photos/i }));

        expect(await screen.findByText('Failed to find similar photos')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('renames and deletes entities from the detail modal', async () => {
        let renamePayload: any = null;
        let deletedEntityId = '';
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'entities.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ filename: 'entities.jpg' }))),
            http.post(`${BASE}/api/entities/name`, async ({ request }) => {
                renamePayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
            http.delete(`${BASE}/api/entities/id/:entityId`, ({ params }) => {
                deletedEntityId = String(params.entityId);
                return HttpResponse.json({ success: true });
            }),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('entities.jpg'));
        await user.click(await screen.findByRole('button', { name: /edit Alice/i }));
        const input = screen.getByDisplayValue('Alice');
        await user.clear(input);
        await user.type(input, 'Alicia');
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(renamePayload).toEqual({ entity_id: 'Alice', new_name: 'Alicia' });
        });
        expect(await screen.findByText('Alicia')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /delete Max/i }));
        await user.click(screen.getByRole('button', { name: /^delete$/i }));

        await waitFor(() => {
            expect(deletedEntityId).toBe('502');
        });
        expect(screen.queryByText('Max')).not.toBeInTheDocument();
    });

    it('opens and closes the full-size image lightbox from the detail modal', async () => {
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'lightbox.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ filename: 'lightbox.jpg' }))),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('lightbox.jpg'));
        await user.click(await screen.findByTitle('View full size'));

        expect(screen.getAllByAltText('lightbox.jpg')).toHaveLength(2);

        await user.click(screen.getByText('Click anywhere to close'));

        expect(screen.getByText('/photos/test.jpg')).toBeInTheDocument();
        expect(screen.queryByText('Click anywhere to close')).not.toBeInTheDocument();
    });

    it('closes the photo detail modal with the close button', async () => {
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'close-me.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ filename: 'close-me.jpg' }))),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('close-me.jpg'));
        expect(await screen.findByText('/photos/test.jpg')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /close photo detail/i }));

        await waitFor(() => {
            expect(screen.queryByText('/photos/test.jpg')).not.toBeInTheDocument();
        });
    });

    it('shows the no-metadata branch when detail data has no EXIF fields', async () => {
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'plain.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({
                filename: 'plain.jpg',
                entities: [],
                metadata: {},
                gps_lat: null,
                gps_lon: null,
                description: '',
            }))),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('plain.jpg'));

        expect(await screen.findByText('No EXIF metadata available for this image.')).toBeInTheDocument();
        expect(screen.queryByText(/Detected Entities/i)).not.toBeInTheDocument();
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

    it('opens lightbox by clicking the preview image and closes it using the close button', async () => {
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'lightbox-btn.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ filename: 'lightbox-btn.jpg' }))),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('lightbox-btn.jpg'));

        // Wait for the modal to load using its filepath text
        await screen.findByText('/photos/test.jpg');

        // Find the image inside the detail modal specifically
        const modalContainer = screen.getByText('/photos/test.jpg').closest('.bg-surface');
        const detailImg = modalContainer?.querySelector('img[alt="lightbox-btn.jpg"]');
        expect(detailImg).toBeTruthy();

        // Click the image directly to open lightbox
        await user.click(detailImg!);


        // Lightbox is open - find close button by role or class
        const closeButtons = screen.getAllByRole('button');
        const closeLightbox = closeButtons.find(btn => btn.className.includes('top-6') && btn.className.includes('right-6'));
        expect(closeLightbox).toBeDefined();
        await user.click(closeLightbox!);

        expect(screen.getByText('/photos/test.jpg')).toBeInTheDocument();
    });

    it('logs error when search API fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.error()),
        );

        renderGallery();

        await waitFor(() => {
            expect(consoleError).toHaveBeenCalled();
        });
        consoleError.mockRestore();
    });

    it('shows toast when entity renaming fails on backend', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'rename-fail.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ filename: 'rename-fail.jpg' }))),
            http.post(`${BASE}/api/entities/name`, () => HttpResponse.error()),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('rename-fail.jpg'));
        await user.click(await screen.findByRole('button', { name: /edit Alice/i }));
        const input = screen.getByDisplayValue('Alice');
        await user.clear(input);
        await user.type(input, 'Alicia');
        await user.click(screen.getByRole('button', { name: /save/i }));

        expect(await screen.findByText('Failed to rename entity')).toBeInTheDocument();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('shows toast when entity deletion fails on backend', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/search`, () => HttpResponse.json([photo({ id: 101, filename: 'delete-fail.jpg' })])),
            http.get(`${BASE}/api/photo/:photoId/detail`, () => HttpResponse.json(photoDetail({ filename: 'delete-fail.jpg' }))),
            http.delete(`${BASE}/api/entities/id/:entityId`, () => HttpResponse.error()),
        );

        const user = userEvent.setup();
        renderGallery();

        await user.click(await screen.findByAltText('delete-fail.jpg'));
        await user.click(screen.getByRole('button', { name: /delete Max/i }));
        await user.click(screen.getByRole('button', { name: /^delete$/i }));

        expect(await screen.findByText('Failed to delete entity')).toBeInTheDocument();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('logs error when filter options load fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/gallery/filters`, () => HttpResponse.error()),
        );

        renderGallery();

        await waitFor(() => {
            expect(consoleError).toHaveBeenCalled();
        });
        consoleError.mockRestore();
    });
});
