/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Vivid violet — the primary colour of the board-canvas look
        brand: {
          50: '#f6f1ff',
          100: '#ece2ff',
          200: '#dac6ff',
          300: '#bf9cff',
          400: '#a26cfb',
          500: '#8b42f8',
          600: '#7b2ff7',
          700: '#6a1fdc',
          800: '#5618b3',
          900: '#41128a',
        },
        // Sticky-note accents
        sun: { 50: '#fffbea', 100: '#fff4c2', 200: '#ffe98a', 400: '#ffd84d', 500: '#fcc419', 700: '#a16207' },
        bubble: { 50: '#fff0f9', 100: '#ffe1f3', 200: '#ffc2e7', 400: '#f472c6', 500: '#f25ab8', 700: '#be1f86' },
        sky2: { 50: '#effaff', 100: '#ddf3ff', 200: '#b8e6ff', 400: '#5cc6f7', 500: '#3db8f5', 700: '#0a73a8' },
        mint: { 50: '#ecfdf8', 100: '#d4faf0', 200: '#a8f3df', 400: '#3ee6c5', 500: '#19d3b0', 700: '#0d7f6b' },
        ink: '#17172b',
        canvas: '#f5f5f1',
      },
      boxShadow: {
        note: '0 1px 0 rgba(23,23,43,0.04), 0 8px 20px -12px rgba(23,23,43,0.18)',
        pop: '0 12px 32px -12px rgba(123,47,247,0.45)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'splash-in': 'splashIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
        // Scale only, so the logo is never left semi-transparent if animations are throttled
        splashIn: { from: { transform: 'scale(0.96)' }, to: { transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};
