/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as modes from 'vs/editor/common/modes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import { asWebviewUri, WebviewInitData } from 'vs/workbench/api/common/shared/webview';
import * as vscode from 'vscode';
import { ExtHostWebviewsShape, IMainContext, MainContext, MainThreadWebviewsShape, WebviewPanelHandle, WebviewPanelViewStateData } from './extHost.protocol';
import { Disposable as VSCodeDisposable } from './extHostTypes';

type IconPath = URI | { light: URI, dark: URI };

export class ExtHostWebview implements vscode.Webview {
	private _html: string = '';
	private _isDisposed: boolean = false;
	private _hasCalledAsWebviewUri = false;

	public readonly _onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this._onMessageEmitter.event;

	constructor(
		private readonly _handle: WebviewPanelHandle,
		private readonly _proxy: MainThreadWebviewsShape,
		private _options: vscode.WebviewOptions,
		private readonly _initData: WebviewInitData,
		private readonly _workspace: IExtHostWorkspace | undefined,
		private readonly _extension: IExtensionDescription,
		private readonly _logService: ILogService,
	) { }

	public dispose() {
		this._onMessageEmitter.dispose();
	}

	public asWebviewUri(resource: vscode.Uri): vscode.Uri {
		this._hasCalledAsWebviewUri = true;
		return asWebviewUri(this._initData, this._handle, resource);
	}

	public get cspSource(): string {
		return this._initData.webviewCspSource
			.replace('{{uuid}}', this._handle);
	}

	public get html(): string {
		this.assertNotDisposed();
		return this._html;
	}

	public set html(value: string) {
		this.assertNotDisposed();
		if (this._html !== value) {
			this._html = value;
			if (this._initData.isExtensionDevelopmentDebug && !this._hasCalledAsWebviewUri) {
				if (/(["'])vscode-resource:([^\s'"]+?)(["'])/i.test(value)) {
					this._hasCalledAsWebviewUri = true;
					this._logService.warn(`${this._extension.identifier.value} created a webview that appears to use the vscode-resource scheme directly. Please migrate to use the 'webview.asWebviewUri' api instead: https://aka.ms/vscode-webview-use-aswebviewuri`);
				}
			}
			this._proxy.$setHtml(this._handle, value);
		}
	}

	public get options(): vscode.WebviewOptions {
		this.assertNotDisposed();
		return this._options;
	}

	public set options(newOptions: vscode.WebviewOptions) {
		this.assertNotDisposed();
		this._proxy.$setOptions(this._handle, convertWebviewOptions(this._extension, this._workspace, newOptions));
		this._options = newOptions;
	}

	public postMessage(message: any): Promise<boolean> {
		this.assertNotDisposed();
		return this._proxy.$postMessage(this._handle, message);
	}

	private assertNotDisposed() {
		if (this._isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

export class ExtHostWebviewEditor extends Disposable implements vscode.WebviewPanel {

	private readonly _handle: WebviewPanelHandle;
	private readonly _proxy: MainThreadWebviewsShape;
	private readonly _viewType: string;
	private _title: string;
	private _iconPath?: IconPath;

	private readonly _options: vscode.WebviewPanelOptions;
	private readonly _webview: ExtHostWebview;
	private _viewColumn: vscode.ViewColumn | undefined;
	private _visible: boolean = true;
	private _active: boolean = true;

	_isDisposed: boolean = false;

	readonly _onDisposeEmitter = this._register(new Emitter<void>());
	public readonly onDidDispose: Event<void> = this._onDisposeEmitter.event;

	readonly _onDidChangeViewStateEmitter = this._register(new Emitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState: Event<vscode.WebviewPanelOnDidChangeViewStateEvent> = this._onDidChangeViewStateEmitter.event;

	public _capabilities?: vscode.WebviewEditorCapabilities;

	constructor(
		handle: WebviewPanelHandle,
		proxy: MainThreadWebviewsShape,
		viewType: string,
		title: string,
		viewColumn: vscode.ViewColumn | undefined,
		editorOptions: vscode.WebviewPanelOptions,
		webview: ExtHostWebview
	) {
		super();
		this._handle = handle;
		this._proxy = proxy;
		this._viewType = viewType;
		this._options = editorOptions;
		this._viewColumn = viewColumn;
		this._title = title;
		this._webview = webview;
	}

	public dispose() {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._onDisposeEmitter.fire();
		this._proxy.$disposeWebview(this._handle);
		this._webview.dispose();

		super.dispose();
	}

	get webview() {
		this.assertNotDisposed();
		return this._webview;
	}

	get viewType(): string {
		this.assertNotDisposed();
		return this._viewType;
	}

	get title(): string {
		this.assertNotDisposed();
		return this._title;
	}

	set title(value: string) {
		this.assertNotDisposed();
		if (this._title !== value) {
			this._title = value;
			this._proxy.$setTitle(this._handle, value);
		}
	}

	get iconPath(): IconPath | undefined {
		this.assertNotDisposed();
		return this._iconPath;
	}

	set iconPath(value: IconPath | undefined) {
		this.assertNotDisposed();
		if (this._iconPath !== value) {
			this._iconPath = value;

			this._proxy.$setIconPath(this._handle, URI.isUri(value) ? { light: value, dark: value } : value);
		}
	}

	get options() {
		return this._options;
	}

	get viewColumn(): vscode.ViewColumn | undefined {
		this.assertNotDisposed();
		if (typeof this._viewColumn === 'number' && this._viewColumn < 0) {
			// We are using a symbolic view column
			// Return undefined instead to indicate that the real view column is currently unknown but will be resolved.
			return undefined;
		}
		return this._viewColumn;
	}

	_setViewColumn(value: vscode.ViewColumn) {
		this.assertNotDisposed();
		this._viewColumn = value;
	}

	public get active(): boolean {
		this.assertNotDisposed();
		return this._active;
	}

	_setActive(value: boolean) {
		this.assertNotDisposed();
		this._active = value;
	}

	public get visible(): boolean {
		this.assertNotDisposed();
		return this._visible;
	}

	_setVisible(value: boolean) {
		this.assertNotDisposed();
		this._visible = value;
	}

	public postMessage(message: any): Promise<boolean> {
		this.assertNotDisposed();
		return this._proxy.$postMessage(this._handle, message);
	}

	public reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
		this.assertNotDisposed();
		this._proxy.$reveal(this._handle, {
			viewColumn: viewColumn ? typeConverters.ViewColumn.from(viewColumn) : undefined,
			preserveFocus: !!preserveFocus
		});
	}

	_setCapabilities(capabilities: vscode.WebviewEditorCapabilities) {
		this._capabilities = capabilities;
		if (capabilities.editingCapability) {
			this._register(capabilities.editingCapability.onEdit(edit => {
				this._proxy.$onEdit(this._handle, JSON.stringify(edit));
			}));
		}
	}

	_undoEdits(edits: string[]): void {
		assertIsDefined(this._capabilities).editingCapability?.undoEdits(edits);
	}

	_redoEdits(edits: string[]): void {
		assertIsDefined(this._capabilities).editingCapability?.applyEdits(edits);
	}

	async _onSave(): Promise<void> {
		await assertIsDefined(this._capabilities).editingCapability?.save();
	}

	private assertNotDisposed() {
		if (this._isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

export class ExtHostWebviews implements ExtHostWebviewsShape {

	private static newHandle(): WebviewPanelHandle {
		return generateUuid();
	}

	private readonly _proxy: MainThreadWebviewsShape;
	private readonly _webviewPanels = new Map<WebviewPanelHandle, ExtHostWebviewEditor>();
	private readonly _serializers = new Map<string, { readonly serializer: vscode.WebviewPanelSerializer, readonly extension: IExtensionDescription }>();
	private readonly _editorProviders = new Map<string, { readonly provider: vscode.WebviewEditorProvider, readonly extension: IExtensionDescription }>();

	constructor(
		mainContext: IMainContext,
		private readonly initData: WebviewInitData,
		private readonly workspace: IExtHostWorkspace | undefined,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadWebviews);
	}

	public createWebviewPanel(
		extension: IExtensionDescription,
		viewType: string,
		title: string,
		showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn, preserveFocus?: boolean },
		options: (vscode.WebviewPanelOptions & vscode.WebviewOptions) = {},
	): vscode.WebviewPanel {
		const viewColumn = typeof showOptions === 'object' ? showOptions.viewColumn : showOptions;
		const webviewShowOptions = {
			viewColumn: typeConverters.ViewColumn.from(viewColumn),
			preserveFocus: typeof showOptions === 'object' && !!showOptions.preserveFocus
		};

		const handle = ExtHostWebviews.newHandle();
		this._proxy.$createWebviewPanel({ id: extension.identifier, location: extension.extensionLocation }, handle, viewType, title, webviewShowOptions, convertWebviewOptions(extension, this.workspace, options));

		const webview = new ExtHostWebview(handle, this._proxy, options, this.initData, this.workspace, extension, this._logService);
		const panel = new ExtHostWebviewEditor(handle, this._proxy, viewType, title, viewColumn, options, webview);
		this._webviewPanels.set(handle, panel);
		return panel;
	}

	public registerWebviewPanelSerializer(
		extension: IExtensionDescription,
		viewType: string,
		serializer: vscode.WebviewPanelSerializer
	): vscode.Disposable {
		if (this._serializers.has(viewType)) {
			throw new Error(`Serializer for '${viewType}' already registered`);
		}

		this._serializers.set(viewType, { serializer, extension });
		this._proxy.$registerSerializer(viewType);

		return new VSCodeDisposable(() => {
			this._serializers.delete(viewType);
			this._proxy.$unregisterSerializer(viewType);
		});
	}

	public registerWebviewEditorProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.WebviewEditorProvider,
		options?: vscode.WebviewPanelOptions,
	): vscode.Disposable {
		if (this._editorProviders.has(viewType)) {
			throw new Error(`Editor provider for '${viewType}' already registered`);
		}

		this._editorProviders.set(viewType, { extension, provider, });
		this._proxy.$registerEditorProvider({ id: extension.identifier, location: extension.extensionLocation }, viewType, options || {});

		return new VSCodeDisposable(() => {
			this._editorProviders.delete(viewType);
			this._proxy.$unregisterEditorProvider(viewType);
		});
	}

	public $onMessage(
		handle: WebviewPanelHandle,
		message: any
	): void {
		const panel = this.getWebviewPanel(handle);
		if (panel) {
			panel.webview._onMessageEmitter.fire(message);
		}
	}

	public $onMissingCsp(
		_handle: WebviewPanelHandle,
		extensionId: string
	): void {
		this._logService.warn(`${extensionId} created a webview without a content security policy: https://aka.ms/vscode-webview-missing-csp`);
	}

	public $onDidChangeWebviewPanelViewStates(newStates: WebviewPanelViewStateData): void {
		const handles = Object.keys(newStates);
		// Notify webviews of state changes in the following order:
		// - Non-visible
		// - Visible
		// - Active
		handles.sort((a, b) => {
			const stateA = newStates[a];
			const stateB = newStates[b];
			if (stateA.active) {
				return 1;
			}
			if (stateB.active) {
				return -1;
			}
			return (+stateA.visible) - (+stateB.visible);
		});

		for (const handle of handles) {
			const panel = this.getWebviewPanel(handle);
			if (!panel || panel._isDisposed) {
				continue;
			}

			const newState = newStates[handle];
			const viewColumn = typeConverters.ViewColumn.to(newState.position);
			if (panel.active !== newState.active || panel.visible !== newState.visible || panel.viewColumn !== viewColumn) {
				panel._setActive(newState.active);
				panel._setVisible(newState.visible);
				panel._setViewColumn(viewColumn);
				panel._onDidChangeViewStateEmitter.fire({ webviewPanel: panel });
			}
		}
	}

	async $onDidDisposeWebviewPanel(handle: WebviewPanelHandle): Promise<void> {
		const panel = this.getWebviewPanel(handle);
		if (panel) {
			panel.dispose();
			this._webviewPanels.delete(handle);
		}
	}

	async $deserializeWebviewPanel(
		webviewHandle: WebviewPanelHandle,
		viewType: string,
		title: string,
		state: any,
		position: EditorViewColumn,
		options: modes.IWebviewOptions & modes.IWebviewPanelOptions
	): Promise<void> {
		const entry = this._serializers.get(viewType);
		if (!entry) {
			throw new Error(`No serializer found for '${viewType}'`);
		}
		const { serializer, extension } = entry;

		const webview = new ExtHostWebview(webviewHandle, this._proxy, options, this.initData, this.workspace, extension, this._logService);
		const revivedPanel = new ExtHostWebviewEditor(webviewHandle, this._proxy, viewType, title, typeof position === 'number' && position >= 0 ? typeConverters.ViewColumn.to(position) : undefined, options, webview);
		this._webviewPanels.set(webviewHandle, revivedPanel);
		await serializer.deserializeWebviewPanel(revivedPanel, state);
	}

	async $resolveWebviewEditor(
		resource: UriComponents,
		handle: WebviewPanelHandle,
		viewType: string,
		title: string,
		position: EditorViewColumn,
		options: modes.IWebviewOptions & modes.IWebviewPanelOptions
	): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			return Promise.reject(new Error(`No provider found for '${viewType}'`));
		}

		const { provider, extension } = entry;
		const webview = new ExtHostWebview(handle, this._proxy, options, this.initData, this.workspace, extension, this._logService);
		const revivedPanel = new ExtHostWebviewEditor(handle, this._proxy, viewType, title, typeof position === 'number' && position >= 0 ? typeConverters.ViewColumn.to(position) : undefined, options, webview);
		this._webviewPanels.set(handle, revivedPanel);
		const capabilities = await provider.resolveWebviewEditor({ resource: URI.revive(resource) }, revivedPanel);
		revivedPanel._setCapabilities(capabilities);
	}

	$undoEdits(handle: WebviewPanelHandle, edits: string[]): void {
		const panel = this.getWebviewPanel(handle);
		if (!panel) {
			return;
		}
		panel._undoEdits(edits);
	}

	$redoEdits(handle: WebviewPanelHandle, edits: string[]): void {
		const panel = this.getWebviewPanel(handle);
		if (!panel) {
			return;
		}
		panel._redoEdits(edits);
	}

	async $onSave(handle: WebviewPanelHandle): Promise<void> {
		const panel = this.getWebviewPanel(handle);
		return panel?._onSave();
	}

	private getWebviewPanel(handle: WebviewPanelHandle): ExtHostWebviewEditor | undefined {
		return this._webviewPanels.get(handle);
	}
}

function convertWebviewOptions(
	extension: IExtensionDescription,
	workspace: IExtHostWorkspace | undefined,
	options: vscode.WebviewPanelOptions & vscode.WebviewOptions,
): modes.IWebviewOptions {
	return {
		...options,
		localResourceRoots: options.localResourceRoots || getDefaultLocalResourceRoots(extension, workspace)
	};
}

function getDefaultLocalResourceRoots(
	extension: IExtensionDescription,
	workspace: IExtHostWorkspace | undefined,
): URI[] {
	return [
		...(workspace?.getWorkspaceFolders() || []).map(x => x.uri),
		extension.extensionLocation,
	];
}
