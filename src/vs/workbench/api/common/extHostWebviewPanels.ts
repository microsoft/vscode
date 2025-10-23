/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import * as typeConverters from './extHostTypeConverters.js';
import { serializeWebviewOptions, ExtHostWebview, ExtHostWebviews, toExtensionData, shouldSerializeBuffersForPostMessage } from './extHostWebview.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { EditorGroupColumn } from '../../services/editor/common/editorGroupColumn.js';
import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol.js';
import * as extHostTypes from './extHostTypes.js';


type IconPath = URI | { readonly light: URI; readonly dark: URI };

class ExtHostWebviewPanel extends Disposable implements vscode.WebviewPanel {

	readonly #handle: extHostProtocol.WebviewHandle;
	readonly #proxy: extHostProtocol.MainThreadWebviewPanelsShape;
	readonly #viewType: string;

	readonly #webview: ExtHostWebview;
	readonly #options: vscode.WebviewPanelOptions;

	#title: string;
	#iconPath?: IconPath;
	#viewColumn: vscode.ViewColumn | undefined = undefined;
	#visible: boolean = true;
	#active: boolean;
	#isDisposed: boolean = false;

	readonly #onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this.#onDidDispose.event;

	readonly #onDidChangeViewState = this._register(new Emitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState = this.#onDidChangeViewState.event;

	constructor(
		handle: extHostProtocol.WebviewHandle,
		proxy: extHostProtocol.MainThreadWebviewPanelsShape,
		webview: ExtHostWebview,
		params: {
			viewType: string;
			title: string;
			viewColumn: vscode.ViewColumn | undefined;
			panelOptions: vscode.WebviewPanelOptions;
			active: boolean;
		}
	) {
		super();
		this.#handle = handle;
		this.#proxy = proxy;
		this.#webview = webview;
		this.#viewType = params.viewType;
		this.#options = params.panelOptions;
		this.#viewColumn = params.viewColumn;
		this.#title = params.title;
		this.#active = params.active;
	}

	public override dispose() {
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

	_updateViewState(newState: { active: boolean; visible: boolean; viewColumn: vscode.ViewColumn }) {
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

	public reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
		this.assertNotDisposed();
		this.#proxy.$reveal(this.#handle, {
			viewColumn: typeof viewColumn === 'undefined' ? undefined : typeConverters.ViewColumn.from(viewColumn),
			preserveFocus: !!preserveFocus
		});
	}

	private assertNotDisposed() {
		if (this.#isDisposed) {
			throw new Error('Webview is disposed');
		}
	}
}

export class ExtHostWebviewPanels extends Disposable implements extHostProtocol.ExtHostWebviewPanelsShape {

	private static newHandle(): extHostProtocol.WebviewHandle {
		return generateUuid();
	}

	private readonly _proxy: extHostProtocol.MainThreadWebviewPanelsShape;

	private readonly _webviewPanels = new Map<extHostProtocol.WebviewHandle, ExtHostWebviewPanel>();

	private readonly _serializers = new Map<string, {
		readonly serializer: vscode.WebviewPanelSerializer;
		readonly extension: IExtensionDescription;
	}>();

	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly webviews: ExtHostWebviews,
		private readonly workspace: IExtHostWorkspace | undefined,
	) {
		super();
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadWebviewPanels);
	}

	public override dispose(): void {
		super.dispose();

		this._webviewPanels.forEach(value => value.dispose());
		this._webviewPanels.clear();
	}

	public createWebviewPanel(
		extension: IExtensionDescription,
		viewType: string,
		title: string,
		showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
		options: (vscode.WebviewPanelOptions & vscode.WebviewOptions) = {},
	): vscode.WebviewPanel {
		const viewColumn = typeof showOptions === 'object' ? showOptions.viewColumn : showOptions;
		const webviewShowOptions = {
			viewColumn: typeConverters.ViewColumn.from(viewColumn),
			preserveFocus: typeof showOptions === 'object' && !!showOptions.preserveFocus
		};

		const serializeBuffersForPostMessage = shouldSerializeBuffersForPostMessage(extension);
		const handle = ExtHostWebviewPanels.newHandle();
		this._proxy.$createWebviewPanel(toExtensionData(extension), handle, viewType, {
			title,
			panelOptions: serializeWebviewPanelOptions(options),
			webviewOptions: serializeWebviewOptions(extension, this.workspace, options),
			serializeBuffersForPostMessage,
		}, webviewShowOptions);

		const webview = this.webviews.createNewWebview(handle, options, extension);
		const panel = this.createNewWebviewPanel(handle, viewType, title, viewColumn, options, webview, true);

		return panel;
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

	async $onDidDisposeWebviewPanel(handle: extHostProtocol.WebviewHandle): Promise<void> {
		const panel = this.getWebviewPanel(handle);
		panel?.dispose();

		this._webviewPanels.delete(handle);
		this.webviews.deleteWebview(handle);
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
		this._proxy.$registerSerializer(viewType, {
			serializeBuffersForPostMessage: shouldSerializeBuffersForPostMessage(extension)
		});

		return new extHostTypes.Disposable(() => {
			this._serializers.delete(viewType);
			this._proxy.$unregisterSerializer(viewType);
		});
	}

	async $deserializeWebviewPanel(
		webviewHandle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: {
			title: string;
			state: any;
			webviewOptions: extHostProtocol.IWebviewContentOptions;
			panelOptions: extHostProtocol.IWebviewPanelOptions;
			active: boolean;
		},
		position: EditorGroupColumn
	): Promise<void> {
		const entry = this._serializers.get(viewType);
		if (!entry) {
			throw new Error(`No serializer found for '${viewType}'`);
		}
		const { serializer, extension } = entry;

		const webview = this.webviews.createNewWebview(webviewHandle, initData.webviewOptions, extension);
		const revivedPanel = this.createNewWebviewPanel(webviewHandle, viewType, initData.title, position, initData.panelOptions, webview, initData.active);
		await serializer.deserializeWebviewPanel(revivedPanel, initData.state);
	}

	public createNewWebviewPanel(webviewHandle: string, viewType: string, title: string, position: vscode.ViewColumn, options: extHostProtocol.IWebviewPanelOptions, webview: ExtHostWebview, active: boolean) {
		const panel = new ExtHostWebviewPanel(webviewHandle, this._proxy, webview, { viewType, title, viewColumn: position, panelOptions: options, active });
		this._webviewPanels.set(webviewHandle, panel);
		return panel;
	}

	public getWebviewPanel(handle: extHostProtocol.WebviewHandle): ExtHostWebviewPanel | undefined {
		return this._webviewPanels.get(handle);
	}
}

function serializeWebviewPanelOptions(options: vscode.WebviewPanelOptions): extHostProtocol.IWebviewPanelOptions {
	return {
		enableFindWidget: options.enableFindWidget,
		retainContextWhenHidden: options.retainContextWhenHidden,
	};
}
