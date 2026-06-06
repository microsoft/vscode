# RoboAgent — Brand Identity Guide

---

## Logo Concepts

### Dark Variant (Primary — for IDE, dark backgrounds)
![RoboAgent Logo Dark - Robot head with neural network and code bracket motif in cyan-to-purple gradient on dark navy](/home/mohamed/.gemini/antigravity/brain/4105277a-5e39-4834-aafb-e9ce34868624/roboagent_logo_dark_1778193988954.png)

### Light Variant (Marketing, docs, light backgrounds)
![RoboAgent Logo Light - Robot head with neural network motif in deep navy with cyan accents on white](/home/mohamed/.gemini/antigravity/brain/4105277a-5e39-4834-aafb-e9ce34868624/roboagent_logo_light_1778194001682.png)

### Logo Design Rationale
- **Robot head silhouette** → robotics identity, immediately recognizable
- **Neural network nodes** → AI intelligence, connected systems
- **Code bracket `<>`** → developer tool, code-first platform
- **Gradient (cyan → purple)** → modern, premium, tech-forward

---

## Color Palette

### Primary Colors

| Name | Hex | Usage |
|---|---|---|
| **Space Navy** | `#0A0E27` | IDE background, primary dark surfaces |
| **Deep Navy** | `#0F1535` | Sidebar, secondary panels |
| **Midnight** | `#161B3D` | Editor background, elevated surfaces |

### Accent Colors

| Name | Hex | Usage |
|---|---|---|
| **Electric Cyan** | `#00E5FF` | Primary accent, links, active states, logo |
| **Vivid Purple** | `#7C3AED` | Secondary accent, AI elements, gradients |
| **Neon Green** | `#10B981` | Success states, connected/healthy indicators |
| **Amber Warning** | `#F59E0B` | Warnings, QoS issues, degraded states |
| **Signal Red** | `#EF4444` | Errors, critical issues, disconnected |

### Gradient

```css
/* Primary brand gradient — used on logo, CTAs, hero sections */
background: linear-gradient(135deg, #00E5FF 0%, #7C3AED 100%);

/* Subtle surface gradient — used on hover states, cards */
background: linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(124,58,237,0.08) 100%);
```

### Surface Colors (IDE Theme)

| Surface | Hex | Usage |
|---|---|---|
| Background | `#0A0E27` | Main editor background |
| Surface 1 | `#0F1535` | Sidebar, activity bar |
| Surface 2 | `#161B3D` | Panels, dropdowns |
| Surface 3 | `#1E2550` | Hover states, selected items |
| Border | `#2A3164` | Panel borders, dividers |
| Border Active | `#00E5FF33` | Focused panel borders |

### Text Colors

| Name | Hex | Usage |
|---|---|---|
| Primary Text | `#E2E8F0` | Main content, code |
| Secondary Text | `#94A3B8` | Labels, descriptions, comments |
| Muted Text | `#64748B` | Placeholders, disabled |
| Accent Text | `#00E5FF` | Links, active items |

---

## Typography

### Font Stack

| Use | Font | Fallback | Weight |
|---|---|---|---|
| **UI / Interface** | [Inter](https://fonts.google.com/specimen/Inter) | -apple-system, sans-serif | 400, 500, 600 |
| **Code Editor** | [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Fira Code, monospace | 400, 700 |
| **Marketing / Headlines** | [Outfit](https://fonts.google.com/specimen/Outfit) | Inter, sans-serif | 600, 700, 800 |
| **Logo Wordmark** | Custom (based on Outfit Bold) | — | 700 |

### Type Scale

```
Hero:        48px / 700 / Outfit      — Landing page headlines
H1:          32px / 700 / Outfit      — Page titles
H2:          24px / 600 / Outfit      — Section headers
H3:          18px / 600 / Inter       — Panel headers
Body:        14px / 400 / Inter       — UI text, descriptions
Small:       12px / 400 / Inter       — Labels, metadata
Code:        13px / 400 / JetBrains   — Editor, inline code
Terminal:    13px / 400 / JetBrains   — Terminal output
```

---

## IDE Theme Preview

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ RoboAgent          #0A0E27 (Space Navy)                 │
│  ┌─────┬──────────────────────────┬───────────────────────┐ │
│  │     │                          │                       │ │
│  │#0F15│  #161B3D (Editor)        │  #0F1535 (Panel)      │ │
│  │(Side│                          │                       │ │
│  │ bar)│  import rclpy      ← #E2E8F0 (Primary Text)     │ │
│  │     │  from rclpy.node   ← #94A3B8 (Secondary)        │ │
│  │  📦 │  # comment         ← #64748B (Muted)            │ │
│  │  📡 │  class MyNode      ← #00E5FF (Cyan Keyword)     │ │
│  │  🔧 │    def __init__    ← #7C3AED (Purple Function)  │ │
│  │  🤖 │      self.pub =    ← #10B981 (Green String)     │ │
│  │     │                          │                       │ │
│  │     │  ⚠ QoS mismatch   ← #F59E0B (Amber Warning)    │ │
│  │     │  ✗ TF missing      ← #EF4444 (Red Error)        │ │
│  │     │  ● Connected       ← #10B981 (Green Status)     │ │
│  └─────┴──────────────────────────┴───────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  🤖 AI: Your TF tree...  #00E5FF accent on AI elements│ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Syntax Highlighting (RoboAgent Dark Theme)

| Token | Color | Hex |
|---|---|---|
| Keywords (`import`, `class`, `def`) | Electric Cyan | `#00E5FF` |
| Functions / Methods | Vivid Purple | `#7C3AED` |
| Strings | Neon Green | `#10B981` |
| Numbers | Amber | `#F59E0B` |
| Comments | Muted | `#64748B` |
| Variables | Primary Text | `#E2E8F0` |
| Types / Classes | Soft Blue | `#60A5FA` |
| ROS2 decorators / macros | Pink | `#F472B6` |
| Operators | Secondary | `#94A3B8` |

---

## Voice & Tone

### Brand Personality
- **Expert but approachable** — We know robotics deeply but don't gatekeep
- **Direct and actionable** — Every AI response should tell you what to DO
- **Engineering-first** — We speak the language of robotics engineers, not marketers
- **Quietly confident** — Premium feel without being flashy

### Copywriting Examples

| Context | ❌ Don't | ✅ Do |
|---|---|---|
| Tagline | "AI for robots" | "The operating system for AI-assisted robotics development" |
| Feature | "Smart code completion" | "Code generation that knows your TF tree" |
| Error | "Something went wrong" | "QoS mismatch: publisher is BEST_EFFORT but subscriber expects RELIABLE" |
| AI Chat | "I can help with that!" | "Your Nav2 controller_frequency is 20Hz but your lidar publishes at 10Hz. Here's the fix." |
| Marketing | "Revolutionary AI platform" | "Debug your robot in 30 seconds instead of 30 minutes" |

### Naming Conventions

| Component | Name Style | Examples |
|---|---|---|
| Product | PascalCase | RoboAgent |
| Features | Descriptive, no jargon | "AI Debugging Agent", "ROS2 Graph View", "Sensor Timing Analyzer" |
| Plans | Simple nouns | Community, Pro, Team, Enterprise |
| Internal tools | Codenames (celestial) | Orion (indexer), Nova (AI engine), Pulsar (bridge) |

---

## Logo Usage Rules

### Do
- ✅ Use on dark backgrounds with the gradient variant
- ✅ Use on light backgrounds with the navy variant
- ✅ Maintain minimum clear space (1x logo height on all sides)
- ✅ Use the icon mark alone for favicons, app icons, small contexts

### Don't
- ❌ Stretch, rotate, or distort the logo
- ❌ Change the gradient colors
- ❌ Place on busy/photographic backgrounds without overlay
- ❌ Use at sizes below 24px height (use icon mark instead)
- ❌ Add drop shadows or effects

### App Icon Sizes
```
Favicon:     32x32, 16x16 (icon mark only)
Desktop App: 512x512, 256x256, 128x128 (icon mark only)
Social:      1200x630 (full logo, dark variant)
```

---

## Competitive Visual Positioning

```
          Playful / Colorful
               ↑
               |
     GitHub    |   
     Copilot   |   
               |   
  Serious ←────┼────→ Futuristic
               |
     JetBrains |   ★ RoboAgent
               |   (premium, dark, 
     Foxglove  |    futuristic, technical)
               |
               ↓
          Dark / Minimal
```

RoboAgent's visual identity sits in the **dark, futuristic, technical** quadrant — similar to Linear, Vercel, and Raycast. This signals: *premium developer tool, not a toy*.
