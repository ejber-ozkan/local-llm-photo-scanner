/**
 * Unit tests for date formatting utilities used in Gallery.
 * These functions are currently defined inside Gallery.tsx — we test them
 * indirectly via the Gallery component, and will extract them in Phase 3.
 *
 * For now, we duplicate the logic here to unit-test the pure functions.
 */
import { describe, it, expect } from 'vitest';

// ── Copy of functions from Gallery.tsx (will be extracted in Phase 3) ──

function formatDateGroup(dateTaken: string | undefined): string {
    if (!dateTaken) return 'Unknown Date';
    try {
        const parts = dateTaken.replace(/:/g, '-').split(' ');
        const datePart = parts[0].replace(/-/g, ':').split(':');
        const d = new Date(parseInt(datePart[0]), parseInt(datePart[1]) - 1, parseInt(datePart[2]));
        if (isNaN(d.getTime())) return 'Unknown Date';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return 'Unknown Date';
    }
}

function getYearFromDate(dateTaken: string | undefined): string {
    if (!dateTaken) return '';
    return dateTaken.substring(0, 4);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('formatDateGroup', () => {
    it('formats a standard EXIF date string', () => {
        const result = formatDateGroup('2024:06:15 10:30:00');
        expect(result).toBe('15 June 2024');
    });

    it('formats a date at the start of a year', () => {
        const result = formatDateGroup('2023:01:01 00:00:00');
        expect(result).toBe('1 January 2023');
    });

    it('formats a date at end of year', () => {
        const result = formatDateGroup('2022:12:31 23:59:59');
        expect(result).toBe('31 December 2022');
    });

    it('returns "Unknown Date" for undefined', () => {
        expect(formatDateGroup(undefined)).toBe('Unknown Date');
    });

    it('returns "Unknown Date" for empty string', () => {
        expect(formatDateGroup('')).toBe('Unknown Date');
    });

    it('returns "Unknown Date" for malformed date', () => {
        expect(formatDateGroup('not-a-date')).toBe('Unknown Date');
    });
});

describe('getYearFromDate', () => {
    it('extracts year from EXIF date string', () => {
        expect(getYearFromDate('2024:06:15 10:30:00')).toBe('2024');
    });

    it('extracts year from date with different format', () => {
        expect(getYearFromDate('2023:01:01 00:00:00')).toBe('2023');
    });

    it('returns empty string for undefined', () => {
        expect(getYearFromDate(undefined)).toBe('');
    });

    it('returns first 4 chars for short input', () => {
        expect(getYearFromDate('2024')).toBe('2024');
    });
});
