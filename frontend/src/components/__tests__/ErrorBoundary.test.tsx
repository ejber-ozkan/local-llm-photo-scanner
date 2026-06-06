import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../ErrorBoundary';

function BrokenChild(): ReactElement {
    throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders children when no error is thrown', () => {
        render(
            <ErrorBoundary>
                <div>Healthy child</div>
            </ErrorBoundary>,
        );

        expect(screen.getByText('Healthy child')).toBeInTheDocument();
    });

    it('renders a fallback with error details when a child crashes', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <ErrorBoundary>
                <BrokenChild />
            </ErrorBoundary>,
        );

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
        expect(screen.getByText('render exploded')).toBeInTheDocument();
    });

    it('offers a refresh action from the fallback', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const reload = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, reload },
        });

        render(
            <ErrorBoundary>
                <BrokenChild />
            </ErrorBoundary>,
        );
        fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
