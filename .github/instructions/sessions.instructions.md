---
description: Architecture documentation for the Agent Sessions window — a sessions-first app built as a new top-level layer alongside vs/workbench. Covers layout, parts, chat widget, contributions, entry points, and development guidelines. Use when working in `src/vs/sessions`
applyTo: src/vs/sessions/**
---

# Agent Sessions Window

The Agent Sessions window is a **standalone application** built as a new top-level layer (`vs/sessions`) in the VS Code architecture. It provides a sessions-first experience optimized for agent workflows — a simplified, fixed-layout workbench where chat is the primary interaction surface and editors appear as modal overlays.

When working on files under `src/vs/sessions/`, use these skills for detailed guidance:

- **`sessions`** skill — covers the full architecture: layering, folder structure, chat widget, menus, contributions, entry points, and development guidelines
- **`agent-sessions-layout`** skill — covers the fixed layout structure, grid configuration, part visibility, editor modal, titlebar, sidebar footer, and implementation requirements
