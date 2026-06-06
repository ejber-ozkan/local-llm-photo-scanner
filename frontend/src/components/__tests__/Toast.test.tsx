import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastContainer, useToast } from '../Toast';

function ToastHarness() {
    const { toasts, dismiss, success, error, warning, info } = useToast();

    return (
        <div>
            <button onClick={() => success('Saved photo')}>Success</button>
            <button onClick={() => error('Upload failed')}>Error</button>
            <button onClick={() => warning('Low disk space')}>Warning</button>
            <button onClick={() => info('Scan queued')}>Info</button>
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

describe('Toast', () => {
    it('renders toast messages for each type', () => {
        render(<ToastHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'Success' }));
        fireEvent.click(screen.getByRole('button', { name: 'Error' }));
        fireEvent.click(screen.getByRole('button', { name: 'Warning' }));
        fireEvent.click(screen.getByRole('button', { name: 'Info' }));

        expect(screen.getByText('Saved photo')).toBeInTheDocument();
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
        expect(screen.getByText('Low disk space')).toBeInTheDocument();
        expect(screen.getByText('Scan queued')).toBeInTheDocument();
    });

    it('dismisses the selected toast by id', () => {
        render(<ToastHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'Success' }));
        fireEvent.click(screen.getByRole('button', { name: 'Error' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);

        expect(screen.queryByText('Saved photo')).not.toBeInTheDocument();
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });

    it('renders nothing when there are no toasts', () => {
        const { container } = render(<ToastContainer toasts={[]} onDismiss={() => {}} />);

        expect(container).toBeEmptyDOMElement();
    });
});
