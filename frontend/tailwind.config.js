/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Legacy aliases kept so existing className="bg-background ..." continue to work.
                background: 'var(--bg-body)',
                surface: 'var(--bg-surface)',
                panel: 'var(--bg-panel)',
                // Tagging colours to CSS variables for dynamic theming
                primary: 'var(--color-primary)',
                secondary: 'var(--color-secondary)',
                textMain: 'var(--text-main)',
                textMuted: 'var(--text-muted)',
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                serif: ['Georgia', 'ui-serif', 'serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
            },
        },
    },
    plugins: [],
}
