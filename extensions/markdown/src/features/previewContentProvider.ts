/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownEngine } from '../markdownEngine';

import * as nls from 'vscode-nls';
import { Logger } from '../logger';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from '../security';
const localize = nls.loadMessageBundle();

const previewStrings = {
	cspAlertMessageText: localize('preview.securityMessage.text', 'Some content has been disabled in this document'),
	cspAlertMessageTitle: localize('preview.securityMessage.title', 'Potentially unsafe or insecure content has been disabled in the markdown preview. Change the Markdown preview security setting to allow insecure content or enable scripts'),
	cspAlertMessageLabel: localize('preview.securityMessage.label', 'Content Disabled Security Warning')
};

export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown';
}

export class MarkdownPreviewConfig {
	public static getConfigForResource(resource: vscode.Uri) {
		return new MarkdownPreviewConfig(resource);
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

	private constructor(resource: vscode.Uri) {
		const editorConfig = vscode.workspace.getConfiguration('editor', resource);
		const markdownConfig = vscode.workspace.getConfiguration('markdown', resource);
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

export class PreviewConfigManager {
	private previewConfigurationsForWorkspaces = new Map<string, MarkdownPreviewConfig>();

	public loadAndCacheConfiguration(
		resource: vscode.Uri
	) {
		const config = MarkdownPreviewConfig.getConfigForResource(resource);
		this.previewConfigurationsForWorkspaces.set(this.getKey(resource), config);
		return config;
	}

	public shouldUpdateConfiguration(
		resource: vscode.Uri
	): boolean {
		const key = this.getKey(resource);
		const currentConfig = this.previewConfigurationsForWorkspaces.get(key);
		const newConfig = MarkdownPreviewConfig.getConfigForResource(resource);
		return (!currentConfig || !currentConfig.isEqualTo(newConfig));
	}

	private getKey(
		resource: vscode.Uri
	): string {
		const folder = vscode.workspace.getWorkspaceFolder(resource);
		if (!folder) {
			return '';
		}
		return folder.uri.toString();
	}
}

export class MarkdownContentProvider {
	private extraStyles: Array<vscode.Uri> = [];
	private extraScripts: Array<vscode.Uri> = [];

	constructor(
		private engine: MarkdownEngine,
		private context: vscode.ExtensionContext,
		private cspArbiter: ContentSecurityPolicyArbiter,
		private logger: Logger
	) { }

	public addScript(resource: vscode.Uri): void {
		this.extraScripts.push(resource);
	}

	public addStyle(resource: vscode.Uri): void {
		this.extraStyles.push(resource);
	}

	private getMediaPath(mediaFile: string): string {
		return vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile)))
			.with({ scheme: 'vscode-extension-resource' })
			.toString();
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (!href) {
			return href;
		}

		// Use href if it is already an URL
		const hrefUri = vscode.Uri.parse(href);
		if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
			return hrefUri.toString();
		}

		// Use href as file URI if it is absolute
		if (path.isAbsolute(href) || hrefUri.scheme === 'file') {
			return vscode.Uri.file(href)
				.with({ scheme: 'vscode-workspace-resource' })
				.toString();
		}

		// use a workspace relative path if there is a workspace
		let root = vscode.workspace.getWorkspaceFolder(resource);
		if (root) {
			return vscode.Uri.file(path.join(root.uri.fsPath, href))
				.with({ scheme: 'vscode-workspace-resource' })
				.toString();
		}

		// otherwise look relative to the markdown file
		return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href))
			.with({ scheme: 'vscode-workspace-resource' })
			.toString();
	}

	private computeCustomStyleSheetIncludes(resource: vscode.Uri, config: MarkdownPreviewConfig): string {
		if (config.styles && Array.isArray(config.styles)) {
			return config.styles.map(style => {
				return `<link rel="stylesheet" class="code-user-style" data-source="${style.replace(/"/g, '&quot;')}" href="${this.fixHref(resource, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(nonce: string, config: MarkdownPreviewConfig): string {
		return `<style nonce="${nonce}">
			body {
				${config.fontFamily ? `font-family: ${config.fontFamily};` : ''}
				${isNaN(config.fontSize) ? '' : `font-size: ${config.fontSize}px;`}
				${isNaN(config.lineHeight) ? '' : `line-height: ${config.lineHeight};`}
			}
		</style>`;
	}

	private getStyles(resource: vscode.Uri, nonce: string, config: MarkdownPreviewConfig): string {
		const baseStyles = [
			this.getMediaPath('markdown.css'),
			this.getMediaPath('tomorrow.css')
		].concat(this.extraStyles.map(resource => resource.toString()));

		return `${baseStyles.map(href => `<link rel="stylesheet" type="text/css" href="${href}">`).join('\n')}
			${this.getSettingsOverrideStyles(nonce, config)}
			${this.computeCustomStyleSheetIncludes(resource, config)}`;
	}

	private getScripts(nonce: string): string {
		const scripts = [this.getMediaPath('main.js')].concat(this.extraScripts.map(resource => resource.toString()));
		return scripts
			.map(source => `<script async src="${source}" nonce="${nonce}" charset="UTF-8"></script>`)
			.join('\n');
	}

	public async provideTextDocumentContent(
		markdownDocument: vscode.TextDocument,
		previewConfigurations: PreviewConfigManager,
		initialLine: number | undefined = undefined
	): Promise<string> {
		const sourceUri = markdownDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			line: initialLine,
			scrollPreviewWithEditorSelection: config.scrollPreviewWithEditorSelection,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this.cspArbiter.shouldDisableSecurityWarnings()
		};

		this.logger.log('provideTextDocumentContent', initialData);

		// Content Security Policy
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
		const csp = this.getCspForResource(sourceUri, nonce);

		const body = await this.engine.render(sourceUri, config.previewFrontMatter === 'hide', markdownDocument.getText());
		return `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-markdown-preview-data" data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}" data-strings="${JSON.stringify(previewStrings).replace(/"/g, '&quot;')}">
				<script src="${this.getMediaPath('csp.js')}" nonce="${nonce}"></script>
				<script src="${this.getMediaPath('loading.js')}" nonce="${nonce}"></script>
				${this.getStyles(sourceUri, nonce, config)}
				<base href="${markdownDocument.uri.with({ scheme: 'vscode-workspace-resource' }).toString(true)}">
			</head>
			<body class="vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${body}
				<div class="code-line" data-line="${markdownDocument.lineCount}"></div>
				${this.getScripts(nonce)}
			</body>
			</html>`;
	}

	private getCspForResource(resource: vscode.Uri, nonce: string): string {
		switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
			case MarkdownPreviewSecurityLevel.AllowInsecureContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-workspace-resource: vscode-extension-resource: http: https: data:; media-src vscode-workspace-resource: vscode-extension-resource: http: https: data:; script-src 'nonce-${nonce}'; style-src vscode-workspace-resource: 'unsafe-inline' http: https: data: vscode-extension-resource:; font-src vscode-workspace-resource: http: https: data:;">`;

			case MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent:
				return '';

			case MarkdownPreviewSecurityLevel.Strict:
			default:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-workspace-resource: vscode-extension-resource: https: data:; media-src vscode-workspace-resource: vscode-extension-resource: https: data:; script-src 'nonce-${nonce}'; style-src vscode-workspace-resource: 'unsafe-inline' https: data: vscode-extension-resource:; font-src vscode-workspace-resource: https: data:;">`;
		}
	}
}

class MarkdownPreview {

	public static previewScheme = 'vscode-markdown-preview';
	private static previewCount = 0;

	private readonly webview: vscode.Webview;
	private throttleTimer: any;
	private initialLine: number | undefined = undefined;
	private readonly disposables: vscode.Disposable[] = [];

	private currentVersion?: { resource: vscode.Uri, version: number };

	constructor(
		private resource: vscode.Uri,
		public resourceColumn: vscode.ViewColumn,
		previewColumn: vscode.ViewColumn,
		public readonly pinned: boolean,
		private readonly contentProvider: MarkdownContentProvider,
		private readonly previewConfigurations: PreviewConfigManager,
		private readonly logger: Logger
	) {
		this.webview = vscode.window.createWebview(
			vscode.Uri.parse(`${MarkdownPreview.previewScheme}:${MarkdownPreview.previewCount++}`),
			previewColumn, {
				enableScripts: true,
				localResourceRoots: this.getLocalResourceRoots(resource)
			});

		this.webview.onDispose(() => {
			this._onDisposeEmitter.fire();
		}, null, this.disposables);

		this.webview.onMessage(e => {
			vscode.commands.executeCommand(e.command, ...e.args);
		}, null, this.disposables);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (isMarkdownFile(event.document) && this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}, null, this.disposables);

		vscode.window.onDidChangeTextEditorSelection(event => {
			if (isMarkdownFile(event.textEditor.document) && this.isPreviewOf(event.textEditor.document.uri)) {
				const resource = event.textEditor.document.uri;
				this.updateForSelection(resource, event.selections[0].active.line);
			}
		}, null, this.disposables);
	}

	private readonly _onDisposeEmitter = new vscode.EventEmitter<void>();
	public readonly onDispose = this._onDisposeEmitter.event;

	public dispose() {
		this._onDisposeEmitter.dispose();
		this.webview.dispose();

		while (this.disposables.length) {
			const item = this.disposables.pop();
			if (item) {
				item.dispose();
			}
		}
	}

	public update(resource: vscode.Uri) {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.fsPath === resource.fsPath) {
			this.initialLine = editor.selection.active.line;
		} else {
			this.initialLine = undefined;
		}

		// Schedule update
		if (!this.throttleTimer) {
			this.throttleTimer = setTimeout(() => this.doUpdate(), resource.fsPath === this.resource.fsPath ? 300 : 0);
		}

		this.resource = resource;
	}

	public refresh() {
		this.update(this.resource);
	}

	public updateConfiguration() {
		if (this.previewConfigurations.shouldUpdateConfiguration(this.resource)) {
			this.refresh();
		}
	}

	public get viewColumn(): vscode.ViewColumn | undefined {
		return this.webview.viewColumn;
	}

	public isPreviewOf(resource: vscode.Uri): boolean {
		return this.resource.fsPath === resource.fsPath;
	}

	public show(viewColumn: vscode.ViewColumn) {
		this.webview.show(viewColumn);
	}

	private getPreviewTitle(resource: vscode.Uri): string {
		return this.pinned
			? localize('pinnedPreviewTitle', '[Preview] {0}', path.basename(resource.fsPath))
			: localize('previewTitle', 'Preview {0}', path.basename(resource.fsPath));
	}

	private updateForSelection(resource: vscode.Uri, line: number) {
		if (!this.isPreviewOf(resource)) {
			return;
		}

		this.logger.log('updatePreviewForSelection', { markdownFile: resource });
		this.initialLine = line;
		this.webview.postMessage({ line, source: resource.toString() });
	}

	private async doUpdate(): Promise<void> {
		const resource = this.resource;
		this.throttleTimer = undefined;

		const document = await vscode.workspace.openTextDocument(resource);
		if (this.currentVersion && this.currentVersion.resource.fsPath === resource.fsPath && this.currentVersion.version === document.version) {
			if (this.initialLine) {
				this.updateForSelection(resource, this.initialLine);
			}
			return;
		}

		this.currentVersion = { resource, version: document.version };
		this.contentProvider.provideTextDocumentContent(document, this.previewConfigurations, this.initialLine)
			.then(content => {
				if (this.resource === resource) {
					this.webview.title = this.getPreviewTitle(this.resource);
					this.webview.html = content;
				}
			});
	}

	private getLocalResourceRoots(resource: vscode.Uri): vscode.Uri[] {
		const folder = vscode.workspace.getWorkspaceFolder(resource);
		if (folder) {
			return [folder.uri];
		}

		if (!resource.scheme || resource.scheme === 'file') {
			return [vscode.Uri.parse(path.dirname(resource.fsPath))];
		}

		return [];
	}
}

export interface PreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly pinned: boolean;
}

export class MarkdownPreviewManager {

	private previews: MarkdownPreview[] = [];
	private readonly previewConfigurations = new PreviewConfigManager();

	private readonly disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly contentProvider: MarkdownContentProvider,
		private readonly logger: Logger
	) {
		vscode.window.onDidChangeActiveEditor(editor => {
			vscode.commands.executeCommand('setContext', 'markdownPreview',
				editor && editor.editorType === 'webview' && editor.uri.scheme === MarkdownPreview.previewScheme);

			if (editor && editor.editorType === 'texteditor') {
				if (isMarkdownFile(editor.document)) {
					for (const preview of this.previews.filter(preview => !preview.pinned && preview.resourceColumn === editor.viewColumn)) {
						preview.update(editor.document.uri);
					}
				}
			}
		}, null, this.disposables);
	}

	public dispose(): void {
		while (this.disposables.length) {
			const item = this.disposables.pop();
			if (item) {
				item.dispose();
			}
		}
		while (this.previews.length) {
			const item = this.previews.pop();
			if (item) {
				item.dispose();
			}
		}
	}

	public refresh() {
		for (const preview of this.previews) {
			preview.refresh();
		}
	}

	public updateConfiguration() {
		for (const preview of this.previews) {
			preview.updateConfiguration();
		}
	}

	public preview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	): void {
		let preview = this.getExistingPreview(resource, previewSettings);
		if (preview) {
			preview.resourceColumn = previewSettings.resourceColumn;
			preview.show(previewSettings.previewColumn);
		} else {
			preview = new MarkdownPreview(resource, previewSettings.resourceColumn, previewSettings.previewColumn, previewSettings.pinned, this.contentProvider, this.previewConfigurations, this.logger);
			preview.onDispose(() => {
				const existing = this.previews.indexOf(preview!);
				if (existing >= 0) {
					this.previews.splice(existing, 1);
				}
			});
			this.previews.push(preview);
		}

		preview.update(resource);
	}

	private getExistingPreview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	): MarkdownPreview | undefined {
		if (!previewSettings.pinned) {
			// Only allow a single, non-pinned markdown preview per column
			return this.previews.find(preview =>
				!preview.pinned && preview.viewColumn === previewSettings.previewColumn);
		}

		return this.previews.find(preview =>
			preview.pinned && preview.viewColumn === previewSettings.previewColumn && preview.isPreviewOf(resource));
	}
}