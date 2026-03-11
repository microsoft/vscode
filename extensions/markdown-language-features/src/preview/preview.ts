/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as uri from 'vscode-uri';
import { ILogger } from '../logging';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { MdLinkOpener } from '../util/openDocumentLink';
import { areUrisEqual, WebviewResourceProvider } from '../util/resources';
import { urlToUri } from '../util/url';
import { ImageInfo, MdDocumentRenderer } from './documentRenderer';
import { MarkdownPreviewConfigurationManager } from './previewConfig';
import { scrollEditorToLine, StartingScrollFragment, StartingScrollLine, StartingScrollLocation } from './scrolling';
import { getVisibleLine, LastScrollLocation, TopmostLineMonitor } from './topmostLineMonitor';
import type { FromWebviewMessage, ToWebviewMessage } from '../../types/previewMessaging';

export class PreviewDocumentVersion {

	public readonly resource: vscode.Uri;
	readonly #version: number;

	public constructor(document: vscode.TextDocument) {
		this.resource = document.uri;
		this.#version = document.version;
	}

	public equals(other: PreviewDocumentVersion): boolean {
		return areUrisEqual(this.resource, other.resource)
			&& this.#version === other.#version;
	}
}

interface MarkdownPreviewDelegate {
	getTitle?(resource: vscode.Uri): string;
	getAdditionalState(): {};
	openPreviewLinkToMarkdownFile(markdownLink: vscode.Uri, fragment: string | undefined): void;
}

class MarkdownPreview extends Disposable implements WebviewResourceProvider {

	static readonly #unwatchedImageSchemes = new Set(['https', 'http', 'data']);

	#disposed: boolean = false;

	readonly #delay = 300;
	#throttleTimer: any;

	readonly #resource: vscode.Uri;
	readonly #webviewPanel: vscode.WebviewPanel;

	#line: number | undefined;
	readonly #scrollToFragment: string | undefined;
	#firstUpdate = true;
	#currentVersion?: PreviewDocumentVersion;
	#isScrolling = false;

	#imageInfo: readonly ImageInfo[] = [];
	readonly #fileWatchersBySrc = new Map</* src: */ string, vscode.FileSystemWatcher>();

	readonly #onScrollEmitter = this._register(new vscode.EventEmitter<LastScrollLocation>());
	public readonly onScroll = this.#onScrollEmitter.event;

	readonly #disposeCts = this._register(new vscode.CancellationTokenSource());

	readonly #delegate: MarkdownPreviewDelegate;
	readonly #contentProvider: MdDocumentRenderer;
	readonly #previewConfigurations: MarkdownPreviewConfigurationManager;
	readonly #logger: ILogger;
	readonly #contributionProvider: MarkdownContributionProvider;
	readonly #opener: MdLinkOpener;

	constructor(
		webview: vscode.WebviewPanel,
		resource: vscode.Uri,
		startingScroll: StartingScrollLocation | undefined,
		delegate: MarkdownPreviewDelegate,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: ILogger,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
	) {
		super();

		this.#delegate = delegate;
		this.#contentProvider = contentProvider;
		this.#previewConfigurations = previewConfigurations;
		this.#logger = logger;
		this.#contributionProvider = contributionProvider;
		this.#opener = opener;

		this.#webviewPanel = webview;
		this.#resource = resource;

		switch (startingScroll?.type) {
			case 'line':
				if (!isNaN(startingScroll.line!)) {
					this.#line = startingScroll.line;
				}
				break;

			case 'fragment':
				this.#scrollToFragment = startingScroll.fragment;
				break;
		}

		this._register(contributionProvider.onContributionsChanged(() => {
			setTimeout(() => this.refresh(true), 0);
		}));

		this._register(vscode.workspace.onDidChangeTextDocument(event => {
			if (this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}));

		this._register(vscode.workspace.onDidOpenTextDocument(document => {
			if (this.isPreviewOf(document.uri)) {
				this.refresh();
			}
		}));

		if (vscode.workspace.fs.isWritableFileSystem(resource.scheme)) {
			const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(resource, '*')));
			this._register(watcher.onDidChange(uri => {
				if (this.isPreviewOf(uri)) {
					// Only use the file system event when VS Code does not already know about the file
					if (!vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString())) {
						this.refresh();
					}
				}
			}));
		}

		this._register(this.#webviewPanel.webview.onDidReceiveMessage((e: FromWebviewMessage.Type) => {
			if (e.source !== this.#resource.toString()) {
				return;
			}

			switch (e.type) {
				case 'cacheImageSizes':
					this.#imageInfo = e.imageData;
					break;

				case 'revealLine':
					this.#onDidScrollPreview(e.line);
					break;

				case 'didClick':
					this.#onDidClickPreview(e.line);
					break;

				case 'openLink':
					this.#onDidClickPreviewLink(e.href);
					break;

				case 'showPreviewSecuritySelector':
					vscode.commands.executeCommand('markdown.showPreviewSecuritySelector', e.source);
					break;

				case 'previewStyleLoadError':
					vscode.window.showWarningMessage(
						vscode.l10n.t("Could not load 'markdown.styles': {0}", e.unloadedStyles.join(', ')));
					break;
			}
		}));

		this.refresh();
	}

	override dispose() {
		this.#disposeCts.cancel();

		super.dispose();

		this.#disposed = true;

		clearTimeout(this.#throttleTimer);
		for (const entry of this.#fileWatchersBySrc.values()) {
			entry.dispose();
		}
		this.#fileWatchersBySrc.clear();
	}

	public get resource(): vscode.Uri {
		return this.#resource;
	}

	public get state() {
		return {
			resource: this.#resource.toString(),
			line: this.#line,
			fragment: this.#scrollToFragment,
			...this.#delegate.getAdditionalState(),
		};
	}

	/**
	 * The first call immediately refreshes the preview,
	 * calls happening shortly thereafter are debounced.
	*/
	public refresh(forceUpdate: boolean = false) {
		// Schedule update if none is pending
		if (!this.#throttleTimer) {
			if (this.#firstUpdate) {
				this.#updatePreview(true);
			} else {
				this.#throttleTimer = setTimeout(() => this.#updatePreview(forceUpdate), this.#delay);
			}
		}

		this.#firstUpdate = false;
	}


	public isPreviewOf(resource: vscode.Uri): boolean {
		return areUrisEqual(this.#resource, resource);
	}

	public postMessage(msg: ToWebviewMessage.Type) {
		if (!this.#disposed) {
			this.#webviewPanel.webview.postMessage(msg);
		}
	}

	public scrollTo(topLine: number) {
		if (this.#disposed) {
			return;
		}

		if (this.#isScrolling) {
			this.#isScrolling = false;
			return;
		}

		this.#logger.trace('MarkdownPreview', 'updateForView', { markdownFile: this.#resource });
		this.#line = topLine;
		this.postMessage({
			type: 'updateView',
			line: topLine,
			source: this.#resource.toString()
		});
	}

	async #updatePreview(forceUpdate?: boolean): Promise<void> {
		clearTimeout(this.#throttleTimer);
		this.#throttleTimer = undefined;

		if (this.#disposed) {
			return;
		}

		let document: vscode.TextDocument;
		try {
			document = await vscode.workspace.openTextDocument(this.#resource);
		} catch {
			if (!this.#disposed) {
				await this.#showFileNotFoundError();
			}
			return;
		}

		if (this.#disposed) {
			return;
		}

		const pendingVersion = new PreviewDocumentVersion(document);
		if (!forceUpdate && this.#currentVersion?.equals(pendingVersion)) {
			if (this.#line) {
				this.scrollTo(this.#line);
			}
			return;
		}

		const shouldReloadPage = forceUpdate || !this.#currentVersion || this.#currentVersion.resource.toString() !== pendingVersion.resource.toString() || !this.#webviewPanel.visible;
		this.#currentVersion = pendingVersion;

		let selectedLine: number | undefined = undefined;
		for (const editor of vscode.window.visibleTextEditors) {
			if (this.isPreviewOf(editor.document.uri)) {
				selectedLine = editor.selection.active.line;
				break;
			}
		}

		const content = await (shouldReloadPage
			? this.#contentProvider.renderDocument(document, this, this.#previewConfigurations, this.#line, selectedLine, this.state, this.#imageInfo, this.#disposeCts.token)
			: this.#contentProvider.renderBody(document, this));

		// Another call to `doUpdate` may have happened.
		// Make sure we are still updating for the correct document
		if (this.#currentVersion?.equals(pendingVersion)) {
			this.#updateWebviewContent(content.html, shouldReloadPage);
			this.#updateImageWatchers(content.containingImages);
		}
	}

	#onDidScrollPreview(line: number) {
		this.#line = line;
		this.#onScrollEmitter.fire({ line: this.#line, uri: this.#resource });
		const config = this.#previewConfigurations.loadAndCacheConfiguration(this.#resource);
		if (!config.scrollEditorWithPreview) {
			return;
		}

		for (const editor of vscode.window.visibleTextEditors) {
			if (!this.isPreviewOf(editor.document.uri)) {
				continue;
			}

			this.#isScrolling = true;
			scrollEditorToLine(line, editor);
		}
	}

	async #onDidClickPreview(line: number): Promise<void> {
		// fix #82457, find currently opened but unfocused source tab
		await vscode.commands.executeCommand('markdown.showSource');

		const revealLineInEditor = (editor: vscode.TextEditor) => {
			const position = new vscode.Position(line, 0);
			const newSelection = new vscode.Selection(position, position);
			editor.selection = newSelection;
			editor.revealRange(newSelection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		};

		for (const visibleEditor of vscode.window.visibleTextEditors) {
			if (this.isPreviewOf(visibleEditor.document.uri)) {
				const editor = await vscode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn);
				revealLineInEditor(editor);
				return;
			}
		}

		await vscode.workspace.openTextDocument(this.#resource)
			.then(vscode.window.showTextDocument)
			.then((editor) => {
				revealLineInEditor(editor);
			}, () => {
				vscode.window.showErrorMessage(vscode.l10n.t('Could not open {0}', this.#resource.toString()));
			});
	}

	async #showFileNotFoundError() {
		this.#webviewPanel.webview.html = this.#contentProvider.renderFileNotFoundDocument(this.#resource);
	}

	#updateWebviewContent(html: string, reloadPage: boolean): void {
		if (this.#disposed) {
			return;
		}

		if (this.#delegate.getTitle) {
			this.#webviewPanel.title = this.#delegate.getTitle(this.#resource);
		}
		this.#webviewPanel.webview.options = this.#getWebviewOptions();

		if (reloadPage) {
			this.#webviewPanel.webview.html = html;
		} else {
			this.postMessage({
				type: 'updateContent',
				content: html,
				source: this.#resource.toString(),
			});
		}
	}

	#updateImageWatchers(srcs: Set<string>) {
		// Delete stale file watchers.
		for (const [src, watcher] of this.#fileWatchersBySrc) {
			if (!srcs.has(src)) {
				watcher.dispose();
				this.#fileWatchersBySrc.delete(src);
			}
		}

		// Create new file watchers.
		const root = vscode.Uri.joinPath(this.#resource, '../');
		for (const src of srcs) {
			const uri = urlToUri(src, root);
			if (uri && !MarkdownPreview.#unwatchedImageSchemes.has(uri.scheme) && !this.#fileWatchersBySrc.has(src)) {
				const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '*'));
				watcher.onDidChange(() => {
					this.refresh(true);
				});
				this.#fileWatchersBySrc.set(src, watcher);
			}
		}
	}

	#getWebviewOptions(): vscode.WebviewOptions {
		return {
			enableScripts: true,
			enableForms: false,
			localResourceRoots: this.#getLocalResourceRoots()
		};
	}

	#getLocalResourceRoots(): ReadonlyArray<vscode.Uri> {
		const baseRoots = Array.from(this.#contributionProvider.contributions.previewResourceRoots);

		const folder = vscode.workspace.getWorkspaceFolder(this.#resource);
		if (folder) {
			const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri);
			if (workspaceRoots) {
				baseRoots.push(...workspaceRoots);
			}
		} else {
			baseRoots.push(uri.Utils.dirname(this.#resource));
		}

		return baseRoots;
	}

	async #onDidClickPreviewLink(href: string) {
		const config = vscode.workspace.getConfiguration('markdown', this.resource);
		const openLinks = config.get<string>('preview.openMarkdownLinks', 'inPreview');
		if (openLinks === 'inPreview') {
			const resolved = await this.#opener.resolveDocumentLink(href, this.resource);
			if (resolved.kind === 'file') {
				try {
					const doc = await vscode.workspace.openTextDocument(vscode.Uri.from(resolved.uri));
					if (isMarkdownFile(doc)) {
						return this.#delegate.openPreviewLinkToMarkdownFile(doc.uri, resolved.fragment ? decodeURIComponent(resolved.fragment) : undefined);
					}
				} catch {
					// Noop
				}
			}
		}

		return this.#opener.openDocumentLink(href, this.resource);
	}

	//#region WebviewResourceProvider

	asWebviewUri(resource: vscode.Uri) {
		return this.#webviewPanel.webview.asWebviewUri(resource);
	}

	get cspSource() {
		return [
			this.#webviewPanel.webview.cspSource,

			// On web, we also need to allow loading of resources from contributed extensions
			...this.#contributionProvider.contributions.previewResourceRoots
				.filter(root => root.scheme === 'http' || root.scheme === 'https')
				.map(root => {
					const dirRoot = root.path.endsWith('/') ? root : root.with({ path: root.path + '/' });
					return dirRoot.toString();
				}),
		].join(' ');
	}

	//#endregion
}

export interface IManagedMarkdownPreview {

	readonly resource: vscode.Uri;
	readonly resourceColumn: vscode.ViewColumn;

	readonly onDispose: vscode.Event<void>;
	readonly onDidChangeViewState: vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent>;

	copyImage(id: string): void;
	dispose(): void;
	refresh(): void;
	updateConfiguration(): void;

	matchesResource(
		otherResource: vscode.Uri,
		otherPosition: vscode.ViewColumn | undefined,
		otherLocked: boolean
	): boolean;
}

export class StaticMarkdownPreview extends Disposable implements IManagedMarkdownPreview {

	public static readonly customEditorViewType = 'vscode.markdown.preview.editor';

	public static revive(
		resource: vscode.Uri,
		webview: vscode.WebviewPanel,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		topmostLineMonitor: TopmostLineMonitor,
		logger: ILogger,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
		scrollLine?: number,
	): StaticMarkdownPreview {
		return new StaticMarkdownPreview(webview, resource, contentProvider, previewConfigurations, topmostLineMonitor, logger, contributionProvider, opener, scrollLine);
	}

	readonly #preview: MarkdownPreview;

	readonly #webviewPanel: vscode.WebviewPanel;
	readonly #previewConfigurations: MarkdownPreviewConfigurationManager;

	private constructor(
		webviewPanel: vscode.WebviewPanel,
		resource: vscode.Uri,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		topmostLineMonitor: TopmostLineMonitor,
		logger: ILogger,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
		scrollLine?: number,
	) {
		super();

		this.#webviewPanel = webviewPanel;
		this.#previewConfigurations = previewConfigurations;

		const topScrollLocation = scrollLine ? new StartingScrollLine(scrollLine) : undefined;
		this.#preview = this._register(new MarkdownPreview(this.#webviewPanel, resource, topScrollLocation, {
			getAdditionalState: () => { return {}; },
			openPreviewLinkToMarkdownFile: (markdownLink, fragment) => {
				return vscode.commands.executeCommand('vscode.openWith', markdownLink.with({
					fragment
				}), StaticMarkdownPreview.customEditorViewType, this.#webviewPanel.viewColumn);
			}
		}, contentProvider, previewConfigurations, logger, contributionProvider, opener));

		this._register(this.#webviewPanel.onDidDispose(() => {
			this.dispose();
		}));

		this._register(this.#webviewPanel.onDidChangeViewState(e => {
			this.#onDidChangeViewState.fire(e);
		}));

		this._register(this.#preview.onScroll((scrollInfo) => {
			topmostLineMonitor.setPreviousStaticEditorLine(scrollInfo);
		}));

		this._register(topmostLineMonitor.onDidChanged(event => {
			if (this.#preview.isPreviewOf(event.resource)) {
				this.#preview.scrollTo(event.line);
			}
		}));
	}

	copyImage(id: string) {
		this.#webviewPanel.reveal();
		this.#preview.postMessage({
			type: 'copyImage',
			source: this.resource.toString(),
			id: id
		});
	}

	readonly #onDispose = this._register(new vscode.EventEmitter<void>());
	public readonly onDispose = this.#onDispose.event;

	readonly #onDidChangeViewState = this._register(new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState = this.#onDidChangeViewState.event;

	override dispose() {
		this.#onDispose.fire();
		super.dispose();
	}

	public matchesResource(
		_otherResource: vscode.Uri,
		_otherPosition: vscode.ViewColumn | undefined,
		_otherLocked: boolean
	): boolean {
		return false;
	}

	public refresh() {
		this.#preview.refresh(true);
	}

	public updateConfiguration() {
		if (this.#previewConfigurations.hasConfigurationChanged(this.#preview.resource)) {
			this.refresh();
		}
	}

	public get resource() {
		return this.#preview.resource;
	}

	public get resourceColumn() {
		return this.#webviewPanel.viewColumn || vscode.ViewColumn.One;
	}
}

interface DynamicPreviewInput {
	readonly resource: vscode.Uri;
	readonly resourceColumn: vscode.ViewColumn;
	readonly locked: boolean;
	readonly line?: number;
}

export class DynamicMarkdownPreview extends Disposable implements IManagedMarkdownPreview {

	public static readonly viewType = 'markdown.preview';

	readonly #resourceColumn: vscode.ViewColumn;
	#locked: boolean;

	readonly #webviewPanel: vscode.WebviewPanel;
	#preview: MarkdownPreview;

	public static revive(
		input: DynamicPreviewInput,
		webview: vscode.WebviewPanel,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: ILogger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
	): DynamicMarkdownPreview {
		webview.iconPath = contentProvider.iconPath;

		return new DynamicMarkdownPreview(webview, input,
			contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener);
	}

	public static create(
		input: DynamicPreviewInput,
		previewColumn: vscode.ViewColumn,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: ILogger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
	): DynamicMarkdownPreview {
		const webview = vscode.window.createWebviewPanel(
			DynamicMarkdownPreview.viewType,
			DynamicMarkdownPreview.#getPreviewTitle(input.resource, input.locked),
			previewColumn, { enableFindWidget: true, });

		webview.iconPath = contentProvider.iconPath;

		return new DynamicMarkdownPreview(webview, input,
			contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener);
	}

	readonly #contentProvider: MdDocumentRenderer;
	readonly #previewConfigurations: MarkdownPreviewConfigurationManager;
	readonly #logger: ILogger;
	readonly #topmostLineMonitor: TopmostLineMonitor;
	readonly #contributionProvider: MarkdownContributionProvider;
	readonly #opener: MdLinkOpener;

	private constructor(
		webview: vscode.WebviewPanel,
		input: DynamicPreviewInput,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: ILogger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
	) {
		super();

		this.#contentProvider = contentProvider;
		this.#previewConfigurations = previewConfigurations;
		this.#logger = logger;
		this.#topmostLineMonitor = topmostLineMonitor;
		this.#contributionProvider = contributionProvider;
		this.#opener = opener;

		this.#webviewPanel = webview;

		this.#resourceColumn = input.resourceColumn;
		this.#locked = input.locked;

		this.#preview = this.#createPreview(input.resource, typeof input.line === 'number' ? new StartingScrollLine(input.line) : undefined);

		this._register(webview.onDidDispose(() => { this.dispose(); }));

		this._register(this.#webviewPanel.onDidChangeViewState(e => {
			this.#onDidChangeViewStateEmitter.fire(e);
		}));

		this._register(this.#topmostLineMonitor.onDidChanged(event => {
			if (this.#preview.isPreviewOf(event.resource)) {
				this.#preview.scrollTo(event.line);
			}
		}));

		this._register(vscode.window.onDidChangeTextEditorSelection(event => {
			if (this.#preview.isPreviewOf(event.textEditor.document.uri)) {
				this.#preview.postMessage({
					type: 'onDidChangeTextEditorSelection',
					line: event.selections[0].active.line,
					source: this.#preview.resource.toString()
				});
			}
		}));

		this._register(vscode.window.onDidChangeActiveTextEditor(editor => {
			// Only allow previewing normal text editors which have a viewColumn: See #101514
			if (typeof editor?.viewColumn === 'undefined') {
				return;
			}

			if (isMarkdownFile(editor.document) && !this.#locked && !this.#preview.isPreviewOf(editor.document.uri)) {
				const line = getVisibleLine(editor);
				this.update(editor.document.uri, line ? new StartingScrollLine(line) : undefined);
			}
		}));
	}

	copyImage(id: string) {
		this.#webviewPanel.reveal();
		this.#preview.postMessage({
			type: 'copyImage',
			source: this.resource.toString(),
			id: id
		});
	}

	readonly #onDisposeEmitter = this._register(new vscode.EventEmitter<void>());
	public readonly onDispose = this.#onDisposeEmitter.event;

	readonly #onDidChangeViewStateEmitter = this._register(new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState = this.#onDidChangeViewStateEmitter.event;

	override dispose() {
		this.#preview.dispose();
		this.#webviewPanel.dispose();

		this.#onDisposeEmitter.fire();
		this.#onDisposeEmitter.dispose();
		super.dispose();
	}

	public get resource() {
		return this.#preview.resource;
	}

	public get resourceColumn() {
		return this.#resourceColumn;
	}

	public reveal(viewColumn: vscode.ViewColumn) {
		this.#webviewPanel.reveal(viewColumn);
	}

	public refresh() {
		this.#preview.refresh(true);
	}

	public updateConfiguration() {
		if (this.#previewConfigurations.hasConfigurationChanged(this.#preview.resource)) {
			this.refresh();
		}
	}

	public update(newResource: vscode.Uri, scrollLocation?: StartingScrollLocation) {
		if (this.#preview.isPreviewOf(newResource)) {
			switch (scrollLocation?.type) {
				case 'line':
					this.#preview.scrollTo(scrollLocation.line);
					return;

				case 'fragment':
					// Workaround. For fragments, just reload the entire preview
					break;

				default:
					return;
			}
		}

		this.#preview.dispose();
		this.#preview = this.#createPreview(newResource, scrollLocation);
	}

	public toggleLock() {
		this.#locked = !this.#locked;
		this.#webviewPanel.title = DynamicMarkdownPreview.#getPreviewTitle(this.#preview.resource, this.#locked);
	}

	static #getPreviewTitle(resource: vscode.Uri, locked: boolean): string {
		const resourceLabel = uri.Utils.basename(resource);
		return locked
			? vscode.l10n.t('[Preview] {0}', resourceLabel)
			: vscode.l10n.t('Preview {0}', resourceLabel);
	}

	public get position(): vscode.ViewColumn | undefined {
		return this.#webviewPanel.viewColumn;
	}

	public matchesResource(
		otherResource: vscode.Uri,
		otherPosition: vscode.ViewColumn | undefined,
		otherLocked: boolean
	): boolean {
		if (this.position !== otherPosition) {
			return false;
		}

		if (this.#locked) {
			return otherLocked && this.#preview.isPreviewOf(otherResource);
		} else {
			return !otherLocked;
		}
	}

	public matches(otherPreview: DynamicMarkdownPreview): boolean {
		return this.matchesResource(otherPreview.#preview.resource, otherPreview.position, otherPreview.#locked);
	}

	#createPreview(resource: vscode.Uri, startingScroll?: StartingScrollLocation): MarkdownPreview {
		return new MarkdownPreview(this.#webviewPanel, resource, startingScroll, {
			getTitle: (resource) => DynamicMarkdownPreview.#getPreviewTitle(resource, this.#locked),
			getAdditionalState: () => {
				return {
					resourceColumn: this.resourceColumn,
					locked: this.#locked,
				};
			},
			openPreviewLinkToMarkdownFile: (link: vscode.Uri, fragment?: string) => {
				this.update(link, fragment ? new StartingScrollFragment(fragment) : undefined);
			}
		},
			this.#contentProvider,
			this.#previewConfigurations,
			this.#logger,
			this.#contributionProvider,
			this.#opener);
	}
}
