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
