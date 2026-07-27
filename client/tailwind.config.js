/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Clean, slightly cool light base — reads modern/tech
        paper: '#F6F7FB',
        card: '#FFFFFF',
        cardSub: '#F8F9FC',
        ink: '#13151C',
        ash: '#565E70',
        mist: '#8A92A6',
        hair: '#E7EAF1',
        hairStrong: '#D6DBE6',

        // Dark viewport (unchanged — the 3D model lives here)
        viewport: '#0D1520',
        viewportEdge: '#1A2634',

        // Sunrise brand gradient stops + a solid mid for single-color use
        dawn1: '#FBA23C',
        dawn2: '#F76B4E',
        brand: '#F7853B',
        brandDeep: '#C2551F',
        brandWash: '#FFF1E7',

        // Cool electric accent for small modern pops (focus, links)
        volt: '#6366F1',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
        num: ['Sora', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.15rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(19,21,28,0.04), 0 4px 16px rgba(19,21,28,0.05)',
        lift: '0 12px 40px rgba(19,21,28,0.14)',
        glow: '0 6px 20px rgba(247,133,59,0.35)',
      },
      backgroundImage: {
        dawn: 'linear-gradient(135deg, #FBA23C 0%, #F76B4E 100%)',
      },
    },
  },
  plugins: [],
};
