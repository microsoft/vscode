/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { buildMermaidConfigData, configSection, renderMermaidConfigSpan } from '../markdownMermaid/config';
import { renderMermaidEditorHtml } from './editorHtml';

/** Id of the `markdown.codeBlockEditorProviders` contribution in `package.json`. */
export const mermaidCodeBlockEditorProviderId = 'mermaid';

/** The largest height the Markdown editor accepts for embedded editors. */
const maxEmbeddedEditorHeight = 10_000;

/**
 * Renders `mermaid` code blocks in the Markdown editor with the same renderer, theme, and settings as the
 * Markdown preview. Implements the provider API of `markdown.codeBlockEditorProviders` (`exportApi` source).
 */
export class MermaidCodeBlockEditorProvider implements vscode.Disposable {

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	/** Settings changed: the Markdown editor resolves open Mermaid blocks again. */
	public readonly onDidChange = this._onDidChange.event;

	private readonly _configurationListener = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(configSection)) {
			this._onDidChange.fire();
		}
	});

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolve() {
		const config = buildMermaidConfigData();
		const html = renderMermaidEditorHtml(renderMermaidConfigSpan());
		return {
			content: { html, baseUri: vscode.Uri.joinPath(this._extensionUri, 'markdown-editor-out') },
			contentType: 'text' as const,
			// Frames are only reused for equal runtime keys, so a settings change must not reuse frames with the old settings.
			runtimeKey: `vscode.mermaid-markdown-features/${hashString(html)}`,
			initialHeight: 150,
			presentation: {
				resizable: config.resizable,
				fullWidth: true,
				fullView: true,
				maxAutomaticHeight: parsePixelLength(config.maxHeight),
			},
		};
	}

	public dispose(): void {
		this._configurationListener.dispose();
		this._onDidChange.dispose();
	}
}

/**
 * The Markdown editor caps the automatic height in pixels. `markdown-mermaid.maxHeight` also accepts other
 * CSS lengths (such as `80vh`) for the preview, which have no fixed pixel value and leave the height uncapped.
 */
function parsePixelLength(value: string): number | undefined {
	const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(value);
	const pixels = match ? Number(match[1]) : NaN;
	return pixels > 0 ? Math.min(pixels, maxEmbeddedEditorHeight) : undefined;
}

function hashString(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(16);
}
