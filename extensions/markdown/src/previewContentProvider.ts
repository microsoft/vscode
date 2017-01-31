/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownEngine } from './markdownEngine';

export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

export function getMarkdownUri(uri: vscode.Uri) {
	return uri.with({ scheme: 'markdown', path: uri.path + '.rendered', query: uri.toString() });
}

export class MDDocumentContentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _waiting: boolean;

	constructor(
		private engine: MarkdownEngine,
		private context: vscode.ExtensionContext
	) {
		this._waiting = false;
	}

	private getMediaPath(mediaFile: string): string {
		return this.context.asAbsolutePath(path.join('media', mediaFile));
	}

	private isAbsolute(p: string): boolean {
		return path.normalize(p + '/') === path.normalize(path.resolve(p) + '/');
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (href) {
			// Use href if it is already an URL
			if (vscode.Uri.parse(href).scheme) {
				return href;
			}

			// Use href as file URI if it is absolute
			if (this.isAbsolute(href)) {
				return vscode.Uri.file(href).toString();
			}

			// use a workspace relative path if there is a workspace
			let rootPath = vscode.workspace.rootPath;
			if (rootPath) {
				return vscode.Uri.file(path.join(rootPath, href)).toString();
			}

			// otherwise look relative to the markdown file
			return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
		}
		return href;
	}

	private computeCustomStyleSheetIncludes(uri: vscode.Uri): string {
		const styles = vscode.workspace.getConfiguration('markdown')['styles'];
		if (styles && Array.isArray(styles) && styles.length > 0) {
			return styles.map((style) => {
				return `<link rel="stylesheet" href="${this.fixHref(uri, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(): string {
		const previewSettings = vscode.workspace.getConfiguration('markdown')['preview'];
		if (!previewSettings) {
			return '';
		}
		const { fontFamily, fontSize, lineHeight } = previewSettings;
		return `<style>
			body {
				${fontFamily ? `font-family: ${fontFamily};` : ''}
				${+fontSize > 0 ? `font-size: ${fontSize}px;` : ''}
				${+lineHeight > 0 ? `line-height: ${lineHeight};` : ''}
			}
		</style>`;
	}

	public provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
		const sourceUri = vscode.Uri.parse(uri.query);
		return vscode.workspace.openTextDocument(sourceUri).then(document => {
			const scrollBeyondLastLine = vscode.workspace.getConfiguration('editor')['scrollBeyondLastLine'];
			const wordWrap = vscode.workspace.getConfiguration('editor')['wordWrap'];

			const markdownConfig = vscode.workspace.getConfiguration('markdown');
			const previewFrontMatter = markdownConfig.get('previewFrontMatter', 'hide');

			let initialLine = 0;
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.uri.path === sourceUri.path) {
				initialLine = editor.selection.active.line;
			}

			const body = this.engine.render(sourceUri, previewFrontMatter === 'hide', document.getText());

			return `<!DOCTYPE html>
				<html>
				<head>
					<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
					<link rel="stylesheet" type="text/css" href="${this.getMediaPath('markdown.css')}">
					<link rel="stylesheet" type="text/css" href="${this.getMediaPath('tomorrow.css')}">
					${this.getSettingsOverrideStyles()}
					${this.computeCustomStyleSheetIncludes(uri)}
					<base href="${document.uri.toString(true)}">
				</head>
				<body class="${scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${wordWrap ? 'wordWrap' : ''} ${!!markdownConfig.get('preview.markEditorSelection') ? 'showEditorSelection' : ''}">
					${body}
					<script>
						window.initialData = {
							source: "${encodeURIComponent(sourceUri.scheme + '://' + sourceUri.path)}",
							line: ${initialLine},
							scrollPreviewWithEditorSelection: ${!!markdownConfig.get('preview.scrollPreviewWithEditorSelection', true)},
							scrollEditorWithPreview: ${!!markdownConfig.get('preview.scrollEditorWithPreview', true)},
							doubleClickToSwitchToEditor: ${!!markdownConfig.get('preview.doubleClickToSwitchToEditor', true)},
						};
					</script>
					<script src="${this.getMediaPath('main.js')}"></script>
				</body>
				</html>`;
		});
	}

	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChange.event;
	}

	public update(uri: vscode.Uri) {
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				this._onDidChange.fire(uri);
			}, 300);
		}
	}
}
