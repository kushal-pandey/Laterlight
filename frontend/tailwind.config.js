/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#f8f5f1',
        midnight: '#0a1d2b',
        teal: '#5ea9a1',
        amber: '#e9b35d',
      },
      boxShadow: {
        soft: '0 18px 32px rgba(10, 29, 43, 0.08)',
      },
    },
  },
  plugins: [],
}
