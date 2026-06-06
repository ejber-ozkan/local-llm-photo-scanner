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
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
    }
}
globalThis.IntersectionObserver = GlobalMockIntersectionObserver as any;
