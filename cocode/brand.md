# CoCode Brand & Theme

## Brand Identity

**Name:** CoCode
**Tagline:** Collaborative Code, Together
**Mission:** Lightweight, focused, real-time collaboration for C, C++, and Python

## Color Palette

Inspired by `ui-theme-extract.md` - calm, minimal, technical precision.

### Light Theme

```css
--bg: #fafafb;              /* Off-white background */
--surface: #ffffff;          /* Pure white panels */
--surface-muted: rgba(15, 18, 22, 0.04);
--muted: #5a606b;            /* Medium gray text */
--text: #0f1216;             /* Near-black foreground */
--border: rgba(15, 18, 22, 0.12);
--accent-1: #5ea9ff;         /* Blue accent */
--accent-2: #79d6c3;         /* Teal accent */
```

### Dark Theme

```css
--bg: #0b0c0e;              /* Near-black background */
--surface: #111216;          /* Dark panel */
--surface-muted: rgba(231, 233, 236, 0.04);
--muted: #8a8f98;            /* Light gray text */
--text: #e7e9ec;             /* Off-white foreground */
--border: rgba(231, 233, 236, 0.12);
--accent-1: #6bc1ff;         /* Brighter blue */
--accent-2: #8affe0;         /* Brighter teal */
```

## Typography

- **Interface:** Inter (sans-serif)
- **Code/Monospace:** IBM Plex Mono
- **Emphasis:** Newsreader Italic (for Welcome page)

## Logo Concept

Simple wordmark: **CoCode**

- Font: IBM Plex Mono, Medium weight
- Colors: Gradient from `accent-1` to `accent-2`
- Style: Minimal, technical, modern

## UI Theme Principles

From `ui-theme-extract.md`:

1. **Calm Emergence:** Gentle fade-ins, no bounce/flash
2. **Tactile Minimalism:** Subtle shadows, rounded corners (1.5rem)
3. **Storytelling Motion:** Purposeful animations, respect reduced motion
4. **Readable First:** Max-width constraints, relaxed line height, high contrast

## Motion Design

- **Entrance:** `0.8s easeOut`, fade + 20px translate
- **Hover:** `0.2s`, subtle lift (-4px), scale 1.01
- **Ambient:** 4s loops, low opacity changes

## Component Styling

### Cards

```css
border-radius: 1.5rem;
border: 1px solid var(--border);
background: var(--surface);
box-shadow: 0 8px 30px rgba(0,0,0,0.12);
```

### Buttons

```css
border-radius: 9999px; /* Full rounded */
padding: 0.5rem 1rem;
border: 1px solid var(--border);
transition: all 200ms;
```

```css
/* Hover */
border-color: var(--accent-1);
color: var(--accent-1);
box-shadow: 0 4px 12px rgba(94, 169, 255, 0.2);
```

### Cursor Colors (Collaboration)

Use palette from `colors.ts`:

```javascript
const COLOR_PALETTE = [
  '#5ea9ff', // Blue (accent-1)
  '#79d6c3', // Teal (accent-2)
  '#ff6b6b', // Red
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#10b981', // Green
  '#f97316', // Orange
];
```

## Welcome Page Content

### Hero Section

**Title (Italic):**
_"Write code. Together. Simply."_

**Subtitle:**
CoCode is a collaborative web IDE focused on C, C++, and Python. Real-time editing, built-in compilation, and zero distractions.

### Features

- **Real-time Collaboration:** See cursors, edits, and presence instantly
- **Built-in Build Tools:** CMake, Make, GCC/Clang, Python 3
- **Focused Languages:** Only C, C++, Python – nothing else
- **OAuth Login:** Sign in with GitHub or Google

### Call-to-Action

**Button:** "Get Started" → Opens workspace
**Secondary:** "View Examples" → Opens `/examples` folder

## Status Bar Branding

Add subtle branding to VS Code status bar:

```
CoCode • Collaboration: Connected (3)
```

- **CoCode:** Logo text (gradient or accent-1)
- **Collaboration:** Status indicator
- **Count:** Number of active users in current file

## Welcome Extension UI

- **Layout:** Single-page, centered, max-width 800px
- **Background:** Radial gradients (subtle accent-1/accent-2)
- **Typography:** IBM Plex Mono for headers, Inter for body
- **Buttons:** Rounded, outlined, hover glow (accent-1)
- **Motion:** Fade in on load, hover lift on buttons

## Inspiration References

- Design DNA: `ui-theme-extract.md`
- Color system: Muted, dual-accent gradient
- Motion: Calm, purposeful, `0.8s easeOut`
- Spacing: `gap-8`, `gap-12` for major sections

---

**Note for Developers:**
When implementing the Welcome extension, read tokens from this file programmatically. Parse the CSS variables and apply them to the custom webview.
