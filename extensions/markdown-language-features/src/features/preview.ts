/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { Logger } from '../logger';
import { MarkdownContentProvider } from './previewContentProvider';
import { Disposable } from '../util/dispose';

import * as nls from 'vscode-nls';
import { getVisibleLine, MarkdownFileTopmostLineMonitor } from '../util/topmostLineMonitor';
import { MarkdownPreviewConfigurationManager } from './previewConfig';
import { MarkdownContributionProvider, MarkdownContributions } from '../markdownExtensions';
import { isMarkdownFile } from '../util/file';
import { resolveLinkToMarkdownFile } from '../commands/openDocumentLink';
import { WebviewResourceProvider, normalizeResource } from '../util/resources';
const localize = nls.loadMessageBundle();

interface WebviewMessage {
	readonly source: string;
}

interface CacheImageSizesMessage extends WebviewMessage {
	readonly type: 'cacheImageSizes';
	readonly body: { id: string, width: number, height: number }[];
}

interface RevealLineMessage extends WebviewMessage {
	readonly type: 'revealLine';
	readonly body: {
		readonly line: number;
	};
}

interface DidClickMessage extends WebviewMessage {
	readonly type: 'didClick';
	readonly body: {
		readonly line: number;
	};
}

interface ClickLinkMessage extends WebviewMessage {
	readonly type: 'clickLink';
	readonly body: {
		readonly path: string;
		readonly fragment?: string;
	};
}

interface ShowPreviewSecuritySelectorMessage extends WebviewMessage {
	readonly type: 'showPreviewSecuritySelector';
}

interface PreviewStyleLoadErrorMessage extends WebviewMessage {
	readonly type: 'previewStyleLoadError';
	readonly body: {
		readonly unloadedStyles: string[];
	};
}

export class PreviewDocumentVersion {
	public constructor(
		public readonly resource: vscode.Uri,
		public readonly version: number,
	) { }

	public equals(other: PreviewDocumentVersion): boolean {
		return this.resource.fsPath === other.resource.fsPath
			&& this.version === other.version;
	}
}

export class MarkdownPreview extends Disposable {

	public static readonly viewType = 'markdown.preview';

	private _resource: vscode.Uri;
	private _locked: boolean;

	private readonly editor: vscode.WebviewPanel;
	private throttleTimer: any;
	private line: number | undefined = undefined;
	private firstUpdate = true;
	private currentVersion?: PreviewDocumentVersion;
	private forceUpdate = false;
	private isScrolling = false;
	private _disposed: boolean = false;
	private imageInfo: { id: string, width: number, height: number }[] = [];
	private scrollToFragment: string | undefined;

	public static async revive(
		webview: vscode.WebviewPanel,
		state: any,
		contentProvider: MarkdownContentProvider,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: Logger,
		topmostLineMonitor: MarkdownFileTopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
	): Promise<MarkdownPreview> {
		const resource = vscode.Uri.parse(state.resource);
		const locked = state.locked;
		const line = state.line;
		const resourceColumn = state.resourceColumn;

		const preview = new MarkdownPreview(
			webview,
			resource,
			locked,
			resourceColumn,
			contentProvider,
			previewConfigurations,
			logger,
			topmostLineMonitor,
			contributionProvider);

		preview.editor.webview.options = MarkdownPreview.getWebviewOptions(resource, contributionProvider.contributions);

		if (!isNaN(line)) {
			preview.line = line;
		}
		await preview.doUpdate();
		return preview;
	}

	public static create(
		resource: vscode.Uri,
		previewColumn: vscode.ViewColumn,
		resourceColumn: vscode.ViewColumn,
		locked: boolean,
		contentProvider: MarkdownContentProvider,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: Logger,
		topmostLineMonitor: MarkdownFileTopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider
	): MarkdownPreview {
		const webview = vscode.window.createWebviewPanel(
			MarkdownPreview.viewType,
			MarkdownPreview.getPreviewTitle(resource, locked),
			previewColumn, {
				enableFindWidget: true,
				...MarkdownPreview.getWebviewOptions(resource, contributionProvider.contributions)
			});

		return new MarkdownPreview(
			webview,
			resource,
			locked,
			resourceColumn,
			contentProvider,
			previewConfigurations,
			logger,
			topmostLineMonitor,
			contributionProvider);
	}

	private constructor(
		webview: vscode.WebviewPanel,
		resource: vscode.Uri,
		locked: boolean,
		private readonly _resourceColumn: vscode.ViewColumn,
		private readonly _contentProvider: MarkdownContentProvider,
		private readonly _previewConfigurations: MarkdownPreviewConfigurationManager,
		private readonly _logger: Logger,
		topmostLineMonitor: MarkdownFileTopmostLineMonitor,
		private readonly _contributionProvider: MarkdownContributionProvider,
	) {
		super();
		this._resource = resource;
		this._locked = locked;
		this.editor = webview;

		this.editor.onDidDispose(() => {
			this.dispose();
		}, null, this._disposables);

		this.editor.onDidChangeViewState(e => {
			this._onDidChangeViewStateEmitter.fire(e);
		}, null, this._disposables);

		_contributionProvider.onContributionsChanged(() => {
			setImmediate(() => this.refresh());
		}, null, this._disposables);

		this.editor.webview.onDidReceiveMessage((e: CacheImageSizesMessage | RevealLineMessage | DidClickMessage | ClickLinkMessage | ShowPreviewSecuritySelectorMessage | PreviewStyleLoadErrorMessage) => {
			if (e.source !== this._resource.toString()) {
				return;
			}

			switch (e.type) {
				case 'cacheImageSizes':
					this.onCacheImageSizes(e.body);
					break;

				case 'revealLine':
					this.onDidScrollPreview(e.body.line);
					break;

				case 'didClick':
					this.onDidClickPreview(e.body.line);
					break;

				case 'clickLink':
					this.onDidClickPreviewLink(e.body.path, e.body.fragment);
					break;

				case 'showPreviewSecuritySelector':
					vscode.commands.executeCommand('markdown.showPreviewSecuritySelector', e.source);
					break;

				case 'previewStyleLoadError':
					vscode.window.showWarningMessage(localize('onPreviewStyleLoadError', "Could not load 'markdown.styles': {0}", e.body.unloadedStyles.join(', ')));
					break;
			}
		}, null, this._disposables);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}, null, this._disposables);

		topmostLineMonitor.onDidChangeTopmostLine(event => {
			if (this.isPreviewOf(event.resource)) {
				this.updateForView(event.resource, event.line);
			}
		}, null, this._disposables);

		vscode.window.onDidChangeTextEditorSelection(event => {
			if (this.isPreviewOf(event.textEditor.document.uri)) {
				this.postMessage({
					type: 'onDidChangeTextEditorSelection',
					line: event.selections[0].active.line,
					source: this.resource.toString()
				});
			}
		}, null, this._disposables);

		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && isMarkdownFile(editor.document) && !this._locked) {
				this.update(editor.document.uri);
			}
		}, null, this._disposables);
	}

	private readonly _onDisposeEmitter = new vscode.EventEmitter<void>();
	public readonly onDispose = this._onDisposeEmitter.event;

	private readonly _onDidChangeViewStateEmitter = new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>();
	public readonly onDidChangeViewState = this._onDidChangeViewStateEmitter.event;

	public get resource(): vscode.Uri {
		return this._resource;
	}

	public get resourceColumn(): vscode.ViewColumn {
		return this._resourceColumn;
	}

	public get state() {
		return {
			resource: this.resource.toString(),
			locked: this._locked,
			line: this.line,
			resourceColumn: this.resourceColumn,
			imageInfo: this.imageInfo,
			fragment: this.scrollToFragment
		};
	}

	public dispose() {
		super.dispose();
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this._onDisposeEmitter.fire();
		this._onDisposeEmitter.dispose();

		this._onDidChangeViewStateEmitter.dispose();
		this.editor.dispose();
	}

	public update(resource: vscode.Uri) {
		const editor = vscode.window.activeTextEditor;
		// Reposition scroll preview, position scroll to the top if active text editor
		// doesn't corresponds with preview
		if (editor && editor.document.uri.fsPath === resource.fsPath) {
			this.line = getVisibleLine(editor);
		} else {
			this.line = 0;
		}

		// If we have changed resources, cancel any pending updates
		const isResourceChange = resource.fsPath !== this._resource.fsPath;
		if (isResourceChange) {
			clearTimeout(this.throttleTimer);
			this.throttleTimer = undefined;
		}

		this._resource = resource;

		// Schedule update if none is pending
		if (!this.throttleTimer) {
			if (isResourceChange || this.firstUpdate) {
				this.doUpdate();
			} else {
				this.throttleTimer = setTimeout(() => this.doUpdate(), 300);
			}
		}

		this.firstUpdate = false;
	}

	public refresh() {
		this.forceUpdate = true;
		this.update(this._resource);
	}

	public updateConfiguration() {
		if (this._previewConfigurations.hasConfigurationChanged(this._resource)) {
			this.refresh();
		}
	}

	public get position(): vscode.ViewColumn | undefined {
		return this.editor.viewColumn;
	}

	public matchesResource(
		otherResource: vscode.Uri,
		otherPosition: vscode.ViewColumn | undefined,
		otherLocked: boolean
	): boolean {
		if (this.position !== otherPosition) {
			return false;
		}

		if (this._locked) {
			return otherLocked && this.isPreviewOf(otherResource);
		} else {
			return !otherLocked;
		}
	}

	public matches(otherPreview: MarkdownPreview): boolean {
		return this.matchesResource(otherPreview._resource, otherPreview.position, otherPreview._locked);
	}

	public reveal(viewColumn: vscode.ViewColumn) {
		this.editor.reveal(viewColumn);
	}

	public toggleLock() {
		this._locked = !this._locked;
		this.editor.title = MarkdownPreview.getPreviewTitle(this._resource, this._locked);
	}

	private get iconPath() {
		const root = path.join(this._contributionProvider.extensionPath, 'media');
		return {
			light: vscode.Uri.file(path.join(root, 'preview-light.svg')),
			dark: vscode.Uri.file(path.join(root, 'preview-dark.svg'))
		};
	}

	private isPreviewOf(resource: vscode.Uri): boolean {
		return this._resource.fsPath === resource.fsPath;
	}

	private static getPreviewTitle(resource: vscode.Uri, locked: boolean): string {
		return locked
			? localize('lockedPreviewTitle', '[Preview] {0}', path.basename(resource.fsPath))
			: localize('previewTitle', 'Preview {0}', path.basename(resource.fsPath));
	}

	private updateForView(resource: vscode.Uri, topLine: number | undefined) {
		if (!this.isPreviewOf(resource)) {
			return;
		}

		if (this.isScrolling) {
			this.isScrolling = false;
			return;
		}

		if (typeof topLine === 'number') {
			this._logger.log('updateForView', { markdownFile: resource });
			this.line = topLine;
			this.postMessage({
				type: 'updateView',
				line: topLine,
				source: resource.toString()
			});
		}
	}

	private postMessage(msg: any) {
		if (!this._disposed) {
			this.editor.webview.postMessage(msg);
		}
	}

	private async doUpdate(): Promise<void> {
		if (this._disposed) {
			return;
		}

		const markdownResource = this._resource;

		clearTimeout(this.throttleTimer);
		this.throttleTimer = undefined;

		let document: vscode.TextDocument;
		try {
			document = await vscode.workspace.openTextDocument(markdownResource);
		} catch {
			await this.showFileNotFoundError();
			return;
		}

		if (this._disposed) {
			return;
		}

		const pendingVersion = new PreviewDocumentVersion(markdownResource, document.version);
		if (!this.forceUpdate && this.currentVersion && this.currentVersion.equals(pendingVersion)) {
			if (this.line) {
				this.updateForView(markdownResource, this.line);
			}
			return;
		}
		this.forceUpdate = false;

		this.currentVersion = pendingVersion;
		if (this._resource === markdownResource) {
			const self = this;
			const resourceProvider: WebviewResourceProvider = {
				toWebviewResource: (resource) => {
					return this.editor.webview.toWebviewResource(normalizeResource(markdownResource, resource));
				},
				get cspSource() { return self.editor.webview.cspSource; }
			};
			const content = await this._contentProvider.provideTextDocumentContent(document, resourceProvider, this._previewConfigurations, this.line, this.state);
			// Another call to `doUpdate` may have happened.
			// Make sure we are still updating for the correct document
			if (this.currentVersion && this.currentVersion.equals(pendingVersion)) {
				this.setContent(content);
			}
		}
	}

	private static getWebviewOptions(
		resource: vscode.Uri,
		contributions: MarkdownContributions
	): vscode.WebviewOptions {
		return {
			enableScripts: true,
			localResourceRoots: MarkdownPreview.getLocalResourceRoots(resource, contributions)
		};
	}

	private static getLocalResourceRoots(
		base: vscode.Uri,
		contributions: MarkdownContributions
	): ReadonlyArray<vscode.Uri> {
		const baseRoots = Array.from(contributions.previewResourceRoots);

		const folder = vscode.workspace.getWorkspaceFolder(base);
		if (folder) {
			baseRoots.push(folder.uri);
		} else if (!base.scheme || base.scheme === 'file') {
			baseRoots.push(vscode.Uri.file(path.dirname(base.fsPath)));
		}

		return baseRoots.map(root => normalizeResource(base, root));
	}

	private onDidScrollPreview(line: number) {
		this.line = line;
		for (const editor of vscode.window.visibleTextEditors) {
			if (!this.isPreviewOf(editor.document.uri)) {
				continue;
			}

			this.isScrolling = true;
			const sourceLine = Math.floor(line);
			const fraction = line - sourceLine;
			const text = editor.document.lineAt(sourceLine).text;
			const start = Math.floor(fraction * text.length);
			editor.revealRange(
				new vscode.Range(sourceLine, start, sourceLine + 1, 0),
				vscode.TextEditorRevealType.AtTop);
		}
	}

	private async onDidClickPreview(line: number): Promise<void> {
		for (const visibleEditor of vscode.window.visibleTextEditors) {
			if (this.isPreviewOf(visibleEditor.document.uri)) {
				const editor = await vscode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn);
				const position = new vscode.Position(line, 0);
				editor.selection = new vscode.Selection(position, position);
				return;
			}
		}

		vscode.workspace.openTextDocument(this._resource)
			.then(vscode.window.showTextDocument)
			.then(undefined, () => {
				vscode.window.showErrorMessage(localize('preview.clickOpenFailed', 'Could not open {0}', this._resource.toString()));
			});
	}

	private async showFileNotFoundError() {
		this.setContent(this._contentProvider.provideFileNotFoundContent(this._resource));
	}

	private setContent(html: string): void {
		this.editor.title = MarkdownPreview.getPreviewTitle(this._resource, this._locked);
		this.editor.iconPath = this.iconPath;
		this.editor.webview.options = MarkdownPreview.getWebviewOptions(this._resource, this._contributionProvider.contributions);
		this.editor.webview.html = html;
	}

	private async onDidClickPreviewLink(path: string, fragment: string | undefined) {
		this.scrollToFragment = undefined;
		const config = vscode.workspace.getConfiguration('markdown', this.resource);
		const openLinks = config.get<string>('preview.openMarkdownLinks', 'inPreview');
		if (openLinks === 'inPreview') {
			const markdownLink = await resolveLinkToMarkdownFile(path);
			if (markdownLink) {
				if (fragment) {
					this.scrollToFragment = fragment;
				}
				this.update(markdownLink);
				return;
			}
		}

		vscode.commands.executeCommand('_markdown.openDocumentLink', { path, fragment });
	}

	private async onCacheImageSizes(imageInfo: { id: string, width: number, height: number }[]) {
		this.imageInfo = imageInfo;
	}
}

export interface PreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly locked: boolean;
}
