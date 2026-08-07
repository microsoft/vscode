---
description: VS Code design philosophy — the shared Values→Principles→Moves vocabulary for reasoning about UI in design terms rather than raw pixels. Use when creating, editing, or reviewing any visual surface (CSS, DOM, theming, icons, motion). Name the value/principle before reaching for a token.
applyTo: "src/vs/**/browser/**/*.{ts,css}"
---

# Design philosophy

When you touch a visual surface, reason about it in **design terms, not pixels**.
Design-system spacing, radii, type roles, and colors use named tokens/ramps where
available. Raw literals remain valid for structural measurements or when no token exists.

Work in three layers - name the **feeling**, find the **principle** it breaks,
then reach for the **move** that restores it:

- **Values (how it should feel):** **Calm** · **Focused** · **Consistent** · **Delightful**
- **Principles (questions to ask):**
  1. *Quiet at rest, present on intent* - is anything shouting when nothing's happening?
  2. *Room to breathe* - does this feel cramped, tight, or jagged?
  3. *The interface explains itself* - could someone understand this at a glance?
  4. *One thing leads; the rest supports* - where does the eye go first?
  5. *Elevation is encoded, not eyeballed* - does roundness match how far the surface floats?
  6. *Sameness signals sameness* - do two like things look identical, and is any difference intentional?
  7. *Delight earns its keep* - what does this help the user do?
- **Moves (the mechanics):** elevation tiers (Control 4 / Inner 6 / Outer 8;
  pills fully round), the spacing ramp, the type ramp (roles + `regular`/`semiBold`
  only, no 500), two icon sizes (16 base / 12 compact), a 1px token for standard strokes,
  `--vscode-*` theme color, reveal-on-intent chrome, prefer a word to a mystery
  glyph.

Reach for a **move** only *after* naming the feeling and the principle - never
instead. Describe a bug by its role/tier/ramp (*"this overlay is rounded at the
control tier"*), not its number (*"border-radius should be 6"*).

**Full reference** (values, principles, moves, worked examples, phrasebook, and
feedback guidance): the [`design-philosophy` skill](../skills/design-philosophy/SKILL.md).
**Token mechanics:** [design-tokens.instructions.md](./design-tokens.instructions.md).
