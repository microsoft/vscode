/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The page of the Mermaid code block editor. Its script, `index.js`, loads relative to the page's base URL,
 * `markdown-editor-out/`. `configSpan` carries the `markdown-mermaid` settings, as in the Markdown preview.
 */
export function renderMermaidEditorHtml(configSpan: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		html, body { height: 100%; margin: 0; padding: 0; }
		/* The body scrolls; Mermaid's hidden tooltip, appended to the body, must not make the document scroll. */
		html { overflow: hidden; }
		body { overflow: auto; }
		#markdown-mermaid { display: none; }
		main { display: flex; min-height: 100%; }
		main > .mermaid { margin: auto; width: 100%; }
		main > .mermaid > svg { display: block; margin: 0 auto; }
		.mermaid-error { margin: 0; padding: 8px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--vscode-errorForeground); }
	</style>
</head>
<body>
	${configSpan}
	<main aria-label="Mermaid diagram" aria-busy="true"></main>
	<script type="module" src="./index.js"></script>
</body>
</html>`;
}
