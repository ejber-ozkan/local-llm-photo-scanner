/**
 * Date formatting utilities for parsing EXIF date strings.
 * Extracted from Gallery.tsx for reuse and testability.
 */

/** Parse EXIF date string (e.g. "YYYY:MM:DD HH:MM:SS") to a human-readable label. */
export function formatDateGroup(dateTaken: string | undefined): string {
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

/** Extract the 4-digit year from an EXIF date string. */
export function getYearFromDate(dateTaken: string | undefined): string {
    if (!dateTaken) return '';
    return dateTaken.substring(0, 4);
}
