import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EntityRow from '../EntityRow';

const baseProps = {
    ent: { id: 7, type: 'person', name: 'Alice' },
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
};

describe('EntityRow', () => {
    it('renders a compact entity and reports hover state', () => {
        const onMouseEnter = vi.fn();
        const onMouseLeave = vi.fn();
        render(<EntityRow {...baseProps} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />);

        fireEvent.mouseEnter(screen.getByText('Alice').closest('.group') as Element);
        fireEvent.mouseLeave(screen.getByText('Alice').closest('.group') as Element);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(onMouseEnter).toHaveBeenCalledTimes(1);
        expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('renames an entity from compact edit mode', async () => {
        const user = userEvent.setup();
        const onRename = vi.fn().mockResolvedValue(undefined);
        render(<EntityRow {...baseProps} onRename={onRename} />);

        await user.click(screen.getByText('Alice'));
        const input = screen.getByDisplayValue('Alice');
        await user.clear(input);
        await user.type(input, 'Alicia{Enter}');

        await waitFor(() => {
            expect(onRename).toHaveBeenCalledWith('Alice', 'Alicia');
        });
        expect(screen.queryByDisplayValue('Alicia')).not.toBeInTheDocument();
    });

    it('cancels compact edit mode without renaming', async () => {
        const user = userEvent.setup();
        const onRename = vi.fn().mockResolvedValue(undefined);
        render(<EntityRow {...baseProps} onRename={onRename} />);

        await user.click(screen.getByText('Alice'));
        await user.clear(screen.getByDisplayValue('Alice'));
        await user.type(screen.getByRole('textbox'), 'Changed');
        const editControls = screen.getByDisplayValue('Changed').parentElement as HTMLElement;
        await user.click(editControls.querySelectorAll('button')[1]);

        expect(onRename).not.toHaveBeenCalled();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('confirms deletion when the entity has an id', async () => {
        const user = userEvent.setup();
        const onDelete = vi.fn().mockResolvedValue(undefined);
        render(<EntityRow {...baseProps} onDelete={onDelete} />);

        await user.click(screen.getByTitle('Delete entity'));
        await user.click(screen.getAllByRole('button', { name: /delete/i }).at(-1) as HTMLElement);

        expect(onDelete).toHaveBeenCalledWith(7, 'Alice');
    });

    it('cancels compact deletion without calling delete', async () => {
        const user = userEvent.setup();
        const onDelete = vi.fn().mockResolvedValue(undefined);
        render(<EntityRow {...baseProps} onDelete={onDelete} />);

        await user.click(screen.getByTitle('Delete entity'));
        await user.click(screen.getByRole('button', { name: /cancel/i }));

        expect(onDelete).not.toHaveBeenCalled();
        expect(screen.queryByText(/are you sure you want to delete/i)).not.toBeInTheDocument();
    });

    it('renders card variant metadata and ignores unchanged rename submissions', async () => {
        const user = userEvent.setup();
        const onRename = vi.fn().mockResolvedValue(undefined);
        render(
            <EntityRow
                {...baseProps}
                ent={{ id: 8, type: 'pet', name: 'Milo' }}
                onRename={onRename}
                variant="card"
            />,
        );

        expect(screen.getByText('Milo')).toBeInTheDocument();
        expect(screen.getByText('pet')).toBeInTheDocument();

        await user.click(screen.getByText('Milo'));
        await user.keyboard('{Enter}');

        expect(onRename).not.toHaveBeenCalled();
        expect(screen.getByText('Milo')).toBeInTheDocument();
    });
});
