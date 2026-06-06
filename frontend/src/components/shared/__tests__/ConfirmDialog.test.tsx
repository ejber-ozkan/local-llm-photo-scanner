import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../ConfirmDialog';

const defaultProps = {
    title: 'Delete photo',
    message: 'This cannot be undone.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<ConfirmDialog {...defaultProps} open={false} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('renders title, message, and custom confirm label', () => {
        render(<ConfirmDialog {...defaultProps} open confirmLabel="Remove" />);

        expect(screen.getByText('Delete photo')).toBeInTheDocument();
        expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

    it('calls confirm and cancel actions', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<ConfirmDialog {...defaultProps} open onConfirm={onConfirm} onCancel={onCancel} />);

        fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('cancels when the backdrop is clicked but not when the dialog body is clicked', () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...defaultProps} open variant="warning" onCancel={onCancel} />);

        fireEvent.click(screen.getByText('This cannot be undone.'));
        expect(onCancel).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Delete photo').closest('.fixed') as Element);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
