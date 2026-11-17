# Switch

## Overview

A binary setting that takes effect immediately.

## Usage

- Use for immediately applied settings, not deferred form submission.
- Keep the label stable between on and off.
- Programmatic checked updates do not emit onChange; subscribe to user changes separately.
- Constructor `checked` and `disabled` options establish the initial state; change those properties on the instance afterwards.

## Accessibility

- The native button exposes role switch and aria-checked.
- Supply ariaLabel. Enter and Space activate an enabled switch; disabled switches cannot activate.

## Preview

Off, on, and disabled switches.
