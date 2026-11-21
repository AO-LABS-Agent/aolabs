/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        obsidian: '#070709',
        charcoal: '#0d0d11',
        graphite: '#16161c',
        ink: '#f4f4f5',
        ash: '#a1a1aa',
        muted: '#71717a',
      },
    },
  },
  plugins: [],
};
