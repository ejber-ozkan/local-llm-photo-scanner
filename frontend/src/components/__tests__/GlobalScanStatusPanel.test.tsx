import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/mocks/server';
import GlobalScanStatusPanel from '../GlobalScanStatusPanel';

const BASE = 'http://localhost:8000';

describe('GlobalScanStatusPanel', () => {
    it('does not render when both scans are idle', async () => {
        render(<GlobalScanStatusPanel />);

        await waitFor(() => {
            expect(screen.queryByRole('status', { name: /scan activity/i })).not.toBeInTheDocument();
        });
    });

    it('shows active AI scan progress and remaining queue count', async () => {
        server.use(
            http.get(`${BASE}/api/scan/status`, () =>
                HttpResponse.json({
                    state: 'running',
                    total_gallery: 12,
                    total_duplicates: 1,
                    scan_total: 40,
                    scan_processed: 15,
                })
            )
        );

        render(<GlobalScanStatusPanel />);

        expect(await screen.findByRole('status', { name: /scan activity/i })).toBeInTheDocument();
        expect(screen.getByText('AI scan')).toBeInTheDocument();
        expect(screen.getByText('15/40')).toBeInTheDocument();
        expect(screen.getAllByText('25 queued')).toHaveLength(2);
    });

    it('shows active local folder scan progress and can collapse details', async () => {
        server.use(
            http.get(`${BASE}/api/folder-scan/status`, () =>
                HttpResponse.json({
                    state: 'running',
                    scan_total: 100,
                    scan_processed: 60,
                })
            )
        );

        const user = userEvent.setup();
        render(<GlobalScanStatusPanel />);

        expect(await screen.findByText('Local folder scan')).toBeInTheDocument();
        expect(screen.getAllByText('40 queued')).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: /collapse scan details/i }));

        expect(screen.queryByText('Local folder scan')).not.toBeInTheDocument();
        expect(screen.getByText('1 scan running')).toBeInTheDocument();
    });
});
