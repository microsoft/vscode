# createPixelSpinner

Usage and accessibility guidance for this component. The design-system reference checks API annotations against its implementation.

## Overview

A compact indeterminate busy indicator with grid and ring variants.

## Usage

- Use only while work is running and its completion percentage is unknown.
- Keep a visible description of the operation; the animation is not the message.
- Register the returned disposable and honor reduced motion.

## Accessibility

- Supply ariaLabel when the spinner itself must announce the busy state.
- Without ariaLabel the spinner is decorative; surrounding text must convey the operation. Reduced motion is handled by the component.

## Preview

Grid and ring spinners beside operation labels.
