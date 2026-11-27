---
title: "Spinner"
kind: "component"
isDraft: true
id: "spinner"
aliases:
  - "loading-spinner"
  - "pixel-spinner"
component:
  implementation: "src/vs/base/browser/ui/pixelSpinner/pixelSpinner.ts"
  api:
    - "IPixelSpinnerOptions.variant"
    - "IPixelSpinnerOptions.ariaLabel"
    - "IPixelSpinner.element"
    - "createPixelSpinner"
---

# createPixelSpinner

## Overview

A compact indeterminate busy indicator with grid and ring variants.

## Usage

- Use only while work is running and its completion percentage is unknown.
- Keep a visible description of the operation; the animation is not the message.
- Register the returned disposable and honor reduced motion.

## Accessibility

- Supply ariaLabel when the spinner itself must announce the busy state.
- Without ariaLabel the spinner is decorative; surrounding text must convey the operation.
- The component's CSS disables animation only for the OS `prefers-reduced-motion: reduce` media query. `workbench.reduceMotion: "on"` alone does not stop it.
- Workbench callers must honor the [resolved reduced-motion preference](../../../../../../.github/skills/design-system/foundations/motion.design.md#offer-reduced-motion) and provide a static busy indicator when motion is reduced.

## Preview

Grid and ring spinners beside operation labels.
