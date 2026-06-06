import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import ScanTest from '../ScanTest';
import { server } from '../../test/mocks/server';

const BASE = 'http://localhost:8000';

beforeEach(() => {
    localStorage.clear();
});

function renderScanTest() {
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-image');
    const view = render(<ScanTest />);
    return { ...view, objectUrl };
}

function uploadFile(container: HTMLElement, name = 'sample.jpg') {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake image'], name, { type: 'image/jpeg' });
    return userEvent.upload(input, file);
}

function scanResult(overrides: Partial<any> = {}) {
    return {
        photo_id: 99,
        filename: 'sample.jpg',
        ai_model: 'llava:13b',
        description: 'A test image description',
        entities: [
            { id: 1, type: 'person', name: 'TestPerson', bounding_box: '{"x":10,"y":10,"w":50,"h":50}' },
            { id: 2, type: 'pet', name: 'TestPet' },
        ],
        metadata: {
            Make: 'Canon',
            Model: 'EOS R5',
        },
        gps_lat: 51.5074,
        gps_lon: -0.1278,
        history: [
            {
                photo_id: 88,
                ai_model: 'bakllava',
                description: 'Earlier model description',
                entities: [{ id: 3, type: 'person', name: 'PreviousPerson' }],
            },
        ],
        ...overrides,
    };
}

describe('ScanTest', () => {
    it('keeps a saved active model when it is still available', async () => {
        localStorage.setItem('activeModel', 'llava:7b');

        renderScanTest();

        expect(await screen.findByRole('combobox')).toHaveValue('llava:7b');
    });

    it('logs model fetch failures and still renders the upload workflow', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.get(`${BASE}/api/models`, () => HttpResponse.json({ detail: 'Models unavailable.' }, { status: 500 })),
        );

        renderScanTest();

        expect(await screen.findByRole('combobox')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /run ai analysis/i })).toBeDisabled();
        expect(consoleError).toHaveBeenCalledWith('Failed to fetch models', expect.any(Error));
        consoleError.mockRestore();
    });

    it('renders model options and persists model selection', async () => {
        let selectedPayload: any = null;
        server.use(
            http.post(`${BASE}/api/settings/model`, async ({ request }) => {
                selectedPayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
        );

        renderScanTest();

        const modelSelect = await screen.findByRole('combobox');
        expect(modelSelect).toHaveValue('llava:13b');

        await userEvent.selectOptions(modelSelect, 'llava:7b');

        expect(localStorage.getItem('activeModel')).toBe('llava:7b');
        await waitFor(() => {
            expect(selectedPayload).toEqual({ active_model: 'llava:7b' });
        });
    });

    it('accepts files dropped onto the upload panel', async () => {
        const { objectUrl } = renderScanTest();
        const dropzone = screen.getByText(/click or drag image to upload/i).closest('div') as HTMLElement;
        const file = new File(['dropped image'], 'dropped.jpg', { type: 'image/jpeg' });

        fireEvent.dragOver(dropzone);
        fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

        await waitFor(() => {
            expect(objectUrl).toHaveBeenCalledWith(file);
        });
        expect(screen.getAllByAltText('Preview')).toHaveLength(2);
    });

    it('uploads an image, runs AI analysis, and displays metadata, entities, GPS, and history', async () => {
        let postedModel = '';
        server.use(
            http.post(`${BASE}/api/scan/single`, async ({ request }) => {
                const formData = await request.formData();
                postedModel = String(formData.get('model'));
                return HttpResponse.json(scanResult());
            }),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));

        expect(await screen.findByText('A test image description')).toBeInTheDocument();
        expect(postedModel).toBe('llava:13b');
        expect(screen.getByText('TestPerson')).toBeInTheDocument();
        expect(screen.getByText('TestPet')).toBeInTheDocument();
        expect(screen.getByText('Camera / Image Metadata')).toBeInTheDocument();
        expect(screen.getByText('Canon')).toBeInTheDocument();
        expect(screen.getByText('Previous Model Responses')).toBeInTheDocument();
        expect(screen.getByText('Earlier model description')).toBeInTheDocument();
    });

    it('shows scan failures returned by the backend', async () => {
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json({ detail: 'Vision model offline.' }, { status: 503 })),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));

        expect(await screen.findByText('Vision model offline.')).toBeInTheDocument();
    });

    it('shows the no-entities result branch', async () => {
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult({
                entities: [],
                metadata: {},
                gps_lat: undefined,
                gps_lon: undefined,
                history: [],
            }))),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));

        expect(await screen.findByText('No people or pets detected by the models.')).toBeInTheDocument();
        expect(screen.queryByText('Camera / Image Metadata')).not.toBeInTheDocument();
    });

    it('renames and deletes detected entities from the result', async () => {
        let renamePayload: any = null;
        let deletedEntityId = '';
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
            http.post(`${BASE}/api/test/entities/name`, async ({ request }) => {
                renamePayload = await request.json();
                return HttpResponse.json({ success: true });
            }),
            http.delete(`${BASE}/api/test/entities/id/:entityId`, ({ params }) => {
                deletedEntityId = String(params.entityId);
                return HttpResponse.json({ success: true });
            }),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));

        await userEvent.click(await screen.findByRole('button', { name: /edit TestPerson/i }));
        const input = screen.getByDisplayValue('TestPerson');
        await userEvent.clear(input);
        await userEvent.type(input, 'RenamedPerson');
        await userEvent.click(screen.getByRole('button', { name: /save TestPerson/i }));

        await waitFor(() => {
            expect(renamePayload).toEqual({ entity_id: 'TestPerson', new_name: 'RenamedPerson' });
        });
        expect(await screen.findByText('RenamedPerson')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /delete TestPet/i }));
        await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

        await waitFor(() => {
            expect(deletedEntityId).toBe('2');
        });
        expect(screen.queryByText('TestPet')).not.toBeInTheDocument();
    });

    it('clears the test database after confirmation', async () => {
        let clearCalled = false;
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
            http.post(`${BASE}/api/test/clear`, () => {
                clearCalled = true;
                return HttpResponse.json({ success: true });
            }),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        expect(await screen.findByText('A test image description')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /clean test database/i }));
        await userEvent.click(screen.getByRole('button', { name: /confirm wipe/i }));

        await waitFor(() => {
            expect(clearCalled).toBe(true);
        });
        expect(screen.getByText('Upload an image and run analysis to see results here.')).toBeInTheDocument();
    });

    it('draws a bounding box when hovering a detected entity after the preview image loads', async () => {
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        await screen.findByText('A test image description');

        const previewImage = screen.getAllByAltText('Preview').at(-1)!;
        Object.defineProperty(previewImage, 'naturalWidth', { value: 100, configurable: true });
        Object.defineProperty(previewImage, 'naturalHeight', { value: 100, configurable: true });
        fireEvent.load(previewImage);

        const entityName = screen.getByText('TestPerson');
        await userEvent.hover(entityName);

        expect(container.querySelector('.border-4.border-blue-500')).toBeInTheDocument();

        await userEvent.unhover(entityName);
        expect(container.querySelector('.border-4.border-blue-500')).not.toBeInTheDocument();
    });

    it('logs invalid bounding boxes without breaking the result view', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult({
                entities: [
                    { id: 7, type: 'person', name: 'BrokenBox', bounding_box: 'not-json' },
                ],
            }))),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        await screen.findByText('BrokenBox');

        const previewImage = screen.getAllByAltText('Preview').at(-1)!;
        Object.defineProperty(previewImage, 'naturalWidth', { value: 100, configurable: true });
        Object.defineProperty(previewImage, 'naturalHeight', { value: 100, configurable: true });
        fireEvent.load(previewImage);

        await userEvent.hover(screen.getByText('BrokenBox'));

        expect(consoleError).toHaveBeenCalledWith('Failed to parse box for', 'BrokenBox', expect.any(SyntaxError));
        expect(screen.getByText('A test image description')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('cancels card edit and delete confirmation without changing the entity', async () => {
        let renameCalls = 0;
        let deleteCalls = 0;
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
            http.post(`${BASE}/api/test/entities/name`, () => {
                renameCalls += 1;
                return HttpResponse.json({ success: true });
            }),
            http.delete(`${BASE}/api/test/entities/id/:entityId`, () => {
                deleteCalls += 1;
                return HttpResponse.json({ success: true });
            }),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        await screen.findByText('TestPerson');

        await userEvent.click(screen.getByRole('button', { name: /edit TestPerson/i }));
        const input = screen.getByDisplayValue('TestPerson');
        await userEvent.clear(input);
        await userEvent.type(input, 'IgnoredName');
        await userEvent.click(screen.getByRole('button', { name: /cancel editing TestPerson/i }));

        expect(renameCalls).toBe(0);
        expect(screen.getByText('TestPerson')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /delete TestPet/i }));
        await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(deleteCalls).toBe(0);
        expect(screen.getByText('TestPet')).toBeInTheDocument();
    });

    it('cancels clean database confirmation without clearing the result', async () => {
        let clearCalled = false;
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
            http.post(`${BASE}/api/test/clear`, () => {
                clearCalled = true;
                return HttpResponse.json({ success: true });
            }),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        expect(await screen.findByText('A test image description')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /clean test database/i }));
        await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(clearCalled).toBe(false);
        expect(screen.getByText('A test image description')).toBeInTheDocument();
    });

    it('shows a toast when entity rename fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
            http.post(`${BASE}/api/test/entities/name`, () => HttpResponse.json({ detail: 'rename failed' }, { status: 500 })),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        await userEvent.click(await screen.findByRole('button', { name: /edit TestPerson/i }));
        await userEvent.clear(screen.getByDisplayValue('TestPerson'));
        await userEvent.type(screen.getByRole('textbox'), 'Nope');
        await userEvent.click(screen.getByRole('button', { name: /save TestPerson/i }));

        expect(await screen.findByText('Failed to rename entity')).toBeInTheDocument();
        expect(screen.getByText('TestPerson')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('shows a toast when entity deletion fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.post(`${BASE}/api/scan/single`, () => HttpResponse.json(scanResult())),
            http.delete(`${BASE}/api/test/entities/id/:entityId`, () => HttpResponse.json({ detail: 'delete failed' }, { status: 500 })),
        );

        const { container } = renderScanTest();
        await uploadFile(container);
        await userEvent.click(screen.getByRole('button', { name: /run ai analysis/i }));
        await userEvent.click(await screen.findByRole('button', { name: /delete TestPet/i }));
        await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

        expect(await screen.findByText('Failed to delete entity')).toBeInTheDocument();
        expect(screen.getByText('TestPet')).toBeInTheDocument();
        consoleError.mockRestore();
    });

    it('shows a backend detail toast when clearing the test database fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.use(
            http.post(`${BASE}/api/test/clear`, () => HttpResponse.json({ detail: 'Clear denied.' }, { status: 500 })),
        );

        renderScanTest();
        await userEvent.click(screen.getByRole('button', { name: /clean test database/i }));
        await userEvent.click(screen.getByRole('button', { name: /confirm wipe/i }));

        expect(await screen.findByText('Clear denied.')).toBeInTheDocument();
        consoleError.mockRestore();
    });
});
