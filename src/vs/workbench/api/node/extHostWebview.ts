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

	private readonly _viewType: string;
	private _title: string;
	private _html: string;
	private _options: vscode.WebviewOptions;
	private _isDisposed: boolean = false;
	private _viewColumn: vscode.ViewColumn;
	private _active: boolean;
	private _state: any;

	public readonly onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this.onMessageEmitter.event;

	public readonly onDisposeEmitter = new Emitter<void>();
	public readonly onDidDispose: Event<void> = this.onDisposeEmitter.event;

	public readonly onDidChangeViewStateEmitter = new Emitter<vscode.WebViewOnDidChangeViewStateEvent>();
	public readonly onDidChangeViewState: Event<vscode.WebViewOnDidChangeViewStateEvent> = this.onDidChangeViewStateEmitter.event;

	constructor(
		private readonly _handle: WebviewHandle,
		private readonly _proxy: MainThreadWebviewsShape,
		viewType: string,
		viewColumn: vscode.ViewColumn,
		options: vscode.WebviewOptions
	) {
		this._viewType = viewType;
		this._viewColumn = viewColumn;
		this._options = options;
	}

	public dispose() {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this._proxy.$disposeWebview(this._handle);

		this.onDisposeEmitter.dispose();
		this.onMessageEmitter.dispose();
		this.onDidChangeViewStateEmitter.dispose();
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

	get state(): any {
		this.assertNotDisposed();
		return this._state;
	}

	get options(): vscode.WebviewOptions {
		this.assertNotDisposed();
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

	private readonly _webviews = new Map<WebviewHandle, ExtHostWebview>();
	private readonly _serializers = new Map<string, vscode.WebviewSerializer>();

	private _activeWebview: ExtHostWebview | undefined;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadWebviews);
	}

	createWebview(
		viewType: string,
		title: string,
		viewColumn: vscode.ViewColumn,
		options: vscode.WebviewOptions,
		extensionFolderPath: string
	): vscode.Webview {
		const handle = ExtHostWebviews.webviewHandlePool++ + '';
		this._proxy.$createWebview(handle, viewType, title, typeConverters.fromViewColumn(viewColumn), options, extensionFolderPath);

		const webview = new ExtHostWebview(handle, this._proxy, viewType, viewColumn, options);
		this._webviews.set(handle, webview);
		return webview;
	}

	registerWebviewSerializer(
		viewType: string,
		serializer: vscode.WebviewSerializer
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
			webview.onMessageEmitter.fire(message);
		}
	}

	$onDidChangeActiveWeview(handle: WebviewHandle | undefined): void {
		if (handle) {
			const webview = this.getWebview(handle);
			if (webview) {
				if (webview !== this._activeWebview) {
					this._activeWebview = webview;
					webview.active = true;
					webview.onDidChangeViewStateEmitter.fire({ viewColumn: webview.viewColumn, active: true });
				}
			}
		} else {
			if (this._activeWebview) {
				this._activeWebview.active = false;
				this._activeWebview.onDidChangeViewStateEmitter.fire({ viewColumn: this._activeWebview.viewColumn, active: false });
				this._activeWebview = undefined;
			}
		}
	}

	$onDidDisposeWeview(handle: WebviewHandle): Thenable<void> {
		const webview = this.getWebview(handle);
		if (webview) {
			webview.onDisposeEmitter.fire();
			this._webviews.delete(handle);
			if (this._activeWebview === webview) {
				this._activeWebview = undefined;
			}
		}
		return TPromise.as(void 0);
	}

	$onDidChangePosition(handle: WebviewHandle, newPosition: Position): void {
		const webview = this.getWebview(handle);
		if (webview) {
			const newViewColumn = typeConverters.toViewColumn(newPosition);
			if (webview.viewColumn !== newViewColumn) {
				webview.viewColumn = newViewColumn;
				webview.onDidChangeViewStateEmitter.fire({ viewColumn: newViewColumn, active: webview.active });
			}
		}
	}

	$deserializeWebview(
		webviewHandle: WebviewHandle,
		viewType: string,
		state: any,
		position: Position,
		options: vscode.WebviewOptions
	): void {
		const serializer = this._serializers.get(viewType);
		if (!serializer) {
			return;
		}

		const revivedWebview = new ExtHostWebview(webviewHandle, this._proxy, viewType, typeConverters.toViewColumn(position), options);
		this._webviews.set(webviewHandle, revivedWebview);
		serializer.deserializeWebview(revivedWebview, state);
	}

	$serializeWebview(
		webviewHandle: WebviewHandle
	): Thenable<any> {
		const webview = this.getWebview(webviewHandle);

		const serialzer = this._serializers.get(webview.viewType);
		if (!serialzer) {
			return TPromise.as(undefined);
		}

		return serialzer.serializeWebview(webview);
	}

	private getWebview(handle: WebviewHandle) {
		return this._webviews.get(handle);
	}
}