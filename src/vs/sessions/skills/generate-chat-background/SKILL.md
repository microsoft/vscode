---
name: generate-chat-background
description: Generate or design an image for the chat background in the Agents window. Use when the user asks for a generated chat background, wallpaper, pattern, or illustration to decorate their chat.
---
<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Generate Chat Background

Generate an image and apply it as the chat background with `setChatBackground`. The user's requested subject, style, and colors take priority over the guidance below.

If the user only wants to apply an existing image, change the layout, use Codicons, or remove the background, call `setChatBackground` directly. Do not generate an image unless asked.

## Generate and apply

1. If `setChatBackground` or an image-generation tool is unavailable, explain that rather than generating an image you cannot apply.
2. Call `getThemeColors` and use the palette as context for the image, not as a limit on the user's colors.
3. Design for the chat: messages and the input cover the center, so keep interesting detail toward the edges and keep contrast low enough for text to stay readable. For a pattern, generate a seamless tile with small, spaced motifs.
4. Save the image to a file in your working or scratch directory and pass its path to `setChatBackground`. If it fails, report the error and fix the input.

Choose the layout:
- `repeat` tiles the image at its original size. Resize the tile first if its motifs are too large or too small.
- `stretch` fills the chat but can distort the image.
- `center` and the edge or corner layouts show the image once at its original size. An opaque image can show its own ground as a visible rectangle.

## Check the result

After `setChatBackground` succeeds, call `screenshotWindow` and check that the subject is visible around the chat, the image blends in without seams or patches, motifs have a good size, and the conversation stays readable. Fix specific problems by adjusting the layout or tile size or by regenerating, for at most a couple of rounds.

The screenshot shows only the current view. Do not navigate the interface to capture other states, and do not comment on unrelated content in the screenshot.

If you could not check a screenshot, say that the result was not visually verified. High contrast themes hide chat backgrounds; mention this when it applies.

Tell the user what you applied and with which layout.
