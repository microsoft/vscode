/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownEngine } from './markdownEngine';

import * as nls from 'vscode-nls';
import { Logger } from './logger';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from './security';
const localize = nls.loadMessageBundle();

const previewStrings = {
	cspAlertMessageText: localize('preview.securityMessage.text', 'Some content has been disabled in this document'),
	cspAlertMessageTitle: localize('preview.securityMessage.title', 'Potentially unsafe or insecure content has been disabled in the markdown preview. Change the Markdown preview security setting to allow insecure content or enable scripts'),
	cspAlertMessageLabel: localize('preview.securityMessage.label', 'Content Disabled Security Warning')
};

export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

export function getMarkdownUri(uri: vscode.Uri) {
	if (uri.scheme === 'markdown') {
		return uri;
	}

	return uri.with({
		scheme: 'markdown',
		path: uri.path + '.rendered',
		query: uri.toString()
	});
}

class MarkdownPreviewConfig {
	public static getCurrentConfig() {
		return new MarkdownPreviewConfig();
	}

	public readonly scrollBeyondLastLine: boolean;
	public readonly wordWrap: boolean;
	public readonly previewFrontMatter: string;
	public readonly lineBreaks: boolean;
	public readonly doubleClickToSwitchToEditor: boolean;
	public readonly scrollEditorWithPreview: boolean;
	public readonly scrollPreviewWithEditorSelection: boolean;
	public readonly markEditorSelection: boolean;

	public readonly lineHeight: number;
	public readonly fontSize: number;
	public readonly fontFamily: string | undefined;
	public readonly styles: string[];

	private constructor() {
		const editorConfig = vscode.workspace.getConfiguration('editor');
		const markdownConfig = vscode.workspace.getConfiguration('markdown');
		const markdownEditorConfig = vscode.workspace.getConfiguration('[markdown]');

		this.scrollBeyondLastLine = editorConfig.get<boolean>('scrollBeyondLastLine', false);

		this.wordWrap = editorConfig.get<string>('wordWrap', 'off') !== 'off';
		if (markdownEditorConfig && markdownEditorConfig['editor.wordWrap']) {
			this.wordWrap = markdownEditorConfig['editor.wordWrap'] !== 'off';
		}

		this.previewFrontMatter = markdownConfig.get<string>('previewFrontMatter', 'hide');
		this.scrollPreviewWithEditorSelection = !!markdownConfig.get<boolean>('preview.scrollPreviewWithEditorSelection', true);
		this.scrollEditorWithPreview = !!markdownConfig.get<boolean>('preview.scrollEditorWithPreview', true);
		this.lineBreaks = !!markdownConfig.get<boolean>('preview.breaks', false);
		this.doubleClickToSwitchToEditor = !!markdownConfig.get<boolean>('preview.doubleClickToSwitchToEditor', true);
		this.markEditorSelection = !!markdownConfig.get<boolean>('preview.markEditorSelection', true);

		this.fontFamily = markdownConfig.get<string | undefined>('preview.fontFamily', undefined);
		this.fontSize = Math.max(8, +markdownConfig.get<number>('preview.fontSize', NaN));
		this.lineHeight = Math.max(0.6, +markdownConfig.get<number>('preview.lineHeight', NaN));

		this.styles = markdownConfig.get<string[]>('styles', []);
	}

	public isEqualTo(otherConfig: MarkdownPreviewConfig) {
		for (let key in this) {
			if (this.hasOwnProperty(key) && key !== 'styles') {
				if (this[key] !== otherConfig[key]) {
					return false;
				}
			}
		}

		// Check styles
		if (this.styles.length !== otherConfig.styles.length) {
			return false;
		}
		for (let i = 0; i < this.styles.length; ++i) {
			if (this.styles[i] !== otherConfig.styles[i]) {
				return false;
			}
		}

		return true;
	}

	[key: string]: any;
}

export class MDDocumentContentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _waiting: boolean = false;

	private config: MarkdownPreviewConfig;

	private extraStyles: Array<vscode.Uri> = [];
	private extraScripts: Array<vscode.Uri> = [];

	constructor(
		private engine: MarkdownEngine,
		private context: vscode.ExtensionContext,
		private cspArbiter: ContentSecurityPolicyArbiter,
		private logger: Logger
	) {
		this.config = MarkdownPreviewConfig.getCurrentConfig();
	}

	public addScript(resource: vscode.Uri): void {
		this.extraScripts.push(resource);
	}

	public addStyle(resource: vscode.Uri): void {
		this.extraStyles.push(resource);
	}

	private getMediaPath(mediaFile: string): string {
		return vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile))).toString();
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (!href) {
			return href;
		}

		// Use href if it is already an URL
		const hrefUri = vscode.Uri.parse(href);
		if (['file', 'http', 'https'].indexOf(hrefUri.scheme) >= 0) {
			return hrefUri.toString();
		}

		// Use href as file URI if it is absolute
		if (path.isAbsolute(href)) {
			return vscode.Uri.file(href).toString();
		}

		// use a workspace relative path if there is a workspace
		let root = vscode.workspace.getWorkspaceFolder(resource);
		if (root) {
			return vscode.Uri.file(path.join(root.uri.fsPath, href)).toString();
		}

		// otherwise look relative to the markdown file
		return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
	}

	private computeCustomStyleSheetIncludes(uri: vscode.Uri): string {
		if (this.config.styles && Array.isArray(this.config.styles)) {
			return this.config.styles.map((style) => {
				return `<link rel="stylesheet" class="code-user-style" data-source="${style.replace(/"/g, '&quot;')}" href="${this.fixHref(uri, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(nonce: string): string {
		return `<style nonce="${nonce}">
			body {
				${this.config.fontFamily ? `font-family: ${this.config.fontFamily};` : ''}
				${isNaN(this.config.fontSize) ? '' : `font-size: ${this.config.fontSize}px;`}
				${isNaN(this.config.lineHeight) ? '' : `line-height: ${this.config.lineHeight};`}
			}
		</style>`;
	}

	private getStyles(resource: vscode.Uri, nonce: string): string {
		const baseStyles = [
			this.getMediaPath('markdown.css'),
			this.getMediaPath('tomorrow.css')
		].concat(this.extraStyles.map(resource => resource.toString()));

		return `${baseStyles.map(href => `<link rel="stylesheet" type="text/css" href="${href}">`).join('\n')}
			${this.getSettingsOverrideStyles(nonce)}
			${this.computeCustomStyleSheetIncludes(resource)}`;
	}

	private getScripts(nonce: string): string {
		const scripts = [this.getMediaPath('main.js')].concat(this.extraScripts.map(resource => resource.toString()));
		return scripts
			.map(source => `<script async src="${source}" nonce="${nonce}" charset="UTF-8"></script>`)
			.join('\n');
	}

	public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const sourceUri = vscode.Uri.parse(uri.query);

		let initialLine: number | undefined = undefined;
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.fsPath === sourceUri.fsPath) {
			initialLine = editor.selection.active.line;
		}

		const document = await vscode.workspace.openTextDocument(sourceUri);
		this.config = MarkdownPreviewConfig.getCurrentConfig();

		const initialData = {
			previewUri: uri.toString(),
			source: sourceUri.toString(),
			line: initialLine,
			scrollPreviewWithEditorSelection: this.config.scrollPreviewWithEditorSelection,
			scrollEditorWithPreview: this.config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: this.config.doubleClickToSwitchToEditor
		};

		this.logger.log('provideTextDocumentContent', initialData);

		// Content Security Policy
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
		const csp = this.getCspForResource(sourceUri, nonce);

		const body = await this.engine.render(sourceUri, this.config.previewFrontMatter === 'hide', document.getText());
		return `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-markdown-preview-data" data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}" data-strings="${JSON.stringify(previewStrings).replace(/"/g, '&quot;')}">
				<script src="${this.getMediaPath('csp.js')}" nonce="${nonce}"></script>
				<script src="${this.getMediaPath('loading.js')}" nonce="${nonce}"></script>
				${this.getStyles(sourceUri, nonce)}
				<base href="${document.uri.toString(true)}">
			</head>
			<body class="vscode-body ${this.config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${this.config.wordWrap ? 'wordWrap' : ''} ${this.config.markEditorSelection ? 'showEditorSelection' : ''}">
				${body}
				<div class="code-line" data-line="${document.lineCount}"></div>
				${this.getScripts(nonce)}
			</body>
			</html>`;
	}

	public updateConfiguration() {
		const newConfig = MarkdownPreviewConfig.getCurrentConfig();
		if (!this.config.isEqualTo(newConfig)) {
			this.config = newConfig;
			// update all generated md documents
			for (const document of vscode.workspace.textDocuments) {
				if (document.uri.scheme === 'markdown') {
					this.update(document.uri);
				}
			}
		}
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

	private getCspForResource(resource: vscode.Uri, nonce: string): string {
		switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
			case MarkdownPreviewSecurityLevel.AllowInsecureContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' http: https: data:; media-src 'self' http: https: data:; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' http: https: data:; font-src 'self' http: https: data:;">`;

			case MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent:
				return '';

			case MarkdownPreviewSecurityLevel.Strict:
			default:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https: data:; media-src 'self' https: data:; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https: data:; font-src 'self' https: data:;">`;
		}
	}
}
