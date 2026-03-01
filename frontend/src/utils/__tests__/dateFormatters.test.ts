/**
 * Unit tests for date formatting utilities.
 * Now imports from the extracted utils/dateFormatters module.
 */
import { describe, it, expect } from 'vitest';
import { formatDateGroup, getYearFromDate } from '../dateFormatters';

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
