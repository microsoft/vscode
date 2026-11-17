# Dialog

## Overview

A reusable modal decision surface with buttons and optional inputs.

## Usage

- Prefer IDialogService in product code; the base Dialog owns the shared surface.
- Reserve modal decisions for interruptions that require a response.
- Follow the [elevation guidance](../../../../../../.github/design-system/guidance/elevation.design.md#keep-one-task-in-front) for dialog handoffs, queued requests, and avoiding nested modal workflows.

## Accessibility

- Give the message, detail, and actions clear purpose.
- Preserve focus trapping, cancellation, and focus restoration. Do not remove the close path without an accessible alternative.

## Preview

Interactive dialog example not yet available.
