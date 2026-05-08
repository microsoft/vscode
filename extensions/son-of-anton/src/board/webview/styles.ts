/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Inline stylesheet for the Task Board webview.
 *
 * Ported (mostly verbatim) from the vanilla-JS implementation in
 * `TaskBoardPanel.ts` so the visual identity is preserved. Persona accent
 * stripes are applied per-tile via inline style on `borderLeftColor`.
 *
 * Kept as a single export instead of a `.css` file so the bundle remains
 * a single artefact and we don't need a separate URI for stylesheet CSP.
 */

export const boardStyles = `
:root {
	--sota-card-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
	--sota-radius: 8px;
	--sota-pad: 12px;
	--sota-gap: 10px;
	--sota-muted: var(--vscode-descriptionForeground);
	--sota-border: var(--vscode-panel-border, var(--vscode-editorWidget-border, transparent));
	--sota-accent: var(--vscode-focusBorder);
	--sota-status-backlog: var(--vscode-descriptionForeground);
	--sota-status-ready: var(--vscode-charts-blue, #3b82f6);
	--sota-status-progress: var(--vscode-charts-yellow, #f59e0b);
	--sota-status-review: var(--vscode-charts-purple, #a855f7);
	--sota-status-done: var(--vscode-charts-green, #16a34a);
	--sota-status-failed: var(--vscode-errorForeground, #dc2626);
}
* { box-sizing: border-box; }
html, body, #root {
	margin: 0; padding: 0;
	font-family: var(--vscode-font-family);
	font-size: var(--vscode-font-size);
	color: var(--vscode-foreground);
	background: var(--vscode-editor-background);
	height: 100%;
}
.shell {
	display: flex; flex-direction: column;
	height: 100vh;
	padding: 16px;
	gap: 12px;
}
.header { display: flex; align-items: center; gap: 12px; }
.header h1 { font-size: 1.2em; margin: 0; font-weight: 600; }
.header .conversation { color: var(--sota-muted); font-size: 0.9em; }
.header .spacer { flex: 1; }
.header button {
	padding: 4px 10px; border-radius: 4px;
	border: 1px solid var(--sota-border);
	background: var(--vscode-button-secondaryBackground, transparent);
	color: var(--vscode-button-secondaryForeground, inherit);
	cursor: pointer; font: inherit;
}
.header button:hover { border-color: var(--sota-accent); }

.board-layout {
	display: grid;
	grid-template-columns: 1fr 320px;
	gap: 12px;
	flex: 1;
	min-height: 0;
}

.empty {
	display: flex; flex: 1;
	align-items: center; justify-content: center;
	color: var(--sota-muted);
	font-size: 0.95em;
	border: 1px dashed var(--sota-border);
	border-radius: var(--sota-radius);
}

.columns {
	display: grid;
	grid-template-columns: repeat(5, minmax(180px, 1fr));
	gap: var(--sota-gap);
	flex: 1;
	overflow: hidden;
	min-height: 0;
}
.column {
	display: flex; flex-direction: column;
	background: var(--vscode-sideBar-background, transparent);
	border: 1px solid var(--sota-border);
	border-radius: var(--sota-radius);
	padding: var(--sota-pad);
	min-height: 0;
	transition: border-color 150ms ease;
}
.column.drag-over { border-color: var(--sota-accent); }
.column-header {
	display: flex; align-items: center; gap: 6px;
	margin-bottom: 8px;
	padding-bottom: 6px;
	border-bottom: 1px solid var(--sota-border);
	font-weight: 600;
	font-size: 0.85em;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.column-count {
	margin-left: auto;
	font-size: 0.85em;
	padding: 0 6px;
	border-radius: 999px;
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
}
.column-body {
	display: flex; flex-direction: column;
	gap: 8px;
	overflow-y: auto;
	min-height: 60px;
	padding-right: 2px;
}

.tile {
	position: relative;
	background: var(--sota-card-bg);
	border: 1px solid var(--sota-border);
	border-left: 4px solid var(--sota-muted);
	border-radius: var(--sota-radius);
	padding: 10px;
	cursor: grab;
	transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}
.tile:hover { border-color: var(--sota-accent); }
.tile.dragging { opacity: 0.5; cursor: grabbing; }
.tile-row {
	display: flex; align-items: center; gap: 6px;
	font-size: 0.8em;
	color: var(--sota-muted);
}
.tile-id {
	font-family: var(--vscode-editor-font-family, monospace);
	font-size: 0.75em;
}
.tile-instruction {
	margin: 6px 0;
	font-size: 0.92em;
	line-height: 1.35;
	word-break: break-word;
}
.tile-assignee {
	display: flex; align-items: center; gap: 6px;
	margin-top: 6px;
}
.avatar {
	width: 22px; height: 22px;
	border-radius: 50%;
	display: flex; align-items: center; justify-content: center;
	color: white;
	font-size: 0.75em;
	font-weight: 700;
	flex-shrink: 0;
}
.tile-name { font-size: 0.82em; font-weight: 500; }
.tile-status-pill {
	display: inline-block;
	padding: 1px 6px;
	border-radius: 999px;
	font-size: 0.7em;
	font-weight: 600;
	color: white;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.tile-status-pill.backlog { background: var(--sota-status-backlog); }
.tile-status-pill.ready { background: var(--sota-status-ready); }
.tile-status-pill.in-progress { background: var(--sota-status-progress); }
.tile-status-pill.review { background: var(--sota-status-review); }
.tile-status-pill.done { background: var(--sota-status-done); }
.tile-status-pill.failed { background: var(--sota-status-failed); }

.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.chip {
	font-size: 0.72em;
	padding: 1px 6px;
	border-radius: 4px;
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.chip.dep { background: var(--vscode-editorInfo-background, var(--vscode-badge-background)); }

.tile-summary {
	font-size: 0.78em;
	color: var(--sota-muted);
	margin-top: 6px;
	line-height: 1.3;
	max-height: 3.6em;
	overflow: hidden;
}

.chat-pane {
	display: flex; flex-direction: column;
	border: 1px solid var(--sota-border);
	border-radius: var(--sota-radius);
	background: var(--vscode-sideBar-background, transparent);
	min-height: 0;
}
.chat-header {
	padding: 10px var(--sota-pad);
	border-bottom: 1px solid var(--sota-border);
	font-weight: 600;
	font-size: 0.85em;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.chat-log {
	flex: 1;
	overflow-y: auto;
	padding: var(--sota-pad);
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.chat-empty {
	color: var(--sota-muted);
	font-size: 0.85em;
	text-align: center;
	margin-top: 20px;
}
.chat-bubble {
	padding: 8px 10px;
	border-radius: 8px;
	font-size: 0.88em;
	line-height: 1.35;
	word-break: break-word;
	white-space: pre-wrap;
}
.chat-user {
	background: var(--vscode-button-background, var(--sota-accent));
	color: var(--vscode-button-foreground, white);
	align-self: flex-end;
	max-width: 85%;
}
.chat-assistant {
	background: var(--sota-card-bg);
	border: 1px solid var(--sota-border);
	color: var(--vscode-foreground);
	align-self: flex-start;
	max-width: 95%;
}
.chat-input {
	display: flex;
	gap: 6px;
	padding: var(--sota-pad);
	border-top: 1px solid var(--sota-border);
}
.chat-input textarea {
	flex: 1;
	resize: none;
	font: inherit;
	color: inherit;
	background: var(--vscode-input-background, var(--sota-card-bg));
	border: 1px solid var(--sota-border);
	border-radius: 4px;
	padding: 6px 8px;
}
.chat-input textarea:focus { outline: none; border-color: var(--sota-accent); }
.chat-input button {
	padding: 4px 12px;
	border-radius: 4px;
	border: 1px solid var(--sota-border);
	background: var(--vscode-button-background, transparent);
	color: var(--vscode-button-foreground, inherit);
	cursor: pointer;
	font: inherit;
}
.chat-input button:disabled { opacity: 0.5; cursor: default; }
.chat-tool-calls {
	margin: 6px 0 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.chat-tool-call {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
	border-left: 2px solid var(--sota-accent);
	padding: 2px 6px;
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}
.chat-tool-call code {
	font-family: var(--vscode-editor-font-family, monospace);
	color: var(--sota-accent);
}
.chat-tool-call-args { opacity: 0.85; }
`;
