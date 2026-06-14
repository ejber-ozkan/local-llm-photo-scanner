import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers between tests so one test doesn't affect another
afterEach(() => {
    cleanup();
    server.resetHandlers();
});

// Clean up after all tests
afterAll(() => server.close());

// Mock IntersectionObserver globally in tests to immediately trigger visibility
class GlobalMockIntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = '0px';
    readonly thresholds: readonly number[] = [0];
    callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
    }

    observe(element: Element) {
        if (this.callback) {
            this.callback(
                [{ isIntersecting: true, target: element } as unknown as IntersectionObserverEntry],
                this as unknown as IntersectionObserver
            );
        }
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
}
globalThis.IntersectionObserver = GlobalMockIntersectionObserver as typeof IntersectionObserver;

class GlobalMockResizeObserver {
    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
    }

    observe(element: Element) {
        this.callback(
            [{ target: element, contentRect: { width: 1024, height: 720 } } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
        );
    }

    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = GlobalMockResizeObserver as typeof ResizeObserver;
