# ProgressBar

Usage and accessibility guidance for this component. The design-system reference checks API annotations against its implementation.

## Overview

Communicates measured progress or ongoing work with an unknown total.

## Usage

- Use determinate progress only when a meaningful total is available.
- Stop the treatment when the operation completes or no longer runs.
- Do not use a looping treatment to represent an operation waiting for user input.

## Accessibility

- Supply an ariaLabel that describes the operation.
- Keep operation state understandable without motion.

## Preview

Determinate and indeterminate progress states.
