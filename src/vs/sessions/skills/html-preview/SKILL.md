---
name: html-preview
description: Create visual reports, implementation plans, code-review explainers, comparisons, diagrams, and static UI mockups as inline HTML previews in the Agents window. Use when the user asks for visual or rendered output, not ordinary HTML code examples.
---
<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# HTML previews

Use HTML when layout helps the user understand or review the result. Keep short explanations and ordinary code examples in Markdown. Honor the user's requested format; do not turn every answer into HTML.

This is on-demand authoring guidance bundled with the Agents window, available across workspaces when HTML previews and AI features are enabled. Rendering does not depend on invoking this skill.

## Produce a preview

Return the document in a closed Markdown code fence with the language `html-preview`. Ordinary `html` fences remain source code. The preview appears after its closing fence arrives.

The `chat.htmlPreview.enabled` setting controls inline rendering in the Agents window and is off by default. While it is off, these fences display as source code. Do not change the user's setting unless asked.

- Use self-contained HTML and CSS, tables, simple inline SVG, and native `details`/`summary` disclosures.
- Use headings, text labels, meaningful image descriptions, and readable contrast. Do not rely on color alone to convey findings or status.
- For long reports, provide a table of contents with links such as `<a href="#risks">Risks</a>` and matching element IDs. Only links within the same document work. Put external citations and workspace source links in Markdown outside the preview.
- Prefer fluid layouts and wrapping text. Keep wide tables and code samples scrollable rather than clipping them.
- Inline previews expand to fit their content and scroll with the transcript. Prefer content-based heights over viewport-height layouts.
- Inline previews have no surrounding title bar, border, or permanent buttons. Leave `html` and `body` backgrounds, typography, and outer padding unset so the renderer can match the surrounding chat. Use explicit backgrounds only for meaningful inner surfaces.
- Use semantic VS Code theme variables instead of hardcoded light/dark colors. Prefer inherited text color, `var(--vscode-descriptionForeground, GrayText)` for secondary text, `var(--vscode-editorWidget-background, Canvas)` for an inner panel, `var(--vscode-widget-border, currentColor)` for its border, and `var(--vscode-textLink-foreground, LinkText)` for links.
- For charts, use the `--vscode-charts-blue`, `--vscode-charts-green`, and other chart palette variables with `currentColor` fallbacks. Include labels or patterns and a data table or text explanation; color alone is not sufficient.
- Use VS Code spacing, radius, and type-role variables where applicable, with standalone fallbacks. Keep chrome quiet, make the main finding lead, and avoid giving every section a competing card or accent color.
- Scripts, JavaScript event handlers, forms, inputs, buttons, embedded frames, canvas applications, external links, remote images, stylesheets, fonts, and network requests are not supported. Do not promise sliders, draggable boards, live charts, or working export buttons.
- For interaction, use native disclosures and section links instead of script-dependent tabs or controls. If the user needs a running application, explain that it requires a separate application workflow.
- Embedded PNG, JPEG, GIF, and WebP data images are supported; prefer simple inline SVG for diagrams so output stays compact.
- Keep each preview below 64,000 characters and the overall response concise. Split a large explanation into focused sections or previews instead of embedding large assets.

Example:

````markdown
Here are the options:

```html-preview
<style>
  .options { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--vscode-spacing-size120, 12px); }
  .option { border: var(--vscode-strokeThickness, 1px) solid var(--vscode-widget-border, currentColor); border-radius: var(--vscode-cornerRadius-medium, 6px); padding: var(--vscode-spacing-size120, 12px); }
</style>
<h1>Choose an approach</h1>
<nav aria-label="Contents"><a href="#comparison">Comparison</a> | <a href="#risks">Risks</a></nav>
<div class="options" id="comparison">
  <section class="option"><h2>Small change</h2><p>Reuse the existing renderer.</p></section>
  <section class="option"><h2>Separate runtime</h2><p>Supports a full interactive application.</p></section>
</div>
<details id="risks"><summary>Risks and trade-offs</summary><p>The smaller change does not execute scripts.</p></details>
```
````

## Read, save, and iterate

When rendering is enabled, right-click the preview or focus it and press Shift+F10 for **Show Source**, **Open Preview**, and **Save HTML**. Open Preview opens a larger reading surface. Save HTML exports a sanitized, self-contained HTML file with the current theme and opens it through the normal file-preview behavior. Expanded and exported documents retain their own background and padding. It does not save hidden JavaScript or unsupported controls from the original source.

Do not claim a file was created merely because a preview rendered. The user can choose Save HTML, or explicitly ask you to create an HTML artifact using the available file tools. Only create a file when the requested deliverable calls for one; keep it self-contained and script-free, and use the existing artifact-registration tool when available.

For revisions, use the existing response or the saved file supplied by the user as context. Preserve its structure, factual content, section IDs, and intended format while making the requested changes. Keep any raw-source export distinct from a sanitized preview export; never suggest that preview restrictions automatically apply to arbitrary HTML opened elsewhere.
