# Theme Customization

This guide explains how to customize the visual appearance of the Autonomous Coding Agent platform's React frontend, which uses Tailwind CSS. Customization includes layouts, color schemes (supporting light/dark modes), component styling, and creating custom themes.

## Overview

The platform's frontend is designed to be themable using a combination of CSS Custom Properties (Variables) and Tailwind CSS's configuration capabilities. This allows for:
*   Dynamic changes to colors, fonts, and spacing.
*   Support for light, dark, and potentially other custom themes.
*   Consistent styling across UI components built with Tailwind CSS and headless UI primitives (like Headless UI or Radix UI).

## Key Theming Concepts with Tailwind CSS

### 1. CSS Custom Properties for Dynamic Theming
While Tailwind CSS primarily uses utility classes, CSS Custom Properties (variables) are invaluable for dynamic theming, especially for colors that change with light/dark mode.

**a. Defining Theme Variables:**
   Define your core theme variables in your global CSS file (e.g., `src/index.css` or `src/styles/globals.css`).
   ```css
   /* src/index.css or src/styles/globals.css */
   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   @layer base {
     :root {
       /* Light Theme (Default) */
       --color-primary: 259 94% 51%; /* HSL format for Tailwind opacity modifiers: oklch(59% 0.22 277) */
       --color-secondary: 220 88% 47%;
       --color-accent: 30 95% 52%;

       --color-background: 0 0% 100%;       /* e.g., white */
       --color-foreground: 222 47% 11%;    /* e.g., near black for text */
       --color-surface: 0 0% 96%;          /* e.g., light gray for cards/surfaces */
       --color-surface-foreground: 222 47% 11%;
       --color-border: 214 32% 91%;

       --font-family-sans: 'Inter', sans-serif; /* Example font */
       --font-family-mono: 'JetBrains Mono', monospace;

       --radius: 0.5rem; /* Example border radius */
     }

     .dark {
       /* Dark Theme Overrides */
       --color-primary: 259 90% 60%;
       --color-secondary: 220 80% 55%;
       --color-accent: 30 90% 60%;

       --color-background: 222 47% 11%;    /* e.g., near black */
       --color-foreground: 0 0% 98%;       /* e.g., near white for text */
       --color-surface: 222 47% 18%;       /* e.g., dark gray for cards/surfaces */
       --color-surface-foreground: 0 0% 98%;
       --color-border: 214 20% 25%;
     }
   }
   ```
   *Tip: Using HSL or OKLCH values for colors allows Tailwind's opacity modifiers (e.g., `bg-primary/50`) to work correctly with CSS variables.*

**b. Integrating CSS Variables with Tailwind CSS:**
   Extend Tailwind's theme in `tailwind.config.js` to use these CSS variables.
   ```javascript
   // tailwind.config.js
   /** @type {import('tailwindcss').Config} */
   module.exports = {
     darkMode: 'class', // Enable class-based dark mode
     content: [
       "./src/**/*.{js,jsx,ts,tsx}",
     ],
     theme: {
       extend: {
         colors: {
           primary: 'hsl(var(--color-primary) / <alpha-value>)',
           secondary: 'hsl(var(--color-secondary) / <alpha-value>)',
           accent: 'hsl(var(--color-accent) / <alpha-value>)',
           background: 'hsl(var(--color-background) / <alpha-value>)',
           foreground: 'hsl(var(--color-foreground) / <alpha-value>)',
           surface: { // For cards, sidebars etc.
             DEFAULT: 'hsl(var(--color-surface) / <alpha-value>)',
             foreground: 'hsl(var(--color-surface-foreground) / <alpha-value>)',
           },
           border: 'hsl(var(--color-border) / <alpha-value>)',
           // ... add more semantic color names as needed
         },
         fontFamily: {
           sans: ['var(--font-family-sans)', 'sans-serif'],
           mono: ['var(--font-family-mono)', 'monospace'],
         },
         borderRadius: {
           DEFAULT: 'var(--radius)',
           lg: `calc(var(--radius) * 1.5)`,
           sm: `calc(var(--radius) * 0.75)`,
         }
       },
     },
     plugins: [],
   };
   ```
   Now you can use classes like `bg-primary`, `text-foreground`, `border-border`, `font-sans`, `rounded-lg` in your React components, and they will respect the CSS variables.

### 2. Color Schemes (Light/Dark Mode Switching)
Tailwind's class-based dark mode (`darkMode: 'class'`) means adding a `.dark` class to a parent element (usually `<html>` or `<body>`) will apply the dark theme styles.

**a. Theme Toggling Logic (React Example using Zustand or Context):**
   You'll need a way to toggle the `.dark` class on the `<html>` element and persist the user's preference.

   **Example using a simple React Context and `localStorage`:**
   ```jsx
   // src/contexts/ThemeContext.js
   import React, { createContext, useContext, useEffect, useState } from 'react';

   const ThemeContext = createContext();

   export const ThemeProvider = ({ children }) => {
     const [theme, setTheme] = useState(() => {
       if (typeof window !== 'undefined') {
         const savedTheme = localStorage.getItem('theme');
         if (savedTheme) return savedTheme;
         return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
       }
       return 'light'; // Default for SSR or non-browser env
     });

     useEffect(() => {
       const root = window.document.documentElement;
       root.classList.remove(theme === 'dark' ? 'light' : 'dark');
       root.classList.add(theme);
       localStorage.setItem('theme', theme);
     }, [theme]);

     const toggleTheme = () => {
       setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
     };

     return (
       <ThemeContext.Provider value={{ theme, toggleTheme }}>
         {children}
       </ThemeContext.Provider>
     );
   };

   export const useTheme = () => useContext(ThemeContext);
   ```
   Wrap your application with `ThemeProvider` in `src/App.js` or `src/index.js`:
   ```jsx
   // src/App.js
   // import { ThemeProvider } from './contexts/ThemeContext';
   // function App() { return <ThemeProvider> {/* ... your app ... */} </ThemeProvider>; }
   ```
   Use `useTheme` in a component to create a theme toggle button:
   ```jsx
   // src/components/ThemeToggleButton.js
   // import { useTheme } from '../contexts/ThemeContext';
   // const ThemeToggleButton = () => {
   //   const { theme, toggleTheme } = useTheme();
   //   return <button onClick={toggleTheme}>Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode</button>;
   // };
   ```

### 3. Layouts
Page layouts (e.g., main content area, sidebar, header, footer) are typically React components.
*   **Modifying Existing Layouts:** Locate layout components (e.g., in `src/layouts/` or `src/components/layout/`). You can modify their structure and styling using Tailwind utility classes.
    *   Example: `src/components/layout/AppLayout.jsx` might define a sidebar and main content area using Flexbox or Grid utilities from Tailwind.
*   **Creating New Layouts:** Create new React components for different page structures and apply them conditionally via your routing setup (e.g., React Router).

### 4. Component Styling
Individual UI components (often built using Headless UI or Radix UI and styled with Tailwind CSS) will automatically adapt to theme changes if they use the theme-aware utility classes (e.g., `bg-surface`, `text-foreground`).
*   **Customizing Base Component Styles:** You can define base styles for elements like buttons or inputs in your global CSS file within the `@layer components` directive if needed, using Tailwind's `@apply` or by styling HTML elements directly.
    ```css
    /* src/index.css or src/styles/globals.css */
    @layer components {
      .btn-primary {
        @apply bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-DEFAULT;
      }
      /* ... other custom component base styles ... */
    }
    ```
*   **Overriding Specific Instances:** Use Tailwind's utility classes directly on component instances for one-off style changes.

## Creating a New Custom Theme (e.g., "Oceanic Blue")

If you want to introduce an entirely new theme beyond just light/dark variations of the default, you can define another set of CSS variables.

1.  **Define New Theme CSS Variables:**
    In your global CSS file (e.g., `src/index.css`), add another class scope:
    ```css
    /* src/index.css */
    /* ... existing :root and .dark styles ... */

    .theme-oceanic { /* Or use data-theme="oceanic" attribute */
      --color-primary: 198 80% 50%; /* Example: Oceanic Blue Primary */
      --color-secondary: 180 60% 45%;
      --color-accent: 45 85% 55%;

      --color-background: 200 50% 95%;    /* Light blueish background */
      --color-foreground: 210 30% 20%;    /* Dark blue text */
      --color-surface: 200 50% 100%;      /* White surface */
      --color-surface-foreground: 210 30% 20%;
      --color-border: 198 40% 80%;

      /* You might also change font or radius for this theme */
      /* --font-family-sans: 'Georgia', serif; */
      /* --radius: 0.25rem; */
    }
    ```

2.  **Update Theme Switching Logic:**
    Modify your theme context/store (e.g., `ThemeContext.js`) to support more themes:
    ```jsx
    // src/contexts/ThemeContext.js (modified example)
    // ...
    // const [theme, setTheme] = useState('light'); // Default or from localStorage
    // const availableThemes = ['light', 'dark', 'oceanic'];

    // const cycleTheme = () => {
    //   const currentIndex = availableThemes.indexOf(theme);
    //   const nextIndex = (currentIndex + 1) % availableThemes.length;
    //   setTheme(availableThemes[nextIndex]);
    // };

    // useEffect(() => {
    //   const root = window.document.documentElement;
    //   availableThemes.forEach(t => root.classList.remove(t === 'dark' ? t : `theme-${t}`)); // Clear previous theme classes
    //   if (theme === 'dark') {
    //     root.classList.add('dark');
    //   } else if (theme !== 'light') { // For custom themes like 'oceanic'
    //     root.classList.add(`theme-${theme}`);
    //   }
    //   localStorage.setItem('theme', theme);
    // }, [theme, availableThemes]);
    // ...
    ```
    *Note: The class application logic needs to be robust. Tailwind's `darkMode: 'class'` handles `.dark` specifically. For other themes, you'd apply a class like `.theme-oceanic` to the `<html>` tag.*
    *If you use a `data-theme` attribute selector like `[data-theme="oceanic"]` in CSS, then your JS would do `document.documentElement.setAttribute('data-theme', 'oceanic')`.*

3.  **Tailwind Configuration:** Your `tailwind.config.js` already uses CSS variables, so it should automatically pick up the new values when the `.theme-oceanic` class (or `data-theme` attribute) is active on the `html` tag.

## Best Practices for Theming with Tailwind CSS

*   **Leverage CSS Variables:** For properties that need to change dynamically (especially colors for light/dark/custom themes), define them as CSS variables and reference them in `tailwind.config.js`.
*   **Use Semantic Color Names in Tailwind Config:** Define colors like `primary`, `secondary`, `surface`, `foreground` in `tailwind.config.js` that map to your CSS variables. This makes your utility classes more meaningful (e.g., `bg-primary` instead of `bg-blue-500`).
*   **Keep `tailwind.config.js` as the Single Source of Truth for Static Theme Values:** For fonts, spacing, breakpoints, etc., that don't change per theme, define them directly in `tailwind.config.js`.
*   **Minimize Custom CSS:** Stick to utility classes as much as possible. Use `@apply` or custom components in global CSS sparingly for complex, reusable component patterns.
*   **Accessibility:** Always check color contrast ratios for your themes to ensure readability (WCAG guidelines). Tools like the "Accessibility Insights for Web" browser extension can help.
*   **Purging:** Ensure Tailwind CSS's JIT compiler and purging are correctly configured to only include used styles in the production build, keeping file sizes small. Your `content` array in `tailwind.config.js` is key for this.

## File Structure Example (React + Tailwind)

```
src/
├── components/
│   ├── ui/                     # Reusable UI components (buttons, cards, etc.)
│   │   └── Button.jsx
│   └── layout/
│       └── AppLayout.jsx
├── contexts/                   # React Contexts
│   └── ThemeContext.js
├── styles/
│   └── globals.css             # Main CSS file with @tailwind directives and CSS variables
├── pages/ or views/            # Page components
├── App.js                      # Main application component (where ThemeProvider wraps)
├── index.js                    # Entry point
└── tailwind.config.js          # Tailwind CSS configuration
```

By using CSS variables in conjunction with Tailwind CSS's configuration, you can create a powerful and flexible theming system for your React-based Autonomous Coding Agent platform.
