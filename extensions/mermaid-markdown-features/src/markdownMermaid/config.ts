/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type MarkdownIt from 'markdown-it';

export const configSection = 'markdown-mermaid';

const enum ClickDragMode {
	Alt = 'alt'
}

const enum ShowControlsMode {
	OnHoverOrFocus = 'onHoverOrFocus'
}

const defaultMermaidTheme = 'default';
const validMermaidThemes = [
	'base',
	'forest',
	'dark',
	'default',
	'neutral',
];

function sanitizeMermaidTheme(theme: string | undefined): string {
	return typeof theme === 'string' && validMermaidThemes.includes(theme) ? theme : defaultMermaidTheme;
}

export function injectMermaidConfig(md: MarkdownIt): MarkdownIt {
	const render = md.renderer.render;
	md.renderer.render = function (...args) {
		const config = vscode.workspace.getConfiguration(configSection);
		const configData = {
			darkModeTheme: sanitizeMermaidTheme(config.get('darkModeTheme')),
			lightModeTheme: sanitizeMermaidTheme(config.get('lightModeTheme')),
			maxTextSize: config.get('maxTextSize'),
			clickDrag: config.get('mouseNavigation.enabled', ClickDragMode.Alt),
			showControls: config.get('controls.show', ShowControlsMode.OnHoverOrFocus),
			resizable: config.get('resizable', true),
			maxHeight: config.get('maxHeight', ''),
		};

		const escapedConfig = escapeHtmlAttribute(JSON.stringify(configData));
		return `<span id="${configSection}" aria-hidden="true" data-config="${escapedConfig}"></span>
				${render.apply(md.renderer, args)}`;
	};
	return md;
}

function escapeHtmlAttribute(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
