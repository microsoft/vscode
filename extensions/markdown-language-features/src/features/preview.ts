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
import { getVisibleLine, TopmostLineMonitor } from '../util/topmostLineMonitor';
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
	readonly body: { id: string, width: number, height: number; }[];
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
	readonly type: 'openLink';
	readonly body: {
		readonly href: string;
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

interface DynamicPreviewInput {
	readonly resource: vscode.Uri;
	readonly resourceColumn: vscode.ViewColumn;
	readonly locked: boolean;
	readonly line?: number;
}

export class DynamicMarkdownPreview extends Disposable {

	public static readonly viewType = 'markdown.preview';

	private readonly delay = 300;

	private _resource: vscode.Uri;
	private readonly _resourceColumn: vscode.ViewColumn;

	private _locked: boolean;

	private readonly editor: vscode.WebviewPanel;
	private throttleTimer: any;
	private line: number | undefined = undefined;
	private firstUpdate = true;
	private currentVersion?: PreviewDocumentVersion;
	private isScrolling = false;
	private _disposed: boolean = false;
	private imageInfo: { id: string, width: number, height: number; }[] = [];
	private scrollToFragment: string | undefined;

	public static revive(
		input: DynamicPreviewInput,
		webview: vscode.WebviewPanel,
		contentProvider: MarkdownContentProvider,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: Logger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
	): DynamicMarkdownPreview {
		webview.webview.options = DynamicMarkdownPreview.getWebviewOptions(input.resource, contributionProvider.contributions);
		webview.title = DynamicMarkdownPreview.getPreviewTitle(input.resource, input.locked);

		return new DynamicMarkdownPreview(webview, input,
			contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider);
	}

	public static create(
		input: DynamicPreviewInput,
		previewColumn: vscode.ViewColumn,
		contentProvider: MarkdownContentProvider,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: Logger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider
	): DynamicMarkdownPreview {
		const webview = vscode.window.createWebviewPanel(
			DynamicMarkdownPreview.viewType,
			DynamicMarkdownPreview.getPreviewTitle(input.resource, input.locked),
			previewColumn, {
			enableFindWidget: true,
			...DynamicMarkdownPreview.getWebviewOptions(input.resource, contributionProvider.contributions)
		});

		return new DynamicMarkdownPreview(webview, input,
			contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider);
	}

	private constructor(
		webview: vscode.WebviewPanel,
		input: DynamicPreviewInput,
		private readonly _contentProvider: MarkdownContentProvider,
		private readonly _previewConfigurations: MarkdownPreviewConfigurationManager,
		private readonly _logger: Logger,
		topmostLineMonitor: TopmostLineMonitor,
		private readonly _contributionProvider: MarkdownContributionProvider,
	) {
		super();
		this._resource = input.resource;
		this._resourceColumn = input.resourceColumn;
		this._locked = input.locked;
		this.editor = webview;
		if (!isNaN(input.line!)) {
			this.line = input.line;
		}

		this._register(this.editor.onDidDispose(() => {
			this.dispose();
		}));

		this._register(this.editor.onDidChangeViewState(e => {
			this._onDidChangeViewStateEmitter.fire(e);
		}));

		this._register(_contributionProvider.onContributionsChanged(() => {
			setImmediate(() => this.refresh());
		}));

		this._register(this.editor.webview.onDidReceiveMessage((e: CacheImageSizesMessage | RevealLineMessage | DidClickMessage | ClickLinkMessage | ShowPreviewSecuritySelectorMessage | PreviewStyleLoadErrorMessage) => {
			if (e.source !== this._resource.toString()) {
				return;
			}

			switch (e.type) {
				case 'cacheImageSizes':
					this.imageInfo = e.body;
					break;

				case 'revealLine':
					this.onDidScrollPreview(e.body.line);
					break;

				case 'didClick':
					this.onDidClickPreview(e.body.line);
					break;

				case 'openLink':
					this.onDidClickPreviewLink(e.body.href);
					break;

				case 'showPreviewSecuritySelector':
					vscode.commands.executeCommand('markdown.showPreviewSecuritySelector', e.source);
					break;

				case 'previewStyleLoadError':
					vscode.window.showWarningMessage(localize('onPreviewStyleLoadError', "Could not load 'markdown.styles': {0}", e.body.unloadedStyles.join(', ')));
					break;
			}
		}));

		this._register(vscode.workspace.onDidChangeTextDocument(event => {
			if (this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}));

		this._register(topmostLineMonitor.onDidChanged(event => {
			if (this.isPreviewOf(event.resource)) {
				this.updateForView(event.resource, event.line);
			}
		}));

		this._register(vscode.window.onDidChangeTextEditorSelection(event => {
			if (this.isPreviewOf(event.textEditor.document.uri)) {
				this.postMessage({
					type: 'onDidChangeTextEditorSelection',
					line: event.selections[0].active.line,
					source: this.resource.toString()
				});
			}
		}));

		this._register(vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && isMarkdownFile(editor.document) && !this._locked) {
				this.update(editor.document.uri, false);
			}
		}));

		this.doUpdate();
	}

	private readonly _onDisposeEmitter = this._register(new vscode.EventEmitter<void>());
	public readonly onDispose = this._onDisposeEmitter.event;

	private readonly _onDidChangeViewStateEmitter = this._register(new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
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
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this._onDisposeEmitter.fire();
		this._onDisposeEmitter.dispose();

		this.editor.dispose();
		super.dispose();
	}

	public update(resource: vscode.Uri, isRefresh = true) {
		// Reposition scroll preview, position scroll to the top if active text editor
		// doesn't corresponds with preview
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			if (!isRefresh || this._previewConfigurations.loadAndCacheConfiguration(this._resource).scrollEditorWithPreview) {
				if (editor.document.uri.fsPath === resource.fsPath) {
					this.line = getVisibleLine(editor);
				} else {
					this.line = 0;
				}
			}
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
				this.doUpdate(isRefresh);
			} else {
				this.throttleTimer = setTimeout(() => this.doUpdate(isRefresh), this.delay);
			}
		}

		this.firstUpdate = false;
	}

	public refresh() {
		this.update(this._resource, true);
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

	public matches(otherPreview: DynamicMarkdownPreview): boolean {
		return this.matchesResource(otherPreview._resource, otherPreview.position, otherPreview._locked);
	}

	public reveal(viewColumn: vscode.ViewColumn) {
		this.editor.reveal(viewColumn);
	}

	public toggleLock() {
		this._locked = !this._locked;
		this.editor.title = DynamicMarkdownPreview.getPreviewTitle(this._resource, this._locked);
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

	private async doUpdate(forceUpdate?: boolean): Promise<void> {
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
		if (!forceUpdate && this.currentVersion?.equals(pendingVersion)) {
			if (this.line) {
				this.updateForView(markdownResource, this.line);
			}
			return;
		}

		this.currentVersion = pendingVersion;
		if (this._resource === markdownResource) {
			const self = this;
			const resourceProvider: WebviewResourceProvider = {
				asWebviewUri: (resource) => {
					return this.editor.webview.asWebviewUri(normalizeResource(markdownResource, resource));
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
			localResourceRoots: DynamicMarkdownPreview.getLocalResourceRoots(resource, contributions)
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

		const config = this._previewConfigurations.loadAndCacheConfiguration(this._resource);
		if (!config.scrollEditorWithPreview) {
			return;
		}

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
		this.editor.title = DynamicMarkdownPreview.getPreviewTitle(this._resource, this._locked);
		this.editor.iconPath = this.iconPath;
		this.editor.webview.options = DynamicMarkdownPreview.getWebviewOptions(this._resource, this._contributionProvider.contributions);
		this.editor.webview.html = html;
	}

	private async onDidClickPreviewLink(href: string) {
		let [hrefPath, fragment] = decodeURIComponent(href).split('#');

		// We perviously already resolve absolute paths.
		// Now make sure we handle relative file paths
		if (hrefPath[0] !== '/') {
			hrefPath = path.join(path.dirname(this.resource.path), hrefPath);
		}

		const config = vscode.workspace.getConfiguration('markdown', this.resource);
		const openLinks = config.get<string>('preview.openMarkdownLinks', 'inPreview');
		if (openLinks === 'inPreview') {
			const markdownLink = await resolveLinkToMarkdownFile(hrefPath);
			if (markdownLink) {
				if (fragment) {
					this.scrollToFragment = fragment;
				}
				this.update(markdownLink);
				return;
			}
		}

		vscode.commands.executeCommand('_markdown.openDocumentLink', { path: hrefPath, fragment, fromResource: this.resource });
	}
}
