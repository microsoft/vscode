/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownEngine } from './markdownEngine';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export interface ContentSecurityPolicyArbiter {
	isEnhancedSecurityDisableForWorkspace(): boolean;

	addTrustedWorkspace(rootPath: string): Thenable<void>;

	removeTrustedWorkspace(rootPath: string): Thenable<void>;
}

const previewStrings = {
	cspAlertMessageText: localize('preview.securityMessage.text', 'Scripts have been disabled in this document'),
	cspAlertMessageTitle: localize('preview.securityMessage.title', 'Scripts are disabled in the markdown preview. Change the Markdown preview secuirty setting to enable scripts'),
	cspAlertMessageLabel: localize('preview.securityMessage.label', 'Scripts Disabled Security Warning')
};

export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

export function getMarkdownUri(uri: vscode.Uri) {
	return uri.with({ scheme: 'markdown', path: uri.fsPath + '.rendered', query: uri.toString() });
}

export class MDDocumentContentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _waiting: boolean = false;
	private extraStyles: Array<vscode.Uri> = [];
	private extraScripts: Array<vscode.Uri> = [];

	constructor(
		private engine: MarkdownEngine,
		private context: vscode.ExtensionContext,
		private cspArbiter: ContentSecurityPolicyArbiter
	) { }

	public addScript(resource: vscode.Uri): void {
		this.extraScripts.push(resource);
	}

	public addStyle(resource: vscode.Uri): void {
		this.extraStyles.push(resource);
	}

	private getMediaPath(mediaFile: string): string {
		return vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile))).toString();
	}

	private isAbsolute(p: string): boolean {
		return path.normalize(p + '/') === path.normalize(path.resolve(p) + '/');
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (!href) {
			return href;
		}

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

	private computeCustomStyleSheetIncludes(uri: vscode.Uri): string {
		const styles = vscode.workspace.getConfiguration('markdown')['styles'];
		if (styles && Array.isArray(styles) && styles.length > 0) {
			return styles.map((style) => {
				return `<link rel="stylesheet" href="${this.fixHref(uri, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(nonce: string): string {
		const previewSettings = vscode.workspace.getConfiguration('markdown')['preview'];
		if (!previewSettings) {
			return '';
		}
		const { fontFamily, fontSize, lineHeight } = previewSettings;
		return `<style nonce="${nonce}">
			body {
				${fontFamily ? `font-family: ${fontFamily};` : ''}
				${+fontSize > 0 ? `font-size: ${fontSize}px;` : ''}
				${+lineHeight > 0 ? `line-height: ${lineHeight};` : ''}
			}
		</style>`;
	}

	private getStyles(uri: vscode.Uri, nonce: string): string {
		const baseStyles = [
			this.getMediaPath('markdown.css'),
			this.getMediaPath('tomorrow.css')
		].concat(this.extraStyles.map(resource => resource.toString()));

		return `${baseStyles.map(href => `<link rel="stylesheet" type="text/css" href="${href}">`).join('\n')}
			${this.getSettingsOverrideStyles(nonce)}
			${this.computeCustomStyleSheetIncludes(uri)}`;
	}

	private getScripts(nonce: string): string {
		const scripts = [this.getMediaPath('main.js')].concat(this.extraScripts.map(resource => resource.toString()));
		return scripts
			.map(source => `<script src="${source}" nonce="${nonce}"></script>`)
			.join('\n');
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
			if (editor && editor.document.uri.fsPath === sourceUri.fsPath) {
				initialLine = editor.selection.active.line;
			}

			const initialData = {
				previewUri: uri.toString(),
				source: sourceUri.toString(),
				line: initialLine,
				scrollPreviewWithEditorSelection: !!markdownConfig.get('preview.scrollPreviewWithEditorSelection', true),
				scrollEditorWithPreview: !!markdownConfig.get('preview.scrollEditorWithPreview', true),
				doubleClickToSwitchToEditor: !!markdownConfig.get('preview.doubleClickToSwitchToEditor', true),
			};

			// Content Security Policy
			const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
			let csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' http: https: data:; media-src 'self' http: https: data:; child-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' http: https: data:; font-src 'self' http: https: data:;">`;
			if (this.cspArbiter.isEnhancedSecurityDisableForWorkspace()) {
				csp = '';
			}

			const body = this.engine.render(sourceUri, previewFrontMatter === 'hide', document.getText());
			return `<!DOCTYPE html>
				<html>
				<head>
					<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
					${csp}
					<meta id="vscode-markdown-preview-data" data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}" data-strings="${JSON.stringify(previewStrings).replace(/"/g, '&quot;')}">
					<script src="${this.getMediaPath('csp.js')}" nonce="${nonce}"></script>
					${this.getStyles(uri, nonce)}
					<base href="${document.uri.toString(true)}">
				</head>
				<body class="vscode-body ${scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${wordWrap ? 'wordWrap' : ''} ${!!markdownConfig.get('preview.markEditorSelection') ? 'showEditorSelection' : ''}">
					${body}
					<div class="code-line" data-line="${document.lineCount}"></div>
					${this.getScripts(nonce)}
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
