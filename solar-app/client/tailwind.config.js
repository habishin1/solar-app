/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Light "studio" chrome
        paper: '#F4F6F9',       // page background (cool light neutral)
        card: '#FFFFFF',        // raised surfaces
        cardSub: '#FAFBFC',     // subtle inset panels
        ink: '#15181E',         // primary text
        ash: '#565D6B',         // secondary text
        mist: '#8B92A0',        // muted / hints
        hair: '#E4E8EE',        // hairline borders
        hairStrong: '#D2D8E1',  // emphasized borders

        // Dark viewport (where the 3D model lives)
        viewport: '#0D1520',
        viewportEdge: '#1A2634',

        // Brand: solar amber — the single bold accent
        solar: '#F59E0B',
        solarBright: '#FBBF24',
        solarDeep: '#B45309',   // text on amber tints
        solarWash: '#FEF3E2',   // amber tint backgrounds
      },
      fontFamily: {
        display: ['Archivo', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,24,30,0.04), 0 1px 3px rgba(21,24,30,0.06)',
        lift: '0 8px 30px rgba(21,24,30,0.12)',
      },
    },
  },
  plugins: [],
};
