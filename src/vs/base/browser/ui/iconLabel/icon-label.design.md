---
title: "Icon label"
kind: "primitive"
status: "draft"
legacyPaths:
  - "src/vs/base/browser/ui/iconLabel/icon-label-design.md"
---

# IconLabel

## Overview

A reusable name, optional icon, and supporting description.

## Usage

- Use for generic labeled objects; use workbench ResourceLabel when resource identity and file-icon themes are required.
- Choose description and highlighting to support the name rather than compete with it.
- Enable `supportIcons` and `supportHighlights` at construction when needed, and supply highlight ranges against the displayed text.

## Accessibility

- Keep the full name understandable without its icon or highlight.
- The containing list or tree owns focus and interaction semantics.

## Preview

A label with an inline Codicon, match highlight, and description.
