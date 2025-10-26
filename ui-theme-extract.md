# UI/UX Design Language Extract

> **Extracted from:** Muneeb Hassan Personal Portfolio  
> **Stack:** Next.js 14, Tailwind CSS, Framer Motion, next-themes  
> **Philosophy:** Calm emergence, tactile minimalism, storytelling through motion

---

## Overview

This design system prioritizes **quiet sophistication** over flashy interactions. Every motion is intentional, every color choice serves readability and mood, and every spacing decision creates breathing room for content. The aesthetic balances **technical precision** (monospace headers, structured metrics) with **poetic reflection** (italic Newsreader for emphasis, first-person narrative).

The system is built for **light/dark mode fluidity**, ensuring each theme maintains its distinct character while sharing a unified visual DNA. Motion is storytelling—not decoration—creating a sense of **gentle revelation** as users scroll and interact.

---

## Design DNA Summary

| Category | Key Values |
|----------|-----------|
| **Typography** | Inter (body), IBM Plex Mono (headers/labels), Newsreader Italic (emphasis) |
| **Color Philosophy** | Muted foreground, subtle borders, dual accents (blue/teal gradient), low-contrast surfaces |
| **Motion Timing** | `0.8s easeOut` for content, `0.2s` for interactions, `4s linear` for ambient loops |
| **Spacing Rhythm** | `space-y-8` for sections, `gap-12` for major divisions, `max-w-3xl` for readable text blocks |
| **Surface Hierarchy** | Layered surfaces with `border-subtle`, `bg-surface/80` translucency, `rounded-[1.5rem]` to `rounded-[2.75rem]` |
| **Interaction Feedback** | Hover underlines via gradient, `scale-[1.01]`, `y: -4px` lift, opacity transitions |
| **Theme Transition** | Instant class swap, no CSS transitions, preload script prevents flash |

---

## 1. Visual System

### Typography

```typescript
// Font Stack (Next.js Google Fonts)
const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-sans', 
  display: 'swap' 
});

const plex = IBM_Plex_Mono({ 
  subsets: ['latin'], 
  weight: ['300', '400', '500', '600'], 
  variable: '--font-mono', 
  display: 'swap' 
});

const newsreader = Newsreader({ 
  subsets: ['latin'], 
  weight: ['400'], 
  style: ['italic'], 
  variable: '--font-newsreader', 
  display: 'swap' 
});
```

**Usage Patterns:**
- **Body text:** `font-sans` (Inter), `text-base` or `text-lg`, `text-muted` or `text-muted/80`
- **Headers:** `text-2xl sm:text-3xl`, `font-semibold`, `tracking-tight`
- **Labels/Metadata:** `font-mono`, `text-xs uppercase`, `tracking-[0.3em]`, `text-muted`
- **Emphasis/Voice:** `font-newsreader italic`, inline within paragraphs for rhythmic pauses

```tsx
// Example: Section Header Pattern
<header className="flex flex-col gap-2">
  <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
    Experience
  </p>
  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
    Work
  </h2>
</header>
```

### Color Palette

**CSS Variables (Light/Dark)**

```css
:root {
  --bg: #fafafb;              /* Off-white background */
  --surface: #ffffff;          /* Pure white panels */
  --surface-muted: rgba(15, 18, 22, 0.04);
  --muted: #5a606b;            /* Medium gray text */
  --text: #0f1216;             /* Near-black foreground */
  --border: rgba(15, 18, 22, 0.12);
  --acc1: #5ea9ff;             /* Blue accent */
  --acc2: #79d6c3;             /* Teal accent */
}

.dark {
  --bg: #0b0c0e;              /* Near-black background */
  --surface: #111216;          /* Dark panel */
  --surface-muted: rgba(231, 233, 236, 0.04);
  --muted: #8a8f98;            /* Light gray text */
  --text: #e7e9ec;             /* Off-white foreground */
  --border: rgba(231, 233, 236, 0.12);
  --acc1: #6bc1ff;             /* Brighter blue */
  --acc2: #8affe0;             /* Brighter teal */
}
```

**Tailwind Tokens:**

```typescript
// tailwind.config.ts
colors: {
  background: 'var(--bg)',
  surface: 'var(--surface)',
  muted: 'var(--muted)',
  foreground: 'var(--text)',
  border: 'var(--border)',
  accent: {
    1: 'var(--acc1)',
    2: 'var(--acc2)'
  }
}
```

**Usage Philosophy:**
- `text-muted` for secondary content, `text-muted/80` for tertiary
- `text-foreground` for emphasis, `hover:text-accent-1` for interactive feedback
- Dual accents create gradient energy: `from-accent-1 to-accent-2`
- Borders stay subtle: `border-subtle` (12% opacity), `hover:border-accent-1` for focus

### Backgrounds & Texture

**Radial Gradients:**

```css
body {
  background: 
    radial-gradient(circle at 15% 10%, rgba(121, 214, 195, 0.08), transparent 45%),
    radial-gradient(circle at 80% 0%, rgba(94, 169, 255, 0.08), transparent 50%), 
    var(--bg);
}
```

**Noise Grain:**

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,..."); /* SVG fractal noise */
  background-size: 300px;
  mix-blend-mode: soft-light;
  opacity: 0.5;
}
```

**Hero Glow:**

```tsx
// Hero section overlay
<motion.div
  className="pointer-events-none absolute inset-x-0 top-0 h-[120%] -translate-y-1/4 
    bg-[radial-gradient(circle_at_top,_rgba(107,193,255,0.2),_transparent_70%)]"
  style={{ y: translateY }} // Parallax on scroll
/>
```

### Surface Design

**Card Pattern:**

```tsx
<div className="rounded-[1.5rem] border border-subtle bg-surface/80 p-6 
  shadow-[0_8px_30px_rgb(0,0,0,0.12)] 
  transition-all duration-300 
  hover:shadow-[0_16px_40px_rgb(0,0,0,0.16)] hover:border-accent-1/20">
  {/* Content */}
</div>
```

**Hero Container:**

```tsx
<div className="relative overflow-hidden rounded-[2.75rem] border border-subtle 
  bg-surface/80 p-8 sm:p-12">
  <HeroBackground />
  {/* Layered content */}
</div>
```

**Modal Surface:**

```tsx
<motion.div className="bg-surface/95 backdrop-blur-xl border border-subtle 
  rounded-[2rem] p-8 shadow-[0_32px_64px_rgb(0,0,0,0.2)]">
  {/* Modal content */}
</motion.div>
```

---

## 2. Motion System

### Framer Motion Philosophy

- **No bounce:** All easing uses `easeOut` or `linear` for ambient loops
- **Staggered reveals:** Content fades in with `y: 20` offset, `0.8s` duration
- **Respect reduced motion:** Check `useReducedMotion()` and skip animations
- **Parallax subtlety:** Hero glow moves at `-60px` max via `useTransform`

### Entrance Animations

**Content Fade-In:**

```tsx
<motion.div
  initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: 'easeOut' }}
>
  {/* Content */}
</motion.div>
```

**Hero Staggered Reveal:**

```tsx
// Title
<motion.h1
  initial={{ opacity: 0, y: 40 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.7, ease: 'easeOut' }}
>

// Subtitle (delayed)
<motion.div
  initial={{ opacity: 0, y: 24 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.15, duration: 0.6, ease: 'easeOut' }}
>

// Scroll indicator (further delayed)
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
>
```

### Interaction Feedback

**Card Hover:**

```tsx
<motion.div
  whileHover={{ y: -4, scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
  className="cursor-pointer"
>
```

**Link Underline Animation:**

```css
a::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -2px;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, var(--acc1), var(--acc2));
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 200ms ease;
}

a:hover::after {
  transform: scaleX(1);
}
```

**Button Hover:**

```tsx
<a className="inline-flex items-center gap-2 rounded-full border border-subtle 
  bg-surface px-4 py-2.5 text-sm font-medium 
  transition-all duration-200 
  hover:border-accent-1 hover:text-accent-1 hover:shadow-md">
```

### Ambient Animations

**Vinyl Spin (Spotify Now Playing):**

```tsx
<motion.div
  animate={prefersReducedMotion ? {} : { rotate: 360 }}
  transition={{
    duration: 4,
    repeat: Infinity,
    ease: 'linear',
  }}
  style={{ opacity: isPlaying ? 1 : 0.5 }}
>
  {/* SVG vinyl record */}
</motion.div>
```

**Shimmer Pulse:**

```tsx
// Vinyl highlight reflection
<motion.path
  animate={{ opacity: [0.15, 0.35, 0.15] }}
  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
  stroke="white"
  opacity="0.2"
/>
```

**Bounce Loop (Scroll Indicator):**

```tsx
<motion.div
  animate={{
    y: prefersReducedMotion ? 0 : [0, 8, 0],
  }}
  transition={{
    duration: 2,
    repeat: Infinity,
    repeatType: 'loop',
    ease: 'easeInOut',
  }}
>
  <ChevronDown className="h-6 w-6" />
</motion.div>
```

### Modal/Overlay Transitions

**Modal Entrance:**

```tsx
// Backdrop
<motion.div
  initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
  animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
  exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
  transition={{ duration: 0.25, ease: "easeOut" }}
  className="fixed inset-0 bg-background/80"
/>

// Modal content
<motion.div
  initial={{ opacity: 0, scale: 0.9, y: 40 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.9, y: 40 }}
  transition={{ 
    type: "spring", 
    damping: 25, 
    stiffness: 300,
    duration: 0.3
  }}
  className="relative max-w-5xl bg-surface/95 backdrop-blur-xl rounded-[2rem]"
>
```

### Parallax Scroll

```tsx
const { scrollYProgress } = useScroll({ 
  target: containerRef, 
  offset: ['start end', 'end start'] 
});

const translateY = useTransform(
  scrollYProgress, 
  [0, 1], 
  prefersReducedMotion ? [0, 0] : [0, -60]
);

<motion.div style={{ y: translateY }}>
  {/* Parallax element */}
</motion.div>
```

---

## 3. Interaction Patterns

### Cursor Halo

**Concept:** Subtle radial gradient follows cursor on pointer devices only (not touch).

```tsx
// Halo effect
<div
  style={{
    left: mousePosition.x,
    top: mousePosition.y,
    width: isHovering ? 80 : 50,
    height: isHovering ? 80 : 50,
    background: isDark 
      ? `radial-gradient(circle, rgba(107, 193, 255, ${isHovering ? '0.15' : '0.08'}) 0%, transparent 70%)`
      : `radial-gradient(circle, rgba(15, 18, 22, ${isHovering ? '0.12' : '0.06'}) 0%, transparent 70%)`,
    mixBlendMode: isDark ? 'screen' : 'multiply',
    transition: 'width 0.15s ease-out, height 0.15s ease-out',
  }}
/>
```

**Behavior:**
- Expands from 50px to 80px on hover over interactive elements
- Uses `screen` blend mode in dark, `multiply` in light
- Only renders on devices with `(pointer: fine)` (mouse/trackpad)

### Theme Toggle

**Icon Rotation:**

```tsx
const iconVariants = {
  enter: { opacity: 0, scale: 0.75, rotate: -12 },
  center: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.75, rotate: 12 }
};

<motion.div
  key={resolvedTheme}
  variants={prefersReducedMotion ? undefined : iconVariants}
  initial="enter"
  animate="center"
  exit="exit"
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  <Icon className="h-4 w-4" />
</motion.div>
```

**Button Style:**

```tsx
<button className="relative inline-flex h-10 w-10 items-center justify-center 
  overflow-hidden rounded-full border border-subtle bg-transparent 
  text-foreground transition 
  hover:border-accent-1 
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-1 
  focus-visible:ring-offset-2 focus-visible:ring-offset-background">
```

### Smooth Scroll Navigation

```tsx
const handleScrollToSection = (sectionId: string) => {
  const element = document.querySelector(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
```

### Scrollbar Styling

**Glassy Minimal Scrollbar:**

```css
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(107, 193, 255, 0.2);
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: padding-box;
  backdrop-filter: blur(10px);
  transition: background 200ms ease;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 193, 255, 0.35);
}
```

---

## 4. Text & Tone

### Writing Philosophy

- **First-person narrative:** "I'm drawn to...", "Lately, I've been..."
- **Reflective, not boastful:** Focus on learning and process over achievements
- **Technical precision balanced with poetry:** Metrics + metaphors
- **Italic emphasis for voice pauses:** `<em>time and experience will carve naturally as a niche forms.</em>`

### Content Hierarchy

1. **Hero:** Bold statement in italic Newsreader, followed by technical context
2. **Work/Projects:** Structured with metadata (timeline, role), metrics, summaries
3. **Now:** Long-form reflection + ambient data (Spotify integration)
4. **Connect:** Minimal call-to-action with contact options

### Metadata Patterns

**Project Cards:**

```tsx
<span className="inline-flex items-center gap-1.5 rounded-full 
  bg-surface-muted px-2.5 py-1 
  font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
  {tag}
</span>
```

**Section Labels:**

```tsx
<p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
  Experience
</p>
```

**Timestamps:**

```tsx
<span className="text-sm font-mono text-muted">
  {timeframe}
</span>
```

---

## 5. Component Hierarchy

### Layout Structure

```tsx
<main className="flex flex-1 flex-col gap-12">
  <Hero />
  <section id="work" className="space-y-8">...</section>
  <ProjectsCarousel />
  <Now />
  <section id="connect" className="space-y-8">...</section>
  <FooterClock />
</main>
```

**Spacing:**
- Major sections: `gap-12`
- Within sections: `space-y-8`
- Subsections: `space-y-6` or `space-y-4`
- Text paragraphs: `space-y-4`

### Section Anatomy

```tsx
<section className="space-y-8">
  {/* Header */}
  <header className="flex flex-col gap-2">
    <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
      Category
    </p>
    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
      Title
    </h2>
  </header>

  {/* Content */}
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8, ease: 'easeOut' }}
    className="space-y-6"
  >
    {/* Content blocks */}
  </motion.div>
</section>
```

### Card Patterns

**Project Card:**

```tsx
<motion.div
  whileHover={{ y: -4, scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  className="group relative overflow-hidden 
    rounded-[1.5rem] border border-subtle bg-surface/80 p-6 
    shadow-[0_8px_30px_rgb(0,0,0,0.12)] 
    transition-all duration-300 
    hover:shadow-[0_16px_40px_rgb(0,0,0,0.16)] 
    hover:border-accent-1/20 cursor-pointer"
>
  <div className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <h3 className="text-xl font-semibold text-foreground 
          group-hover:text-accent-1 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-muted mt-1">{summary}</p>
      </div>
      <ArrowUpRight className="h-5 w-5 text-muted 
        group-hover:text-accent-1 transition-colors" />
    </div>
    
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-surface-muted 
          px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em]">
          {tag}
        </span>
      ))}
    </div>
  </div>
</motion.div>
```

**Contact Button:**

```tsx
<a className="inline-flex items-center gap-2 
  rounded-full border border-subtle bg-surface px-4 py-2.5 
  text-sm font-medium 
  transition-all duration-200 
  hover:border-accent-1 hover:text-accent-1 hover:shadow-md">
  <IconComponent className="h-4 w-4" />
  {label}
</a>
```

---

## 6. Design Philosophy Notes

### Motion is Storytelling

- **Entrance animations** create the feeling of content "breathing into existence"
- **Parallax scrolling** adds depth without distracting from readability
- **Ambient loops** (vinyl spin, pulse) signal live data and activity
- **Hover feedback** is tactile—lift cards, scale links, shift colors

### Restraint Creates Focus

- **No bright colors** except accents on hover/focus
- **No sharp transitions**—everything eases gently
- **No clutter**—whitespace is structural, not empty
- **No animations for their own sake**—motion serves meaning

### Readable Above All

- **Text never smaller than `text-sm`** (except monospace metadata at `text-xs`)
- **Line height relaxed** (`leading-relaxed` on paragraphs)
- **Max width constrained** (`max-w-3xl` for prose blocks)
- **Muted colors prevent eye strain**—foreground used sparingly for emphasis

### Theme Fluidity

- **Instant class toggle**—no CSS transitions on theme change
- **Preload script** prevents white flash on load
- **Color variables** ensure consistency across both modes
- **Accent brightness** increases in dark mode for contrast

### Ambient Details

- **Vinyl record SVG** with grooves and shimmer when playing
- **Analog clock** with moving hands in footer
- **Cursor halo** adapts to hover state and theme
- **Background grain** adds texture without noise

---

## Implementation Reference

### Tailwind Custom Config

```typescript
// tailwind.config.ts
extend: {
  boxShadow: {
    floating: '0 20px 45px rgba(0,0,0,0.28)',
    lift: '0 12px 32px rgba(0,0,0,0.18)'
  },
  borderRadius: {
    xl: '1.5rem'
  },
  transitionTimingFunction: {
    'ambient': 'cubic-bezier(0.33, 1, 0.68, 1)'
  },
  animation: {
    'fade-in': 'fade-in 0.45s ease forwards',
    'pulse-soft': 'pulse-soft 4s ease-in-out infinite'
  },
  keyframes: {
    'fade-in': {
      from: { opacity: '0', transform: 'translateY(12px)' },
      to: { opacity: '1', transform: 'translateY(0)' }
    },
    'pulse-soft': {
      '0%, 100%': { opacity: '1' },
      '50%': { opacity: '0.7' }
    }
  }
}
```

### Framer Motion Best Practices

1. **Always check `useReducedMotion()`** and provide fallback
2. **Use `initial`/`animate` for entrance**, not CSS animations
3. **Wrap exit animations in `<AnimatePresence>`**
4. **Prefer `easeOut` for all non-ambient motion**
5. **Keep duration under 1s** unless ambient loop

### CSS Variables Pattern

```css
/* Define tokens in :root and .dark */
:root {
  --bg: #fafafb;
  --text: #0f1216;
  --acc1: #5ea9ff;
}

.dark {
  --bg: #0b0c0e;
  --text: #e7e9ec;
  --acc1: #6bc1ff;
}

/* Reference in Tailwind config */
colors: {
  background: 'var(--bg)',
  foreground: 'var(--text)',
  accent: { 1: 'var(--acc1)' }
}
```

### Responsive Patterns

- **Mobile-first utility stacking:** `text-base sm:text-lg`
- **Grid breakpoints:** `grid-cols-1 md:grid-cols-2`
- **Padding adjustments:** `p-6 sm:p-8 md:p-12`
- **Hide on mobile:** `hidden sm:flex`
- **Conditional layouts:** separate mobile/desktop structures for complex components

---

## Application to New Projects

### Quick Start Checklist

1. **Install dependencies:** `framer-motion`, `next-themes`, `tailwindcss`
2. **Copy color variables** from `globals.css` `:root` and `.dark`
3. **Extend Tailwind config** with custom shadows, border radii, animations
4. **Set up theme provider** with preload script to prevent flash
5. **Create reusable motion presets** for entrance/hover/ambient animations
6. **Establish section component** with label + title header pattern
7. **Build card primitives** with hover lift and border glow
8. **Add cursor halo** if tactile feedback desired
9. **Test in both themes** and with `prefers-reduced-motion`

### Adaptation Guidelines

- **Keep timing consistent:** 0.8s for content, 0.2s for interactions
- **Respect the gradient:** Use dual accents (blue/teal) for energy
- **Embrace muted text:** Foreground is for emphasis only
- **Layer surfaces:** Use `bg-surface/80` with borders for depth
- **Animate with purpose:** Every motion should feel earned, not decorative

---

**End of Design Language Extract**

*This document captures the living design system of a personal portfolio—a blueprint for calm, intentional, and readable interfaces that balance technical precision with human warmth.*
