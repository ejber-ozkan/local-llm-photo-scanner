import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import Identify from '../Identify';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

function renderIdentify() {
    return render(
        <BrowserRouter>
            <Identify />
        </BrowserRouter>
    );
}

function unidentified(overrides: Partial<any> = {}) {
    return {
        id: 10,
        type: 'person',
        name: 'Unknown Person 1',
        photo_id: 1,
        bounding_box: '{"x":100,"y":50,"w":80,"h":120}',
        ...overrides,
    };
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

    it('shows the empty caught-up state when there are no unidentified entities', async () => {
        server.use(
            http.get(`${BASE}/api/unidentified`, () => HttpResponse.json([])),
        );

        renderIdentify();

        expect(await screen.findByText('All caught up! No unknown entities to identify.')).toBeInTheDocument();
    });

    it('falls back to the empty state when unidentified loading fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/unidentified`, () => HttpResponse.json({ detail: 'offline' }, { status: 500 })),
        );

        renderIdentify();

        expect(await screen.findByText('All caught up! No unknown entities to identify.')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('deduplicates one card per photo while showing all unknown names for that photo', async () => {
        server.use(
            http.get(`${BASE}/api/unidentified`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', photo_id: 1 }),
                unidentified({ id: 11, type: 'pet', name: 'Unknown Pet 1', photo_id: 1 }),
            ])),
        );

        renderIdentify();

        expect(await screen.findByText('2 unknown')).toBeInTheDocument();
        expect(screen.getByText('Unknown Person 1, Unknown Pet 1')).toBeInTheDocument();
        expect(screen.getByText('2 unidentified entities')).toBeInTheDocument();
        expect(await screen.findAllByAltText('Entity context')).toHaveLength(1);
    });

    it('opens a photo with person and pet entities and closes the modal', async () => {
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/unidentified`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', type: 'person' }),
                unidentified({ id: 11, name: 'Unknown Pet 1', type: 'pet' }),
            ])),
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', type: 'person' }),
                unidentified({ id: 11, name: 'Unknown Pet 1', type: 'pet' }),
            ])),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));

        expect(await screen.findByText('Identify People in Photo')).toBeInTheDocument();
        expect(screen.getByText('Detected Entities (2)')).toBeInTheDocument();
        expect(screen.getByText('Unknown Person 1')).toBeInTheDocument();
        expect(screen.getByText('Unknown Pet 1')).toBeInTheDocument();
        expect(screen.getByAltText('Full photo')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /close identify photo/i }));

        expect(screen.queryByText('Identify People in Photo')).not.toBeInTheDocument();
    });

    it('opens a modal empty state when photo entity loading fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json({ detail: 'offline' }, { status: 500 })),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));

        expect(await screen.findByText('Detected Entities (0)')).toBeInTheDocument();
        expect(screen.getByAltText('Full photo')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('does not submit an empty name when naming an unknown entity', async () => {
        let renameCalls = 0;
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', type: 'person' }),
            ])),
            http.post(`${BASE}/api/entities/name`, () => {
                renameCalls += 1;
                return HttpResponse.json({ success: true });
            }),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));
        await screen.findByText('Identify People in Photo');
        await user.click(screen.getAllByText('Unknown Person 1').at(-1)!);
        await user.click(screen.getByRole('button', { name: /save Unknown Person 1/i }));

        expect(renameCalls).toBe(0);
        expect(screen.getByPlaceholderText('Enter real name...')).toBeInTheDocument();
    });

    it('renames an unknown entity and removes it from the unidentified card list', async () => {
        let renamePayload: any = null;
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', type: 'person' }),
            ])),
            http.post(`${BASE}/api/entities/name`, async ({ request }) => {
                renamePayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));
        await screen.findByText('Identify People in Photo');
        await user.click(screen.getAllByText('Unknown Person 1').at(-1)!);
        await user.type(screen.getByPlaceholderText('Enter real name...'), 'Alicia');
        await user.click(screen.getByRole('button', { name: /save Unknown Person 1/i }));

        await waitFor(() => {
            expect(renamePayload).toEqual({ entity_id: 'Unknown Person 1', new_name: 'Alicia' });
        });
        expect(await screen.findByText('Alicia')).toBeInTheDocument();
        expect(screen.queryByText(/1 unknown/i)).not.toBeInTheDocument();
    });

    it('cancels rename edit mode without submitting', async () => {
        let renameCalls = 0;
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json([
                unidentified({ id: 12, name: 'Unknown Pet 1', type: 'pet' }),
            ])),
            http.post(`${BASE}/api/entities/name`, () => {
                renameCalls += 1;
                return HttpResponse.json({ success: true });
            }),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));
        await screen.findByText('Identify People in Photo');
        await user.click(screen.getAllByText('Unknown Pet 1').at(-1)!);
        await user.type(screen.getByPlaceholderText('Enter real name...'), 'Scout');
        await user.click(screen.getByRole('button', { name: /cancel editing Unknown Pet 1/i }));

        expect(renameCalls).toBe(0);
        expect(screen.getByText('Unknown Pet 1')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Enter real name...')).not.toBeInTheDocument();
    });

    it('deletes an entity after confirmation and removes it from the card list', async () => {
        let deletedEntityId = '';
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', type: 'person' }),
            ])),
            http.delete(`${BASE}/api/entities/id/:entityId`, ({ params }) => {
                deletedEntityId = String(params.entityId);
                return HttpResponse.json({ success: true });
            }),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));
        await user.click(await screen.findByRole('button', { name: /delete Unknown Person 1/i }));
        await user.click(screen.getByRole('button', { name: /^delete$/i }));

        await waitFor(() => {
            expect(deletedEntityId).toBe('10');
        });
        expect(screen.queryByText('Unknown Person 1')).not.toBeInTheDocument();
        expect(screen.queryByText(/1 unknown/i)).not.toBeInTheDocument();
    });

    it('keeps the entity visible when delete fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = userEvent.setup();
        server.use(
            http.get(`${BASE}/api/photo/:photoId/entities`, () => HttpResponse.json([
                unidentified({ id: 10, name: 'Unknown Person 1', type: 'person' }),
            ])),
            http.delete(`${BASE}/api/entities/id/:entityId`, () => HttpResponse.json({ detail: 'nope' }, { status: 500 })),
        );

        renderIdentify();

        await user.click(await screen.findByAltText('Entity context'));
        await user.click(await screen.findByRole('button', { name: /delete Unknown Person 1/i }));
        await user.click(screen.getByRole('button', { name: /^delete$/i }));

        await waitFor(() => {
            expect(screen.getAllByText('Unknown Person 1').length).toBeGreaterThan(0);
        });
        consoleError.mockRestore();
    });
});
