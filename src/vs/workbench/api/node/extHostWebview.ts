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
import { ExtHostTextEditor } from './extHostTextEditor';

export class ExtHostWebview implements vscode.Webview {

	private readonly _handle: WebviewHandle;
	private readonly _viewType: string;
	private readonly _proxy: MainThreadWebviewsShape;
	private _title: string;
	private _html: string;
	private _options: vscode.WebviewOptions;
	private _isDisposed: boolean = false;
	private _viewColumn: vscode.ViewColumn;
	private _active: boolean;

	public readonly onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this.onMessageEmitter.event;

	public readonly onDisposeEmitter = new Emitter<void>();
	public readonly onDidDispose: Event<void> = this.onDisposeEmitter.event;

	public readonly onDidChangeViewStateEmitter = new Emitter<vscode.WebViewOnDidChangeViewStateEvent>();
	public readonly onDidChangeViewState: Event<vscode.WebViewOnDidChangeViewStateEvent> = this.onDidChangeViewStateEmitter.event;

	constructor(
		handle: WebviewHandle,
		proxy: MainThreadWebviewsShape,
		viewType: string,
		viewColumn: vscode.ViewColumn,
		options: vscode.WebviewOptions
	) {
		this._handle = handle;
		this._proxy = proxy;
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

	constructor(
		mainContext: IMainContext,
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

	async showWebviewWidget(editor: vscode.TextEditor, lineNumber: number, viewType: string, title: string, options: vscode.WebviewOptions) {
		const handle = ExtHostWebviews.webviewHandlePool++ + '';
		this._proxy.$showWebviewWidget(handle, (editor as ExtHostTextEditor).id, lineNumber, viewType, options);

		const webview = new ExtHostWebview(handle, this._proxy, viewType, undefined, options);
		this._webviews.set(handle, webview);
		return webview;
	}

	$onMessage(handle: WebviewHandle, message: any): void {
		const webview = this.getWebview(handle);
		if (webview) {
			webview.onMessageEmitter.fire(message);
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
		state: any,
		position: Position,
		options: vscode.WebviewOptions
	): Thenable<void> {
		const serializer = this._serializers.get(viewType);
		if (!serializer) {
			return TPromise.wrapError(new Error(`No serializer found for '${viewType}'`));
		}

		const revivedWebview = new ExtHostWebview(webviewHandle, this._proxy, viewType, typeConverters.toViewColumn(position), options);
		this._webviews.set(webviewHandle, revivedWebview);
		return serializer.deserializeWebview(revivedWebview, state);
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

		return serialzer.serializeWebview(webview);
	}

	private getWebview(handle: WebviewHandle): ExtHostWebview | undefined {
		return this._webviews.get(handle);
	}
}