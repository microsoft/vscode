/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import * as vscode from 'vscode';
import { ExtHostWebviewsShape, IMainContext, MainContext, MainThreadWebviewsShape, WebviewPanelHandle, WebviewPanelViewState } from './extHost.protocol';
import { Disposable } from './extHostTypes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as modes from 'vs/editor/common/modes';
import { WebviewInitData, toWebviewResource } from 'vs/workbench/api/common/shared/webview';
import { generateUuid } from 'vs/base/common/uuid';

type IconPath = URI | { light: URI, dark: URI };

export class ExtHostWebview implements vscode.Webview {
	private _html: string;
	private _isDisposed: boolean = false;

	public readonly _onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this._onMessageEmitter.event;

	constructor(
		private readonly _handle: WebviewPanelHandle,
		private readonly _proxy: MainThreadWebviewsShape,
		private _options: vscode.WebviewOptions,
		private readonly _initData: WebviewInitData
	) { }

	public dispose() {
		this._onMessageEmitter.dispose();
	}

	public toWebviewResource(resource: vscode.Uri): vscode.Uri {
		return toWebviewResource(this._initData, this._handle, resource);
	}

	public get cspSource(): string {
		return this._initData.webviewCspSource.replace('{{uuid}}', this._handle);
	}

	public get html(): string {
		this.assertNotDisposed();
		return this._html;
	}

	public set html(value: string) {
		this.assertNotDisposed();
		if (this._html !== value) {
			this._html = value;
			this._proxy.$setHtml(this._handle, value);
		}
	}

	public get options(): vscode.WebviewOptions {
		this.assertNotDisposed();
		return this._options;
	}

	public set options(newOptions: vscode.WebviewOptions) {
		this.assertNotDisposed();
		this._proxy.$setOptions(this._handle, convertWebviewOptions(newOptions));
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

export class ExtHostWebviewPanel implements vscode.WebviewPanel {

	private readonly _handle: WebviewPanelHandle;
	private readonly _proxy: MainThreadWebviewsShape;
	private readonly _viewType: string;
	private _title: string;
	private _iconPath?: IconPath;

	private readonly _options: vscode.WebviewPanelOptions;
	private readonly _webview: ExtHostWebview;
	private _isDisposed: boolean = false;
	private _viewColumn: vscode.ViewColumn | undefined;
	private _visible: boolean = true;
	private _active: boolean = true;

	readonly _onDisposeEmitter = new Emitter<void>();
	public readonly onDidDispose: Event<void> = this._onDisposeEmitter.event;

	readonly _onDidChangeViewStateEmitter = new Emitter<vscode.WebviewPanelOnDidChangeViewStateEvent>();
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

		this._onDisposeEmitter.dispose();
		this._onDidChangeViewStateEmitter.dispose();
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

export class ExtHostWebviews implements ExtHostWebviewsShape {

	private static newHandle(): WebviewPanelHandle {
		return generateUuid();
	}

	private readonly _proxy: MainThreadWebviewsShape;
	private readonly _webviewPanels = new Map<WebviewPanelHandle, ExtHostWebviewPanel>();
	private readonly _serializers = new Map<string, vscode.WebviewPanelSerializer>();

	constructor(
		mainContext: IMainContext,
		private readonly initData: WebviewInitData
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
		this._proxy.$createWebviewPanel(handle, viewType, title, webviewShowOptions, convertWebviewOptions(options), extension.identifier, extension.extensionLocation);

		const webview = new ExtHostWebview(handle, this._proxy, options, this.initData);
		const panel = new ExtHostWebviewPanel(handle, this._proxy, viewType, title, viewColumn, options, webview);
		this._webviewPanels.set(handle, panel);
		return panel;
	}

	public registerWebviewPanelSerializer(
		viewType: string,
		serializer: vscode.WebviewPanelSerializer
	): vscode.Disposable {
		if (this._serializers.has(viewType)) {
			throw new Error(`Serializer for '${viewType}' already registered`);
		}

		this._serializers.set(viewType, serializer);
		this._proxy.$registerSerializer(viewType);

		return new Disposable(() => {
			this._serializers.delete(viewType);
			this._proxy.$unregisterSerializer(viewType);
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

	public $onDidChangeWebviewPanelViewState(
		handle: WebviewPanelHandle,
		newState: WebviewPanelViewState
	): void {
		const panel = this.getWebviewPanel(handle);
		if (!panel) {
			return;
		}

		const viewColumn = typeConverters.ViewColumn.to(newState.position);
		if (panel.active !== newState.active || panel.visible !== newState.visible || panel.viewColumn !== viewColumn) {
			panel._setActive(newState.active);
			panel._setVisible(newState.visible);
			panel._setViewColumn(viewColumn);
			panel._onDidChangeViewStateEmitter.fire({ webviewPanel: panel });
		}
	}

	$onDidDisposeWebviewPanel(handle: WebviewPanelHandle): Promise<void> {
		const panel = this.getWebviewPanel(handle);
		if (panel) {
			panel.dispose();
			this._webviewPanels.delete(handle);
		}
		return Promise.resolve(undefined);
	}

	$deserializeWebviewPanel(
		webviewHandle: WebviewPanelHandle,
		viewType: string,
		title: string,
		state: any,
		position: EditorViewColumn,
		options: modes.IWebviewOptions & modes.IWebviewPanelOptions
	): Promise<void> {
		const serializer = this._serializers.get(viewType);
		if (!serializer) {
			return Promise.reject(new Error(`No serializer found for '${viewType}'`));
		}

		const webview = new ExtHostWebview(webviewHandle, this._proxy, options, this.initData);
		const revivedPanel = new ExtHostWebviewPanel(webviewHandle, this._proxy, viewType, title, typeof position === 'number' && position >= 0 ? typeConverters.ViewColumn.to(position) : undefined, options, webview);
		this._webviewPanels.set(webviewHandle, revivedPanel);
		return Promise.resolve(serializer.deserializeWebviewPanel(revivedPanel, state));
	}

	private getWebviewPanel(handle: WebviewPanelHandle): ExtHostWebviewPanel | undefined {
		return this._webviewPanels.get(handle);
	}
}

function convertWebviewOptions(
	options: vscode.WebviewPanelOptions & vscode.WebviewOptions
): modes.IWebviewOptions {
	return {
		...options,
		portMapping: options.portMapping
			? options.portMapping.map((x): modes.IWebviewPortMapping => {
				// Handle old proposed api
				if ('port' in x) {
					return { webviewPort: (x as any).port, extensionHostPort: (x as any).resolvedPort };
				}
				return { webviewPort: x.webviewPort, extensionHostPort: x.extensionHostPort };
			})
			: undefined,
	};
}
