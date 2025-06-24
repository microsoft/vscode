# Theme Customization

This guide explains how to customize the visual appearance of the platform's front-end, including layouts, color schemes (supporting light/dark modes), component styling, and creating custom themes.

[**Note:** The specifics of theme customization heavily depend on the front-end framework (e.g., React, Angular, Vue.js) and styling solution (e.g., CSS-in-JS, Tailwind CSS, SASS, CSS Variables) used by your platform. The following is a general template; you'll need to replace bracketed placeholders with actual implementation details.]

## Overview

The platform's front-end is designed to be themable, allowing you to tailor its look and feel to match your branding or user preferences. The theming system typically involves:

*   **CSS Variables:** For dynamic and easily overridable style properties like colors, fonts, and spacing.
*   **Component Styling:** How individual UI components are styled and how these styles can be overridden or extended.
*   **Layout System:** How page structures are defined and can be modified.
*   **Theme Provider/Context:** (Common in React/Vue) A mechanism to inject theme information throughout the component tree.

## Key Theming Concepts

### 1. CSS Variables
The core of the theming system relies on CSS Custom Properties (Variables). These variables define the foundational style values.

**Example: Defining base color variables (e.g., in `src/styles/theme-variables.css` or a similar global stylesheet):**
```css
:root {
  /* Default (Light) Theme Variables */
  --color-primary: #007bff;
  --color-secondary: #6c757d;
  --color-background: #ffffff;
  --color-surface: #f8f9fa;
  --color-text-primary: #212529;
  --color-text-secondary: #495057;
  --font-family-base: 'Arial', sans-serif;
  --spacing-unit: 8px;
  /* ... other variables for borders, shadows, etc. */
}

[data-theme="dark"] {
  /* Dark Theme Overrides */
  --color-primary: #0d6efd; /* Slightly different primary for dark if needed */
  --color-secondary: #adb5bd;
  --color-background: #121212;
  --color-surface: #1e1e1e;
  --color-text-primary: #e0e0e0;
  --color-text-secondary: #a0a0a0;
  /* ... other dark theme overrides */
}
```

**Usage in components:**
```css
.my-component {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  padding: calc(var(--spacing-unit) * 2); /* 16px */
  border: 1px solid var(--color-primary);
}
```

### 2. Color Schemes (Light/Dark Mode)

The platform supports light and dark color schemes. This is typically managed by:
*   Applying a specific attribute (e.g., `data-theme="dark"`) to the `<html>` or `<body>` tag.
*   Using CSS variables that are redefined within the scope of that attribute (as shown above).
*   A JavaScript function to toggle the theme and persist the user's preference (e.g., in `localStorage`).

**Example JavaScript for theme toggling:**
```javascript
// src/theme-switcher.js (Simplified example)
function setTheme(themeName) {
  localStorage.setItem('theme', themeName);
  document.documentElement.setAttribute('data-theme', themeName);
}

function toggleTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    setTheme('light');
  } else {
    setTheme('dark');
  }
}

// Initialize theme based on saved preference or system preference
const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme) {
  setTheme(savedTheme);
} else if (prefersDark) {
  setTheme('dark');
} else {
  setTheme('light'); // Default to light
}

// Attach toggleTheme to a button or UI element
// document.getElementById('theme-toggle-button').addEventListener('click', toggleTheme);
```
[**Provide the actual path and code for your theme switching logic.**]

### 3. Layouts

Page layouts (e.g., main content area, sidebar, header, footer) can be customized by:
*   **Modifying Existing Layout Components:** [**Point to the directory where layout components are stored, e.g., `src/layouts/`. Explain their structure and props.**]
    *   For example, `src/layouts/MainLayout.vue` or `src/layouts/AppLayout.tsx`.
*   **Creating New Layout Components:** You can create entirely new layout components and apply them to specific routes or sections of the application.
    [**Explain how new layouts are registered or used, e.g., via the router configuration.**]

**Example (Conceptual):**
```javascript
// router.js (Vue Router example)
// import DefaultLayout from '@/layouts/DefaultLayout.vue';
// import MinimalLayout from '@/layouts/MinimalLayout.vue';

// const routes = [
//   { path: '/', component: HomePage, meta: { layout: DefaultLayout } },
//   { path: '/login', component: LoginPage, meta: { layout: MinimalLayout } },
// ];
```

### 4. Component Styling

Individual UI components are styled using [**Specify styling solution: e.g., CSS Modules, Styled Components, Tailwind CSS utility classes, SASS mixins/variables**].

*   **Overriding Styles:**
    *   **CSS Variables:** The easiest way to change component appearance globally is by overriding the CSS variables they consume.
    *   **CSS Specificity:** You can override component styles with more specific CSS selectors, but this should be done cautiously to avoid maintainability issues. [**Provide guidance or a utility class system if available.**]
    *   **Component Props:** Many components may accept style-related props (e.g., `variant`, `color`, `size`, `className`, `style`). [**Refer to component documentation or Storybook.**]
    *   **[Styling Solution Specifics]:**
        *   **Styled Components/Emotion:** Use `styled(ExistingComponent)` or the `css` prop.
        *   **Tailwind CSS:** Apply or override utility classes.
        *   **SASS/LESS:** Override SASS/LESS variables if the component library uses them.

**Example: Customizing a Button component**

If a button uses `var(--color-primary)` for its background:
```css
/* To change all primary buttons */
:root { /* or within a specific theme scope */
  --color-primary: #ff6347; /* Change to tomato red */
}
```

If the component allows passing a custom class:
```jsx
// <Button className="my-custom-button-style">Click Me</Button>
```
```css
/* And in your CSS: */
.my-custom-button-style {
  background-color: #ff6347 !important; /* Use !important sparingly */
  border-radius: 8px;
}
```

[**Provide specific examples for your platform's components and styling methods.**]

## Creating a Custom Theme

To create a completely new theme (e.g., "corporate-blue" or "forest-green"):

1.  **Define New CSS Variables:**
    Create a new CSS scope with your theme name, typically by defining styles for a `data-theme="your-theme-name"` attribute.

    **Example: `src/styles/themes/corporate-blue.css`**
    ```css
    [data-theme="corporate-blue"] {
      --color-primary: #00529b;
      --color-secondary: #0077cc;
      --color-background: #f0f4f8;
      --color-surface: #ffffff;
      --color-text-primary: #102a43;
      --color-text-secondary: #334e68;
      --font-family-base: 'Roboto', sans-serif; /* Example: different font */
      /* ... all other necessary theme variables ... */

      /* You might also need to override specific component styles here */
      /* if CSS variables are not sufficient. */
      /* .button-primary { ... } */
    }
    ```

2.  **Import the Theme Stylesheet:**
    Ensure this new CSS file is imported into your application's global styles.
    [**Specify how: e.g., in `main.js`, `App.vue`, `_app.tsx`, or a central CSS import file.**]

    ```css
    /* In your global styles aggregator, e.g., styles.css */
    @import './theme-variables.css'; /* Base and dark theme */
    @import './themes/corporate-blue.css'; /* Your new theme */
    /* ... other theme imports ... */
    ```

3.  **Update Theme Switching Logic:**
    Modify your JavaScript theme switcher to include the new theme name and allow users to select it.

    **Example (extending the previous `theme-switcher.js`):**
    ```javascript
    // ... (setTheme function remains the same) ...

    // In your UI, provide a way to select 'corporate-blue'
    // e.g., a dropdown that calls setTheme('corporate-blue')
    ```

4.  **(Optional) Override Component-Specific Styles:**
    If CSS variables are not enough, you might need to add more specific CSS rules within your theme's scope (`[data-theme="corporate-blue"] .some-component { ... }`) to adjust individual components that don't fully adapt through variables alone.

## Best Practices for Theming

*   **Prioritize CSS Variables:** Make as much of the theme configurable via CSS variables as possible. This provides the most straightforward way for users to customize.
*   **Maintain Consistency:** Ensure that theme changes are applied consistently across all components and parts of the application.
*   **Accessibility:** Pay attention to color contrast ratios and font choices to ensure your themes are accessible (WCAG guidelines). Test your themes with accessibility tools.
*   **Performance:** Avoid overly complex CSS selectors or excessive style overrides that could impact rendering performance.
*   **Documentation:** If you provide multiple pre-built themes or a complex theming API, document it clearly.
*   **Test Thoroughly:** Test all themes, including light/dark modes and custom themes, across different browsers and devices.

## File Structure for Theming (Example)

```
src/
├── styles/
│   ├── base.css                # Base styles, resets
│   ├── theme-variables.css     # Core CSS variables (light/dark)
│   ├── components/             # Component-specific base styles (if any)
│   │   ├── _button.css
│   │   └── _card.css
│   ├── themes/                 # Custom theme files
│   │   ├── corporate-blue.css
│   │   └── forest-green.css
│   └── index.css               # Main CSS entry point, imports all others
├── layouts/
│   ├── MainLayout.vue
│   └── MinimalLayout.vue
├── components/                 # UI Components
│   ├── Button.vue
│   └── Card.vue
├── theme-switcher.js           # JavaScript for managing theme state
└── main.js                     # Or App.vue, _app.tsx - where styles are imported
```
[**Adjust this file structure to match your project's conventions.**]

By following this guide and adapting the examples to your specific front-end stack, you should be able to effectively customize the platform's theme. Remember to consult the documentation of your chosen front-end framework and styling libraries for more detailed information.
