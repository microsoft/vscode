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

const defaultMermaidTheme = 'vscode';
const validMermaidThemes = [
	'vscode',
	'base',
	'forest',
	'dark',
	'default',
	'neutral',
];

function sanitizeMermaidTheme(theme: string | undefined): string {
	return typeof theme === 'string' && validMermaidThemes.includes(theme) ? theme : defaultMermaidTheme;
}

export function buildMermaidConfigData() {
	const config = vscode.workspace.getConfiguration(configSection);
	return {
		darkModeTheme: sanitizeMermaidTheme(config.get('darkModeTheme')),
		lightModeTheme: sanitizeMermaidTheme(config.get('lightModeTheme')),
		maxTextSize: config.get('maxTextSize'),
		clickDrag: config.get('mouseNavigation.enabled', ClickDragMode.Alt),
		showControls: config.get('controls.show', ShowControlsMode.OnHoverOrFocus),
		resizable: config.get('resizable', true),
		maxHeight: config.get('maxHeight', ''),
	};
}

export function injectMermaidConfig(md: MarkdownIt): MarkdownIt {
	const render = md.renderer.render;
	md.renderer.render = function (...args) {
		return `${renderMermaidConfigSpan()}
				${render.apply(md.renderer, args)}`;
	};
	return md;
}

export function renderMermaidConfigSpan(): string {
	const escapedConfig = escapeHtmlAttribute(JSON.stringify(buildMermaidConfigData()));
	return `<span id="${configSection}" aria-hidden="true" data-config="${escapedConfig}"></span>`;
}

function escapeHtmlAttribute(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
