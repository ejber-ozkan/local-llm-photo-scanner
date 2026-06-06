import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import LazyImage from '../LazyImage';

describe('LazyImage', () => {
    let intersectCallback: any;

    beforeEach(() => {
        class MockIntersectionObserver {
            observe = vi.fn();
            disconnect = vi.fn();
            constructor(callback: any) {
                intersectCallback = callback;
            }
        }
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    });

    it('renders placeholder initially and does not render img tag', () => {
        render(<LazyImage src="test.jpg" alt="test alt" />);
        expect(screen.getByTestId('lazy-image-placeholder')).toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders img tag when in view and triggers onLoad transition', () => {
        render(<LazyImage src="test.jpg" alt="test alt" />);
        
        // Simulate intersection
        act(() => {
            intersectCallback([{ isIntersecting: true }]);
        });

        const img = screen.getByRole('img');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'test.jpg');
        expect(img).toHaveAttribute('alt', 'test alt');
        
        // Initially opacity is 0 (has opacity-0 class)
        expect(img).toHaveClass('opacity-0');

        // Simulate image load
        fireEvent.load(img);

        // Placeholder is removed
        expect(screen.queryByTestId('lazy-image-placeholder')).not.toBeInTheDocument();
        // Image has opacity-100 class
        expect(img).toHaveClass('opacity-100');
    });

    it('falls back immediately if IntersectionObserver is not supported', () => {
        vi.stubGlobal('IntersectionObserver', undefined);
        render(<LazyImage src="test.jpg" alt="test alt" />);

        expect(screen.getByRole('img')).toBeInTheDocument();
    });
});
