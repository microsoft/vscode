/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadWebviewsShape, IMainContext, ExtHostWebviewsShape, WebviewHandle } from './extHost.protocol';
import * as vscode from 'vscode';
import { Event, Emitter } from 'vs/base/common/event';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import { Position } from 'vs/platform/editor/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from './extHostTypes';

export class ExtHostWebview implements vscode.Webview {
	private readonly _handle: WebviewHandle;
	private readonly _proxy: MainThreadWebviewsShape;
	private _title: string;
	private _html: string;
	private _options: vscode.WebviewOptions;
	private _isDisposed: boolean = false;

	public readonly onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this.onMessageEmitter.event;

	public readonly onDidChangeViewStateEmitter = new Emitter<vscode.WebviewPanelOnDidChangeViewStateEvent>();
	public readonly onDidChangeViewState: Event<vscode.WebviewPanelOnDidChangeViewStateEvent> = this.onDidChangeViewStateEmitter.event;

	constructor(
		handle: WebviewHandle,
		proxy: MainThreadWebviewsShape,
		title: string,
		options: vscode.WebviewOptions
	) {
		this._handle = handle;
		this._proxy = proxy;
		this._title = title;
		this._options = options;
	}

	dispose() {
		this.onDidChangeViewStateEmitter.dispose();
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

	get html(): string {
		this.assertNotDisposed();
		return this._html;
	}

	set html(value: string) {
		this.assertNotDisposed();
		if (this._html !== value) {
			this._html = value;
			this._proxy.$setHtml(this._handle, value);
		}
	}

	get options(): vscode.WebviewOptions {
		this.assertNotDisposed();
		return this._options;
	}

	public postMessage(message: any): Thenable<boolean> {
		this.assertNotDisposed();
		return this._proxy.$sendMessage(this._handle, message);
	}

	public reveal(viewColumn: vscode.ViewColumn): void {
		this.assertNotDisposed();
		this._proxy.$reveal(this._handle, typeConverters.fromViewColumn(viewColumn));
	}

	private assertNotDisposed() {
		if (this._isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

export class ExtHostWebviewPanel implements vscode.WebviewPanel {

	private readonly _handle: WebviewHandle;
	private readonly _viewType: string;
	private readonly _options: vscode.WebviewPanelOptions;
	private readonly _proxy: MainThreadWebviewsShape;
	private _isDisposed: boolean = false;
	private _viewColumn: vscode.ViewColumn;
	private _active: boolean;

	public readonly onDisposeEmitter = new Emitter<void>();
	public readonly onDidDispose: Event<void> = this.onDisposeEmitter.event;

	public readonly onDidChangeViewStateEmitter = new Emitter<vscode.WebviewPanelOnDidChangeViewStateEvent>();
	public readonly onDidChangeViewState: Event<vscode.WebviewPanelOnDidChangeViewStateEvent> = this.onDidChangeViewStateEmitter.event;

	private _webview: ExtHostWebview;

	constructor(
		handle: WebviewHandle,
		proxy: MainThreadWebviewsShape,
		viewType: string,
		title: string,
		viewColumn: vscode.ViewColumn,
		editorOptions: vscode.WebviewPanelOptions,
		webviewOptions: vscode.WebviewOptions
	) {
		this._handle = handle;
		this._proxy = proxy;
		this._viewType = viewType;
		this._options = editorOptions;
		this._viewColumn = viewColumn;
		this._webview = new ExtHostWebview(handle, proxy, title, webviewOptions);
	}

	public dispose() {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this._proxy.$disposeWebview(this._handle);

		this.onDisposeEmitter.dispose();
		this.onDidChangeViewStateEmitter.dispose();
	}

	get webview() {
		this.assertNotDisposed();
		return this._webview;
	}

	get viewType(): string {
		this.assertNotDisposed();
		return this._viewType;
	}

	get options() {
		return this._options;
	}

	get viewColumn(): vscode.ViewColumn {
		this.assertNotDisposed();
		return this._viewColumn;
	}

	get active(): boolean {
		this.assertNotDisposed();
		return this._active;
	}

	set viewColumn(value: vscode.ViewColumn) {
		this.assertNotDisposed();
		this._viewColumn = value;
	}

	set active(value: boolean) {
		this.assertNotDisposed();
		this._active = value;
	}

	public postMessage(message: any): Thenable<boolean> {
		this.assertNotDisposed();
		return this._proxy.$sendMessage(this._handle, message);
	}

	public reveal(viewColumn: vscode.ViewColumn): void {
		this.assertNotDisposed();
		this._proxy.$reveal(this._handle, typeConverters.fromViewColumn(viewColumn));
	}

	private assertNotDisposed() {
		if (this._isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

export class ExtHostWebviews implements ExtHostWebviewsShape {
	private static webviewHandlePool = 1;

	private readonly _proxy: MainThreadWebviewsShape;

	private readonly _webviews = new Map<WebviewHandle, ExtHostWebviewPanel>();
	private readonly _serializers = new Map<string, vscode.WebviewPanelSerializer>();

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadWebviews);
	}

	createWebview(
		viewType: string,
		title: string,
		viewColumn: vscode.ViewColumn,
		options: vscode.WebviewPanelOptions & vscode.WebviewOptions,
		extensionFolderPath: string
	): vscode.WebviewPanel {
		const handle = ExtHostWebviews.webviewHandlePool++ + '';
		this._proxy.$createWebview(handle, viewType, title, typeConverters.fromViewColumn(viewColumn), options, extensionFolderPath);

		const webview = new ExtHostWebviewPanel(handle, this._proxy, viewType, title, viewColumn, options, options);
		this._webviews.set(handle, webview);
		return webview;
	}

	registerWebviewPanelSerializer(
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

	$onMessage(handle: WebviewHandle, message: any): void {
		const webview = this.getWebview(handle);
		if (webview) {
			webview.webview.onMessageEmitter.fire(message);
		}
	}

	$onDidChangeWeviewViewState(handle: WebviewHandle, active: boolean, position: Position): void {
		const webview = this.getWebview(handle);
		if (webview) {
			const viewColumn = typeConverters.toViewColumn(position);
			if (webview.active !== active || webview.viewColumn !== viewColumn) {
				webview.active = active;
				webview.viewColumn = viewColumn;
				webview.onDidChangeViewStateEmitter.fire({ active, viewColumn });
			}
		}
	}

	$onDidDisposeWeview(handle: WebviewHandle): Thenable<void> {
		const webview = this.getWebview(handle);
		if (webview) {
			webview.onDisposeEmitter.fire();
			this._webviews.delete(handle);
		}
		return TPromise.as(void 0);
	}

	$deserializeWebview(
		webviewHandle: WebviewHandle,
		viewType: string,
		title: string,
		state: any,
		position: Position,
		options: vscode.WebviewOptions
	): Thenable<void> {
		const serializer = this._serializers.get(viewType);
		if (!serializer) {
			return TPromise.wrapError(new Error(`No serializer found for '${viewType}'`));
		}

		const revivedWebview = new ExtHostWebviewPanel(webviewHandle, this._proxy, viewType, title, typeConverters.toViewColumn(position), options as vscode.WebviewPanelOptions, options as vscode.WebviewOptions);
		this._webviews.set(webviewHandle, revivedWebview);
		return serializer.deserializeWebviewPanel(revivedWebview, state);
	}

	$serializeWebview(
		webviewHandle: WebviewHandle
	): Thenable<any> {
		const webview = this.getWebview(webviewHandle);
		if (!webview) {
			return TPromise.as(undefined);
		}

		const serialzer = this._serializers.get(webview.viewType);
		if (!serialzer) {
			return TPromise.as(undefined);
		}

		return serialzer.serializeWebviewPanel(webview);
	}

	private getWebview(handle: WebviewHandle): ExtHostWebviewPanel | undefined {
		return this._webviews.get(handle);
	}
}