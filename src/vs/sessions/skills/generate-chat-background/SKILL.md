---
name: generate-chat-background
description: Generate or design an image for the chat background in the Agents window. Use when the user asks for a generated chat background, wallpaper, pattern, or illustration to decorate their chat.
---
<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Generate Chat Background

Generate an image for the user's chat and apply it using `setChatBackground`. The user's requested subject, style, colors, and composition take priority. A bright photograph, colorful illustration, or busy pattern is a valid choice when requested.

If the user only wants to apply an existing image, change its layout, use Codicons, or remove the background, use `setChatBackground` directly. Do not generate or restyle an image unless asked.

## 1. Check the available tools

Discover `setChatBackground` and an image-generation tool before generating an image. Follow their supported inputs and limits. If either is unavailable or disabled, explain the limitation rather than spending generation credits on a background you cannot apply or claiming success.

Also discover `screenshotWindow`, which captures the window so you can check the applied background. Without it you can still apply a background, but you cannot visually verify it.

The built-in skill and appearance tools require `chat.agentSessions.appearanceTools.enabled`. If the user has disabled them, respect that choice; do not enable the setting unless asked. Existing backgrounds and manual background controls are unaffected.

Use the user's request to guide generation. Ask for clarification only when a missing choice materially affects the result; do not require the user to choose a recipe.

## 2. Understand the surrounding interface

When visual integration matters, call `getThemeColors` before generating. Use the current window, chat, input, and foreground colors, along with secondary text and accent colors, as context. Do not assume a dark theme or copy a palette from an earlier session.

The palette describes the surroundings, not an allowed palette. Foreground colors are a reference for the text the image will sit beside, not an instruction to use bright text colors for decoration. Preserve the user's explicit color choices.

Theme values may be transparent or unavailable; they are not sampled image pixels or final composited surface colors. If palette information is unavailable, do not invent it. High contrast themes hide chat backgrounds; make that limitation clear without changing the user's theme.

Chat cards and the composer can obscure much of the center of the image. A background should also make sense in the exposed margins and gaps, at different chat widths, and on the empty chat screen.

## 3. Choose a suitable approach

These are suggestions, not requirements. Choose either, combine them, or use another approach that better matches the request. They do not impose a subject, artistic style, palette, or composition.

### Pattern option

For a patterned background, small motifs, generous spacing, and restrained contrast can work well around messages. Consider a seamless tile whose edges join without visible seams. Check the motifs at their displayed size: hairline detail can disappear after resizing, while oversized motifs can distract from the conversation. A flat ground often repeats more naturally than a directional gradient or vignette.

### Atmospheric option

For an atmospheric background, broad color transitions and quieter areas can blend with the interface. Consider placing interesting details around the edges rather than relying on a large central subject that chat cards may hide. The current theme accent can inspire a restrained tint when the user has not specified colors.

For either approach, an unobtrusive result usually benefits from avoiding unintended bright highlights, busy detail behind exposed text, or a framed illustration that looks pasted onto the interface. Depart from these suggestions whenever the user's requested design calls for it.

## 4. Generate, save, and apply

Include the relevant user preferences, palette context, intended display size, and layout in the generation prompt. Use reference images only when the user wants them incorporated or edited. Generate only the variants needed for the request.

Save the resulting image to a file accessible from the invoking chat's environment, preferably in its scratch or output area rather than modifying unrelated project files. Pass that file path to `setChatBackground`, not an HTTP URL, base64 data, or a CSS expression. The tool copies the image into VS Code storage.

Choose a layout that suits the image:
- `repeat` tiles at the image's original size; resize the tile proportionally first if its motifs would otherwise be too large or too small.
- `stretch` fills the chat but can distort the aspect ratio. Use it when the composition tolerates that.
- `center` and the edge or corner layouts display the image once at its original size and leave the rest of the canvas uncovered.

An opaque image placed in a corner can reveal a rectangular patch if its ground differs from the actual chat surface. If transparency is intended, verify real alpha pixels; a painted checkerboard is not transparency, and a requested hex color is not a guarantee of an exact generated match.

## 5. Check the result

Confirm that `setChatBackground` succeeded before saying the image was applied. If it fails, report the error and fix the specific input or file problem rather than silently choosing a different design. Keep the reported previous background and layout available for undo.

After `setChatBackground` succeeds, call `screenshotWindow` to see the result as the user sees it. Call it after `setChatBackground` returns, not in parallel with it. Judge the screenshot with the surrounding interface and chat content, not only the generated image:
- Does the requested subject still read in the margins and gaps around chat cards and the composer?
- Does the image fit its surroundings, without visible seams, a rectangular patch, unintended bright highlights, or a pasted-on look?
- Does the conversation remain easy to read and follow?
- Do motifs have the intended size? The screenshot is downscaled. Compare image sizes with the reported window size in CSS pixels, because `repeat`, `center`, and the edge or corner layouts display an image at its original pixel size.

If the result misses the request or hurts readability, make a targeted fix and check again: change the layout, resize the tile, or regenerate with a prompt that addresses the specific problem. Keep revisions to a couple of rounds unless the user asks for more, then present the best result and any remaining concerns. Do not abandon the user's requested subject, style, or colors to make the result quieter; explain the trade-off instead.

The screenshot shows only what the window displays now, which may be a different or empty chat at the current width. Do not navigate or rearrange the interface to capture other states; reason about how the background works in populated and empty chats and at other widths. Use the screenshot only to judge the background, and do not report or act on unrelated content it shows.

If `screenshotWindow` is unavailable or fails, or a high contrast theme hides the background, say that the result was not visually verified rather than claiming it was.

Briefly tell the user what was applied, its layout, and whether you checked it in a screenshot. Mention when high contrast prevents it from being visible.
