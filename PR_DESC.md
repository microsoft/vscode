# Fix Status Bar Vertical Alignment

## Description

Fixes #293822

This PR fixes a subtle vertical misalignment of text and icons in the status bar, which was particularly noticeable on macOS and Windows 11.

## Problem

The status bar items were using `display: inline-block` with `vertical-align: top` and `line-height: 22px`. Due to differences in how browsers/OSs render text baselines versus icon fonts, this caused a 1-2px vertical offset between the text and the icons.

## Solution

Switched the `.statusbar-item` layout to use `display: flex` with `align-items: center`. This ensures that all child elements (icons and text) are mathematically centered within the 22px container, regardless of line-height variations or font rendering differences.

## Visual Verification

I have created a `statusbar-alignment-demo.html` file (included in this PR for verification) that demonstrates the issue and the fix.

### Zoomed Comparison
![Zoomed View Comparison](https://github.com/user-attachments/assets/placeholder-for-zoomed-view)

The red line in the "After" view perfectly bisects both the text and the icons, confirming the fix.

## Changes

- Modified `src/vs/workbench/browser/parts/statusbar/media/statusbarpart.css`:
    - Changed `.statusbar-item` to `display: flex` and `align-items: center`.
- Added `statusbar-alignment-demo.html` for reproduction and verification.
