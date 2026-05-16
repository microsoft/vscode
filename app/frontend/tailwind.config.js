/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // VS Code inspired dark theme
        bg: {
          primary: '#1e1e2e',
          secondary: '#181825',
          tertiary: '#11111b',
          hover: '#313244',
          active: '#45475a',
        },
        text: {
          primary: '#cdd6f4',
          secondary: '#a6adc8',
          muted: '#6c7086',
          accent: '#89b4fa',
        },
        border: {
          primary: '#313244',
          secondary: '#45475a',
        },
        accent: {
          blue: '#89b4fa',
          green: '#a6e3a1',
          red: '#f38ba8',
          yellow: '#f9e2af',
          purple: '#cba6f7',
          teal: '#94e2d5',
          orange: '#fab387',
        },
        sidebar: {
          bg: '#181825',
          hover: '#313244',
          active: '#45475a',
        },
        editor: {
          bg: '#1e1e2e',
          line: '#313244',
          selection: '#45475a',
        },
        terminal: {
          bg: '#11111b',
        },
        tab: {
          active: '#1e1e2e',
          inactive: '#181825',
          border: '#313244',
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "'Cascadia Code'", 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xxs: '0.65rem',
      },
    },
  },
  plugins: [],
};
