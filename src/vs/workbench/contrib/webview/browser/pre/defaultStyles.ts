/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const defaultWebviewStyles = `@layer vscode-default {
	html {
		scrollbar-color: var(--vscode-scrollbarSlider-background) var(--vscode-editor-background);
	}

	body {
		overscroll-behavior-x: none;
		background-color: transparent;
		color: var(--vscode-editor-foreground);
		font-family: var(--vscode-font-family);
		font-weight: var(--vscode-font-weight);
		font-size: var(--vscode-font-size);
		margin: 0;
		padding: 0 20px;
	}

	img, video {
		max-width: 100%;
		max-height: 100%;
	}

	a, a code {
		color: var(--vscode-textLink-foreground);
	}

	p > a {
		text-decoration: var(--text-link-decoration);
	}

	a:hover {
		color: var(--vscode-textLink-activeForeground);
	}

	a:focus,
	input:focus,
	select:focus,
	textarea:focus {
		outline: 1px solid -webkit-focus-ring-color;
		outline-offset: -1px;
	}

	code {
		font-family: var(--monaco-monospace-font);
		color: var(--vscode-textPreformat-foreground);
		background-color: var(--vscode-textPreformat-background);
		padding: 1px 3px;
		border-radius: 4px;
	}

	pre code {
		padding: 0;
	}

	blockquote {
		background: var(--vscode-textBlockQuote-background);
		border-color: var(--vscode-textBlockQuote-border);
	}

	kbd {
		background-color: var(--vscode-keybindingLabel-background);
		color: var(--vscode-keybindingLabel-foreground);
		border-style: solid;
		border-width: 1px;
		border-radius: 3px;
		border-color: var(--vscode-keybindingLabel-border);
		border-bottom-color: var(--vscode-keybindingLabel-bottomBorder);
		box-shadow: inset 0 -1px 0 var(--vscode-widget-shadow);
		vertical-align: middle;
		padding: 1px 3px;
	}

	::-webkit-scrollbar {
		width: 10px;
		height: 10px;
	}

	::-webkit-scrollbar-corner {
		background-color: var(--vscode-editor-background);
	}

	::-webkit-scrollbar-thumb {
		background-color: var(--vscode-scrollbarSlider-background);
	}

	::-webkit-scrollbar-thumb:hover {
		background-color: var(--vscode-scrollbarSlider-hoverBackground);
	}

	::-webkit-scrollbar-thumb:active {
		background-color: var(--vscode-scrollbarSlider-activeBackground);
	}

	::highlight(find-highlight) {
		background-color: var(--vscode-editor-findMatchHighlightBackground);
	}

	::highlight(current-find-highlight) {
		background-color: var(--vscode-editor-findMatchBackground);
	}
}`;
