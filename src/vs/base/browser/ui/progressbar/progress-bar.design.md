---
title: "Progress bar"
kind: "primitive"
status: "draft"
legacyPaths:
  - "src/vs/base/browser/ui/progressbar/progress-design.md"
  - "src/vs/base/browser/ui/progressbar/progress.design.md"
---

# ProgressBar

## Overview

Communicates measured progress or ongoing work with an unknown total.

## Usage

- Use determinate progress only when a meaningful total is available.
- Stop the treatment when the operation completes or no longer runs.
- Use `done()` to finish with the completion transition, or `stop()` when the treatment must stop immediately.
- Do not use a looping treatment to represent an operation waiting for user input.

## Accessibility

- Supply an ariaLabel that describes the operation.
- Keep operation state understandable without motion.

## Preview

Determinate and indeterminate progress states.
