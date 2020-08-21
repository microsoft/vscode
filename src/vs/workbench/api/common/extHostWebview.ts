/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as modes from 'vs/editor/common/modes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtHostApiDeprecationService } from 'vs/workbench/api/common/extHostApiDeprecationService';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { asWebviewUri, WebviewInitData } from 'vs/workbench/api/common/shared/webview';
import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol';

export class ExtHostWebview implements vscode.Webview {

	readonly #handle: extHostProtocol.WebviewPanelHandle;
	readonly #proxy: extHostProtocol.MainThreadWebviewsShape;
	readonly #deprecationService: IExtHostApiDeprecationService;

	readonly #initData: WebviewInitData;
	readonly #workspace: IExtHostWorkspace | undefined;
	readonly #extension: IExtensionDescription;

	#html: string = '';
	#options: vscode.WebviewOptions;
	#isDisposed: boolean = false;
	#hasCalledAsWebviewUri = false;

	constructor(
		handle: extHostProtocol.WebviewPanelHandle,
		proxy: extHostProtocol.MainThreadWebviewsShape,
		options: vscode.WebviewOptions,
		initData: WebviewInitData,
		workspace: IExtHostWorkspace | undefined,
		extension: IExtensionDescription,
		deprecationService: IExtHostApiDeprecationService,
	) {
		this.#handle = handle;
		this.#proxy = proxy;
		this.#options = options;
		this.#initData = initData;
		this.#workspace = workspace;
		this.#extension = extension;
		this.#deprecationService = deprecationService;
	}

	/* internal */ readonly _onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this._onMessageEmitter.event;

	readonly #onDidDisposeEmitter = new Emitter<void>();
	/* internal */ readonly _onDidDispose: Event<void> = this.#onDidDisposeEmitter.event;

	public dispose() {
		this.#onDidDisposeEmitter.fire();

		this.#onDidDisposeEmitter.dispose();
		this._onMessageEmitter.dispose();
	}

	public asWebviewUri(resource: vscode.Uri): vscode.Uri {
		this.#hasCalledAsWebviewUri = true;
		return asWebviewUri(this.#initData, this.#handle, resource);
	}

	public get cspSource(): string {
		return this.#initData.webviewCspSource
			.replace('{{uuid}}', this.#handle);
	}

	public get html(): string {
		this.assertNotDisposed();
		return this.#html;
	}

	public set html(value: string) {
		this.assertNotDisposed();
		if (this.#html !== value) {
			this.#html = value;
			if (!this.#hasCalledAsWebviewUri && /(["'])vscode-resource:([^\s'"]+?)(["'])/i.test(value)) {
				this.#hasCalledAsWebviewUri = true;
				this.#deprecationService.report('Webview vscode-resource: uris', this.#extension,
					`Please migrate to use the 'webview.asWebviewUri' api instead: https://aka.ms/vscode-webview-use-aswebviewuri`);
			}
			this.#proxy.$setHtml(this.#handle, value);
		}
	}

	public get options(): vscode.WebviewOptions {
		this.assertNotDisposed();
		return this.#options;
	}

	public set options(newOptions: vscode.WebviewOptions) {
		this.assertNotDisposed();
		this.#proxy.$setOptions(this.#handle, convertWebviewOptions(this.#extension, this.#workspace, newOptions));
		this.#options = newOptions;
	}

	public postMessage(message: any): Promise<boolean> {
		this.assertNotDisposed();
		return this.#proxy.$postMessage(this.#handle, message);
	}

	private assertNotDisposed() {
		if (this.#isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

type IconPath = URI | { light: URI, dark: URI };


class ExtHostWebviewPanel extends Disposable implements vscode.WebviewPanel {

	readonly #handle: extHostProtocol.WebviewPanelHandle;
	readonly #proxy: extHostProtocol.MainThreadWebviewsShape;
	readonly #viewType: string;

	readonly #webview: ExtHostWebview;
	readonly #options: vscode.WebviewPanelOptions;

	#title: string;
	#iconPath?: IconPath;
	#viewColumn: vscode.ViewColumn | undefined = undefined;
	#visible: boolean = true;
	#active: boolean = true;
	#isDisposed: boolean = false;

	readonly #onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this.#onDidDispose.event;

	readonly #onDidChangeViewState = this._register(new Emitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState = this.#onDidChangeViewState.event;

	constructor(
		handle: extHostProtocol.WebviewPanelHandle,
		proxy: extHostProtocol.MainThreadWebviewsShape,
		viewType: string,
		title: string,
		viewColumn: vscode.ViewColumn | undefined,
		editorOptions: vscode.WebviewPanelOptions,
		webview: ExtHostWebview
	) {
		super();
		this.#handle = handle;
		this.#proxy = proxy;
		this.#viewType = viewType;
		this.#options = editorOptions;
		this.#viewColumn = viewColumn;
		this.#title = title;
		this.#webview = webview;
	}

	public dispose() {
		if (this.#isDisposed) {
			return;
		}

		this.#isDisposed = true;
		this.#onDidDispose.fire();

		this.#proxy.$disposeWebview(this.#handle);
		this.#webview.dispose();

		super.dispose();
	}

	get webview() {
		this.assertNotDisposed();
		return this.#webview;
	}

	get viewType(): string {
		this.assertNotDisposed();
		return this.#viewType;
	}

	get title(): string {
		this.assertNotDisposed();
		return this.#title;
	}

	set title(value: string) {
		this.assertNotDisposed();
		if (this.#title !== value) {
			this.#title = value;
			this.#proxy.$setTitle(this.#handle, value);
		}
	}

	get iconPath(): IconPath | undefined {
		this.assertNotDisposed();
		return this.#iconPath;
	}

	set iconPath(value: IconPath | undefined) {
		this.assertNotDisposed();
		if (this.#iconPath !== value) {
			this.#iconPath = value;

			this.#proxy.$setIconPath(this.#handle, URI.isUri(value) ? { light: value, dark: value } : value);
		}
	}

	get options() {
		return this.#options;
	}

	get viewColumn(): vscode.ViewColumn | undefined {
		this.assertNotDisposed();
		if (typeof this.#viewColumn === 'number' && this.#viewColumn < 0) {
			// We are using a symbolic view column
			// Return undefined instead to indicate that the real view column is currently unknown but will be resolved.
			return undefined;
		}
		return this.#viewColumn;
	}

	public get active(): boolean {
		this.assertNotDisposed();
		return this.#active;
	}

	public get visible(): boolean {
		this.assertNotDisposed();
		return this.#visible;
	}

	_updateViewState(newState: { active: boolean; visible: boolean; viewColumn: vscode.ViewColumn; }) {
		if (this.#isDisposed) {
			return;
		}

		if (this.active !== newState.active || this.visible !== newState.visible || this.viewColumn !== newState.viewColumn) {
			this.#active = newState.active;
			this.#visible = newState.visible;
			this.#viewColumn = newState.viewColumn;
			this.#onDidChangeViewState.fire({ webviewPanel: this });
		}
	}

	public postMessage(message: any): Promise<boolean> {
		this.assertNotDisposed();
		return this.#proxy.$postMessage(this.#handle, message);
	}

	public reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
		this.assertNotDisposed();
		this.#proxy.$reveal(this.#handle, {
			viewColumn: viewColumn ? typeConverters.ViewColumn.from(viewColumn) : undefined,
			preserveFocus: !!preserveFocus
		});
	}

	private assertNotDisposed() {
		if (this.#isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

export class ExtHostWebviews implements extHostProtocol.ExtHostWebviewsShape {

	private static newHandle(): extHostProtocol.WebviewPanelHandle {
		return generateUuid();
	}

	private readonly _proxy: extHostProtocol.MainThreadWebviewsShape;

	private readonly _webviews = new Map<extHostProtocol.WebviewPanelHandle, ExtHostWebview>();
	private readonly _webviewPanels = new Map<extHostProtocol.WebviewPanelHandle, ExtHostWebviewPanel>();


	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly initData: WebviewInitData,
		private readonly workspace: IExtHostWorkspace | undefined,
		private readonly _logService: ILogService,
		private readonly _deprecationService: IExtHostApiDeprecationService,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadWebviews);
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

		const webview = this.createNewWebview(handle, options, extension);
		const panel = this.createNewWebviewPanel(handle, viewType, title, viewColumn, options, webview);

		return panel;
	}

	public $onMessage(
		handle: extHostProtocol.WebviewPanelHandle,
		message: any
	): void {
		const webview = this.getWebview(handle);
		if (webview) {
			webview._onMessageEmitter.fire(message);
		}
	}

	public $onMissingCsp(
		_handle: extHostProtocol.WebviewPanelHandle,
		extensionId: string
	): void {
		this._logService.warn(`${extensionId} created a webview without a content security policy: https://aka.ms/vscode-webview-missing-csp`);
	}

	public $onDidChangeWebviewPanelViewStates(newStates: extHostProtocol.WebviewPanelViewStateData): void {
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
			if (!panel) {
				continue;
			}

			const newState = newStates[handle];
			panel._updateViewState({
				active: newState.active,
				visible: newState.visible,
				viewColumn: typeConverters.ViewColumn.to(newState.position),
			});
		}
	}

	async $onDidDisposeWebviewPanel(handle: extHostProtocol.WebviewPanelHandle): Promise<void> {
		const panel = this.getWebviewPanel(handle);
		panel?.dispose();

		this._webviewPanels.delete(handle);
		this._webviews.delete(handle);
	}

	public createNewWebviewPanel(webviewHandle: string, viewType: string, title: string, position: number, options: modes.IWebviewOptions & modes.IWebviewPanelOptions, webview: ExtHostWebview) {
		const panel = new ExtHostWebviewPanel(webviewHandle, this._proxy, viewType, title, typeof position === 'number' && position >= 0 ? typeConverters.ViewColumn.to(position) : undefined, options, webview);
		this._webviewPanels.set(webviewHandle, panel);
		return panel;
	}

	public createNewWebview(handle: string, options: modes.IWebviewOptions & modes.IWebviewPanelOptions, extension: IExtensionDescription): ExtHostWebview {
		const webview = new ExtHostWebview(handle, this._proxy, reviveOptions(options), this.initData, this.workspace, extension, this._deprecationService);
		this._webviews.set(handle, webview);

		webview._onDidDispose(() => { this._webviews.delete(handle); });

		return webview;
	}

	private getWebview(handle: extHostProtocol.WebviewPanelHandle): ExtHostWebview | undefined {
		return this._webviews.get(handle);
	}

	public getWebviewPanel(handle: extHostProtocol.WebviewPanelHandle): ExtHostWebviewPanel | undefined {
		return this._webviewPanels.get(handle);
	}
}

export function toExtensionData(extension: IExtensionDescription): extHostProtocol.WebviewExtensionDescription {
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

function reviveOptions(
	options: modes.IWebviewOptions & modes.IWebviewPanelOptions
): vscode.WebviewOptions {
	return {
		...options,
		localResourceRoots: options.localResourceRoots?.map(components => URI.from(components)),
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
