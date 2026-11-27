---
title: "Label"
kind: "component"
isDraft: true
id: "label"
aliases:
  - "text-label"
  - "identifier"
  - "highlighted-label"
component:
  implementation: "src/vs/base/browser/ui/highlightedlabel/highlightedLabel.ts"
  relatedSources:
    - "src/vs/base/browser/ui/iconLabel/iconLabel.ts"
    - "src/vs/workbench/browser/labels.ts"
  api:
    - "HighlightedLabel.set"
    - "IHighlight.start"
    - "IHighlight.end"
    - "IHighlightedLabelOptions.hoverDelegate"
    - "IIconLabelCreationOptions.supportIcons"
    - "IIconLabelCreationOptions.supportHighlights"
    - "IconLabel.setLabel"
    - "IIconLabelValueOptions.matches"
  fixtures:
    - "baseUI/HighlightedLabels"
---

# HighlightedLabel / IconLabel

## Overview

Displays names with optional highlights, icons, and supporting descriptions.

## Usage

- Use highlights to show matching text, not as the only way to communicate meaning.
- Supply ranges against the same text being rendered.
- For icons and descriptions, follow the [IconLabel guidance](../iconLabel/icon-label.design.md), including construction options and resource-label integration.

## Accessibility

- Keep the full label readable without its visual highlight.
- Do not make essential information available only through hover.
- The containing list or tree owns focus and interaction semantics.

## Preview

Highlighted text and icon-label examples with supporting descriptions.
