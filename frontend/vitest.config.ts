import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        css: true,
        testTimeout: 10_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/test/**',
                'src/**/*.test.{ts,tsx}',
                'src/main.tsx',
                'src/types.ts',
                'src/**/*.d.ts',
                'src/assets/**',
            ],
            thresholds: {
                lines: 85,
                statements: 83,
                functions: 79,
                branches: 76,
            },
        },
    },
});
