/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as modes from 'vs/editor/common/modes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtHostApiDeprecationService } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import { asWebviewUri, WebviewInitData } from 'vs/workbench/api/common/shared/webview';
import type * as vscode from 'vscode';
import { ExtHostWebviewsShape, IMainContext, MainContext, MainThreadWebviewsShape, WebviewExtensionDescription, WebviewPanelHandle, WebviewPanelViewStateData } from './extHost.protocol';
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
		private readonly _deprecationService: IExtHostApiDeprecationService,
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
			if (!this._hasCalledAsWebviewUri && /(["'])vscode-resource:([^\s'"]+?)(["'])/i.test(value)) {
				this._hasCalledAsWebviewUri = true;
				this._deprecationService.report('Webview vscode-resource: uris', this._extension,
					`Please migrate to use the 'webview.asWebviewUri' api instead: https://aka.ms/vscode-webview-use-aswebviewuri`);
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

	private assertNotDisposed() {
		if (this._isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

type EditType = unknown;

class WebviewEditorCustomDocument extends Disposable implements vscode.WebviewEditorCustomDocument {
	private _currentEditIndex: number = -1;
	private _savePoint: number = -1;
	private readonly _edits: Array<EditType> = [];

	constructor(
		private readonly _proxy: MainThreadWebviewsShape,
		public readonly viewType: string,
		public readonly uri: vscode.Uri,
		public readonly userData: unknown,
		public readonly _capabilities: vscode.WebviewCustomEditorCapabilities,
	) {
		super();

		// Hook up events
		_capabilities.editing?.onDidEdit(edit => {
			this.pushEdit(edit, this);
		});
	}

	//#region Public API

	#_onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this.#_onDidDispose.event;

	//#endregion

	dispose() {
		this.#_onDidDispose.fire();
		super.dispose();
	}

	private pushEdit(edit: EditType, trigger: any) {
		this.spliceEdits(edit);

		this._currentEditIndex = this._edits.length - 1;
		this.updateState();
		// this._onApplyEdit.fire({ edits: [edit], trigger });
	}

	private updateState() {
		const dirty = this._edits.length > 0 && this._savePoint !== this._currentEditIndex;
		this._proxy.$onDidChangeCustomDocumentState(this.uri, this.viewType, { dirty });
	}

	private spliceEdits(editToInsert?: EditType) {
		const start = this._currentEditIndex + 1;
		const toRemove = this._edits.length - this._currentEditIndex;

		editToInsert
			? this._edits.splice(start, toRemove, editToInsert)
			: this._edits.splice(start, toRemove);
	}

	revert() {
		const editing = this.getEditingCapability();
		if (this._currentEditIndex === this._savePoint) {
			return true;
		}

		if (this._currentEditIndex >= this._savePoint) {
			const editsToUndo = this._edits.slice(this._savePoint, this._currentEditIndex);
			editing.undoEdits(editsToUndo.reverse());
		} else if (this._currentEditIndex < this._savePoint) {
			const editsToRedo = this._edits.slice(this._currentEditIndex, this._savePoint);
			editing.applyEdits(editsToRedo);
		}

		this._currentEditIndex = this._savePoint;
		this.spliceEdits();

		this.updateState();
		return true;
	}

	undo() {
		const editing = this.getEditingCapability();
		if (this._currentEditIndex < 0) {
			// nothing to undo
			return;
		}

		const undoneEdit = this._edits[this._currentEditIndex];
		--this._currentEditIndex;
		editing.undoEdits([undoneEdit]);
		this.updateState();
	}

	redo() {
		const editing = this.getEditingCapability();
		if (this._currentEditIndex >= this._edits.length - 1) {
			// nothing to redo
			return;
		}

		++this._currentEditIndex;
		const redoneEdit = this._edits[this._currentEditIndex];
		editing.applyEdits([redoneEdit]);
		this.updateState();
	}

	save() {
		return this.getEditingCapability().save();
	}

	saveAs(target: vscode.Uri) {
		return this.getEditingCapability().saveAs(target);
	}

	backup(cancellation: CancellationToken): boolean | PromiseLike<boolean> {
		throw new Error('Method not implemented.');
	}

	private getEditingCapability(): vscode.WebviewCustomEditorEditingCapability {
		if (!this._capabilities.editing) {
			throw new Error('Document is not editable');
		}
		return this._capabilities.editing;
	}
}

class WebviewDocumentStore {
	private readonly _documents = new Map<string, WebviewEditorCustomDocument>();

	public get(viewType: string, resource: vscode.Uri): WebviewEditorCustomDocument | undefined {
		return this._documents.get(this.key(viewType, resource));
	}

	public add(document: WebviewEditorCustomDocument) {
		const key = this.key(document.viewType, document.uri);
		if (this._documents.has(key)) {
			throw new Error(`Document already exists for viewType:${document.viewType} resource:${document.uri}`);
		}
		this._documents.set(key, document);
	}

	public delete(document: WebviewEditorCustomDocument) {
		const key = this.key(document.viewType, document.uri);
		this._documents.delete(key);
	}

	private key(viewType: string, resource: vscode.Uri): string {
		return `${viewType}@@@${resource.toString}`;
	}
}

const enum WebviewEditorType {
	Text,
	Custom
}

type ProviderEntry = {
	readonly extension: IExtensionDescription;
	readonly type: WebviewEditorType.Text;
	readonly provider: vscode.WebviewTextEditorProvider;
} | {
	readonly extension: IExtensionDescription;
	readonly type: WebviewEditorType.Custom;
	readonly provider: vscode.WebviewCustomEditorProvider;
};

class EditorProviderStore {
	private readonly _providers = new Map<string, ProviderEntry>();

	public addTextProvider(viewType: string, extension: IExtensionDescription, provider: vscode.WebviewTextEditorProvider): vscode.Disposable {
		return this.add(WebviewEditorType.Text, viewType, extension, provider);
	}

	public addCustomProvider(viewType: string, extension: IExtensionDescription, provider: vscode.WebviewCustomEditorProvider): vscode.Disposable {
		return this.add(WebviewEditorType.Custom, viewType, extension, provider);
	}

	public get(viewType: string): ProviderEntry | undefined {
		return this._providers.get(viewType);
	}

	private add(type: WebviewEditorType, viewType: string, extension: IExtensionDescription, provider: vscode.WebviewTextEditorProvider | vscode.WebviewCustomEditorProvider): vscode.Disposable {
		if (this._providers.has(viewType)) {
			throw new Error(`Provider for viewType:${viewType} already registered`);
		}
		this._providers.set(viewType, { type, extension, provider } as ProviderEntry);
		return new VSCodeDisposable(() => this._providers.delete(viewType));
	}
}

export class ExtHostWebviews implements ExtHostWebviewsShape {

	private static newHandle(): WebviewPanelHandle {
		return generateUuid();
	}

	private readonly _proxy: MainThreadWebviewsShape;
	private readonly _webviewPanels = new Map<WebviewPanelHandle, ExtHostWebviewEditor>();

	private readonly _serializers = new Map<string, {
		readonly serializer: vscode.WebviewPanelSerializer;
		readonly extension: IExtensionDescription;
	}>();

	private readonly _editorProviders = new EditorProviderStore();

	private readonly _documents = new WebviewDocumentStore();

	constructor(
		mainContext: IMainContext,
		private readonly initData: WebviewInitData,
		private readonly workspace: IExtHostWorkspace | undefined,
		private readonly _logService: ILogService,
		private readonly _deprecationService: IExtHostApiDeprecationService,
		private readonly _extHostDocuments: ExtHostDocuments,
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
		this._proxy.$createWebviewPanel(toExtensionData(extension), handle, viewType, title, webviewShowOptions, convertWebviewOptions(extension, this.workspace, options));

		const webview = new ExtHostWebview(handle, this._proxy, options, this.initData, this.workspace, extension, this._deprecationService);
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

	public registerWebviewTextEditorProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.WebviewTextEditorProvider,
		options: vscode.WebviewPanelOptions | undefined = {}
	): vscode.Disposable {
		const unregisterProvider = this._editorProviders.addTextProvider(viewType, extension, provider);
		this._proxy.$registerTextEditorProvider(toExtensionData(extension), viewType, options);

		return new VSCodeDisposable(() => {
			unregisterProvider.dispose();
			this._proxy.$unregisterEditorProvider(viewType);
		});
	}

	public registerWebviewCustomEditorProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.WebviewCustomEditorProvider,
		options: vscode.WebviewPanelOptions | undefined = {},
	): vscode.Disposable {
		const unregisterProvider = this._editorProviders.addCustomProvider(viewType, extension, provider);
		this._proxy.$registerCustomEditorProvider(toExtensionData(extension), viewType, options);

		return new VSCodeDisposable(() => {
			unregisterProvider.dispose();
			this._proxy.$unregisterEditorProvider(viewType);
		});
	}

	public createWebviewEditorCustomDocument<UserDataType>(
		viewType: string,
		resource: vscode.Uri,
		userData: UserDataType,
		capabilities: vscode.WebviewCustomEditorCapabilities,
	): vscode.WebviewEditorCustomDocument<UserDataType> {
		return Object.seal(new WebviewEditorCustomDocument(this._proxy, viewType, resource, userData, capabilities) as vscode.WebviewEditorCustomDocument<UserDataType>);
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

		const webview = new ExtHostWebview(webviewHandle, this._proxy, options, this.initData, this.workspace, extension, this._deprecationService);
		const revivedPanel = new ExtHostWebviewEditor(webviewHandle, this._proxy, viewType, title, typeof position === 'number' && position >= 0 ? typeConverters.ViewColumn.to(position) : undefined, options, webview);
		this._webviewPanels.set(webviewHandle, revivedPanel);
		await serializer.deserializeWebviewPanel(revivedPanel, state);
	}

	async $createWebviewCustomEditorDocument(resource: UriComponents, viewType: string) {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (entry.type !== WebviewEditorType.Custom) {
			throw new Error(`Invalid provide type for '${viewType}'`);
		}

		const revivedResource = URI.revive(resource);
		const document = await entry.provider.provideWebviewCustomEditorDocument(revivedResource) as WebviewEditorCustomDocument;
		this._documents.add(document);
		return {
			editable: !!document._capabilities.editing
		};
	}

	async $disposeWebviewCustomEditorDocument(resource: UriComponents, viewType: string): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (entry.type !== WebviewEditorType.Custom) {
			throw new Error(`Invalid provider type for '${viewType}'`);
		}

		const revivedResource = URI.revive(resource);
		const document = this.getDocument(viewType, revivedResource);
		this._documents.delete(document);
		document.dispose();
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
			throw new Error(`No provider found for '${viewType}'`);
		}

		const webview = new ExtHostWebview(handle, this._proxy, options, this.initData, this.workspace, entry.extension, this._deprecationService);
		const revivedPanel = new ExtHostWebviewEditor(handle, this._proxy, viewType, title, typeof position === 'number' && position >= 0 ? typeConverters.ViewColumn.to(position) : undefined, options, webview);
		this._webviewPanels.set(handle, revivedPanel);

		const revivedResource = URI.revive(resource);

		switch (entry.type) {
			case WebviewEditorType.Custom:
				{
					const document = this.getDocument(viewType, revivedResource);
					return entry.provider.resolveWebviewCustomEditor(document, revivedPanel);
				}
			case WebviewEditorType.Text:
				{
					await this._extHostDocuments.ensureDocumentData(revivedResource);
					const document = this._extHostDocuments.getDocument(revivedResource);
					return entry.provider.resolveWebviewTextEditor(document, revivedPanel);
				}
			default:
				{
					throw new Error('Unknown webview provider type');
				}
		}
	}

	async $undo(resourceComponents: UriComponents, viewType: string): Promise<void> {
		const document = this.getDocument(viewType, resourceComponents);
		document.undo();
	}

	async $redo(resourceComponents: UriComponents, viewType: string): Promise<void> {
		const document = this.getDocument(viewType, resourceComponents);
		document.redo();
	}

	async $revert(resourceComponents: UriComponents, viewType: string): Promise<void> {
		const document = this.getDocument(viewType, resourceComponents);
		document.revert();
	}

	async $onSave(resourceComponents: UriComponents, viewType: string): Promise<void> {
		const document = this.getDocument(viewType, resourceComponents);
		document.save();
	}

	async $onSaveAs(resourceComponents: UriComponents, viewType: string, targetResource: UriComponents): Promise<void> {
		const document = this.getDocument(viewType, resourceComponents);
		return document.saveAs(URI.revive(targetResource));
	}

	async $backup(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<boolean> {
		const document = this.getDocument(viewType, resourceComponents);
		return document.backup(cancellation);
	}

	private getWebviewPanel(handle: WebviewPanelHandle): ExtHostWebviewEditor | undefined {
		return this._webviewPanels.get(handle);
	}

	private getDocument(viewType: string, resource: UriComponents): WebviewEditorCustomDocument {
		const document = this._documents.get(viewType, URI.revive(resource));
		if (!document) {
			throw new Error('No webview editor custom document found');
		}
		return document;
	}
}

function toExtensionData(extension: IExtensionDescription): WebviewExtensionDescription {
	return { id: extension.identifier, location: extension.extensionLocation };
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
