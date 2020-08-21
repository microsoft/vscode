/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isWeb } from 'vs/base/common/platform';
import { escape } from 'vs/base/common/strings';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CustomEditorModelType, MainThreadCustomEditors } from 'vs/workbench/api/browser/mainThreadCustomEditors';
import { MainThreadWebviewSerializers } from 'vs/workbench/api/browser/mainThreadWebviewSerializer';
import { MainThreadWebviewsViews } from 'vs/workbench/api/browser/mainThreadWebviewViews';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { editorGroupToViewColumn, EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/common/shared/editor';
import { IEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { Webview, WebviewExtensionDescription, WebviewIcons, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { ICreateWebViewShowOptions, IWebviewWorkbenchService, WebviewInputOptions } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { extHostNamedCustomer } from '../common/extHostCustomers';

/**
 * Bi-directional map between webview handles and inputs.
 */
class WebviewInputStore {
	private readonly _handlesToInputs = new Map<string, WebviewInput>();
	private readonly _inputsToHandles = new Map<WebviewInput, string>();

	public add(handle: string, input: WebviewInput): void {
		this._handlesToInputs.set(handle, input);
		this._inputsToHandles.set(input, handle);
	}

	public getHandleForInput(input: WebviewInput): string | undefined {
		return this._inputsToHandles.get(input);
	}

	public getInputForHandle(handle: string): WebviewInput | undefined {
		return this._handlesToInputs.get(handle);
	}

	public delete(handle: string): void {
		const input = this.getInputForHandle(handle);
		this._handlesToInputs.delete(handle);
		if (input) {
			this._inputsToHandles.delete(input);
		}
	}

	public get size(): number {
		return this._handlesToInputs.size;
	}

	[Symbol.iterator](): Iterator<WebviewInput> {
		return this._handlesToInputs.values();
	}
}

class WebviewViewTypeTransformer {
	public constructor(
		public readonly prefix: string,
	) { }

	public fromExternal(viewType: string): string {
		return this.prefix + viewType;
	}

	public toExternal(viewType: string): string | undefined {
		return viewType.startsWith(this.prefix)
			? viewType.substr(this.prefix.length)
			: undefined;
	}
}

@extHostNamedCustomer(extHostProtocol.MainContext.MainThreadWebviews)
export class MainThreadWebviews extends Disposable implements extHostProtocol.MainThreadWebviewsShape {

	private static readonly standardSupportedLinkSchemes = new Set([
		Schemas.http,
		Schemas.https,
		Schemas.mailto,
		Schemas.vscode,
		'vscode-insider',
	]);

	public readonly webviewPanelViewType = new WebviewViewTypeTransformer('mainThreadWebview-');

	private readonly _proxy: extHostProtocol.ExtHostWebviewsShape;

	private readonly _webviews = new Map<string, Webview>();
	private readonly _webviewInputs = new WebviewInputStore();

	private readonly _editorProviders = new Map<string, IDisposable>();
	private readonly _webviewFromDiffEditorHandles = new Set<string>();

	private readonly serializers: MainThreadWebviewSerializers;
	private readonly customEditors: MainThreadCustomEditors;
	private readonly webviewViews: MainThreadWebviewsViews;

	constructor(
		context: extHostProtocol.IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviews);

		this.serializers = this._instantiationService.createInstance(MainThreadWebviewSerializers, this, context);
		this.customEditors = this._instantiationService.createInstance(MainThreadCustomEditors, this, context);
		this.webviewViews = this._instantiationService.createInstance(MainThreadWebviewsViews, this, context);

		this._register(_editorService.onDidActiveEditorChange(() => {
			const activeInput = this._editorService.activeEditor;
			if (activeInput instanceof DiffEditorInput && activeInput.primary instanceof WebviewInput && activeInput.secondary instanceof WebviewInput) {
				this.registerWebviewFromDiffEditorListeners(activeInput);
			}

			this.updateWebviewViewStates(activeInput);
		}));

		this._register(_editorService.onDidVisibleEditorsChange(() => {
			this.updateWebviewViewStates(this._editorService.activeEditor);
		}));
	}

	dispose() {
		super.dispose();

		for (const disposable of this._editorProviders.values()) {
			disposable.dispose();
		}
		this._editorProviders.clear();
	}

	public get webviewInputs(): Iterable<WebviewInput> { return this._webviewInputs; }

	public addWebviewInput(handle: extHostProtocol.WebviewPanelHandle, input: WebviewInput): void {
		this._webviewInputs.add(handle, input);
		this.addWebview(handle, input.webview);
	}

	public addWebview(handle: extHostProtocol.WebviewPanelHandle, webview: WebviewOverlay): void {
		this._webviews.set(handle, webview);
		this.hookupWebviewEventDelegate(handle, webview);
	}

	public $createWebviewPanel(
		extensionData: extHostProtocol.WebviewExtensionDescription,
		handle: extHostProtocol.WebviewPanelHandle,
		viewType: string,
		title: string,
		showOptions: { viewColumn?: EditorViewColumn, preserveFocus?: boolean; },
		options: WebviewInputOptions
	): void {
		const mainThreadShowOptions: ICreateWebViewShowOptions = Object.create(null);
		if (showOptions) {
			mainThreadShowOptions.preserveFocus = !!showOptions.preserveFocus;
			mainThreadShowOptions.group = viewColumnToEditorGroup(this._editorGroupService, showOptions.viewColumn);
		}

		const extension = reviveWebviewExtension(extensionData);
		const webview = this._webviewWorkbenchService.createWebview(handle, this.webviewPanelViewType.fromExternal(viewType), title, mainThreadShowOptions, reviveWebviewOptions(options), extension);
		this.hookupWebviewEventDelegate(handle, webview.webview);

		this._webviewInputs.add(handle, webview);

		/* __GDPR__
			"webviews:createWebviewPanel" : {
				"extensionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryService.publicLog('webviews:createWebviewPanel', { extensionId: extension.id.value });
	}

	public $disposeWebview(handle: extHostProtocol.WebviewPanelHandle): void {
		const webview = this.getWebviewInput(handle);
		webview.dispose();
	}

	public $setTitle(handle: extHostProtocol.WebviewPanelHandle, value: string): void {
		const webview = this.getWebviewInput(handle);
		webview.setName(value);
	}

	public $setWebviewViewTitle(handle: extHostProtocol.WebviewPanelHandle, value: string | undefined): void {
		this.webviewViews.$setWebviewViewTitle(handle, value);
	}

	public $setIconPath(handle: extHostProtocol.WebviewPanelHandle, value: { light: UriComponents, dark: UriComponents; } | undefined): void {
		const webview = this.getWebviewInput(handle);
		webview.iconPath = reviveWebviewIcon(value);
	}

	public $setHtml(handle: extHostProtocol.WebviewPanelHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.html = value;
	}

	public $setOptions(handle: extHostProtocol.WebviewPanelHandle, options: modes.IWebviewOptions): void {
		const webview = this.getWebview(handle);
		webview.contentOptions = reviveWebviewOptions(options);
	}

	public $reveal(handle: extHostProtocol.WebviewPanelHandle, showOptions: extHostProtocol.WebviewPanelShowOptions): void {
		const webview = this.getWebviewInput(handle);
		if (webview.isDisposed()) {
			return;
		}

		const targetGroup = this._editorGroupService.getGroup(viewColumnToEditorGroup(this._editorGroupService, showOptions.viewColumn)) || this._editorGroupService.getGroup(webview.group || 0);
		if (targetGroup) {
			this._webviewWorkbenchService.revealWebview(webview, targetGroup, !!showOptions.preserveFocus);
		}
	}

	public async $postMessage(handle: extHostProtocol.WebviewPanelHandle, message: any): Promise<boolean> {
		const webview = this.getWebview(handle);
		webview.postMessage(message);
		return true;
	}

	public $registerSerializer(viewType: string): void {
		this.serializers.$registerSerializer(viewType);
	}

	public $unregisterSerializer(viewType: string): void {
		this.serializers.$unregisterSerializer(viewType);
	}

	public $registerWebviewViewProvider(viewType: string, options?: { retainContextWhenHidden?: boolean }): void {
		this.webviewViews.$registerWebviewViewProvider(viewType, options);
	}

	public $unregisterWebviewViewProvider(viewType: string): void {
		this.webviewViews.$unregisterWebviewViewProvider(viewType);
	}

	public $registerTextEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: modes.IWebviewPanelOptions, capabilities: extHostProtocol.CustomTextEditorCapabilities): void {
		this.customEditors.registerEditorProvider(CustomEditorModelType.Text, reviveWebviewExtension(extensionData), viewType, options, capabilities, true);
	}

	public $registerCustomEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: modes.IWebviewPanelOptions, supportsMultipleEditorsPerDocument: boolean): void {
		this.customEditors.registerEditorProvider(CustomEditorModelType.Custom, reviveWebviewExtension(extensionData), viewType, options, {}, supportsMultipleEditorsPerDocument);
	}

	public $unregisterEditorProvider(viewType: string): void {
		this.customEditors.$unregisterEditorProvider(viewType);
	}

	public async $onDidEdit(resourceComponents: UriComponents, viewType: string, editId: number, label: string | undefined): Promise<void> {
		this.customEditors.$onDidEdit(resourceComponents, viewType, editId, label);
	}

	public async $onContentChange(resourceComponents: UriComponents, viewType: string): Promise<void> {
		this.customEditors.$onContentChange(resourceComponents, viewType);
	}

	public hookupWebviewEventDelegate(handle: extHostProtocol.WebviewPanelHandle, webview: WebviewOverlay) {
		const disposables = new DisposableStore();

		disposables.add(webview.onDidClickLink((uri) => this.onDidClickLink(handle, uri)));
		disposables.add(webview.onMessage((message: any) => { this._proxy.$onMessage(handle, message); }));
		disposables.add(webview.onMissingCsp((extension: ExtensionIdentifier) => this._proxy.$onMissingCsp(handle, extension.value)));

		disposables.add(webview.onDispose(() => {
			disposables.dispose();

			this._proxy.$onDidDisposeWebviewPanel(handle).finally(() => {
				this._webviews.delete(handle);
				this._webviewInputs.delete(handle);
			});
		}));
	}

	private registerWebviewFromDiffEditorListeners(diffEditorInput: DiffEditorInput): void {
		const primary = diffEditorInput.primary as WebviewInput;
		const secondary = diffEditorInput.secondary as WebviewInput;

		if (this._webviewFromDiffEditorHandles.has(primary.id) || this._webviewFromDiffEditorHandles.has(secondary.id)) {
			return;
		}

		this._webviewFromDiffEditorHandles.add(primary.id);
		this._webviewFromDiffEditorHandles.add(secondary.id);

		const disposables = new DisposableStore();
		disposables.add(primary.webview.onDidFocus(() => this.updateWebviewViewStates(primary)));
		disposables.add(secondary.webview.onDidFocus(() => this.updateWebviewViewStates(secondary)));
		disposables.add(diffEditorInput.onDispose(() => {
			this._webviewFromDiffEditorHandles.delete(primary.id);
			this._webviewFromDiffEditorHandles.delete(secondary.id);
			dispose(disposables);
		}));
	}

	private updateWebviewViewStates(activeEditorInput: IEditorInput | undefined) {
		if (!this._webviewInputs.size) {
			return;
		}

		const viewStates: extHostProtocol.WebviewPanelViewStateData = {};

		const updateViewStatesForInput = (group: IEditorGroup, topLevelInput: IEditorInput, editorInput: IEditorInput) => {
			if (!(editorInput instanceof WebviewInput)) {
				return;
			}

			editorInput.updateGroup(group.id);

			const handle = this._webviewInputs.getHandleForInput(editorInput);
			if (handle) {
				viewStates[handle] = {
					visible: topLevelInput === group.activeEditor,
					active: editorInput === activeEditorInput,
					position: editorGroupToViewColumn(this._editorGroupService, group.id),
				};
			}
		};

		for (const group of this._editorGroupService.groups) {
			for (const input of group.editors) {
				if (input instanceof DiffEditorInput) {
					updateViewStatesForInput(group, input, input.primary);
					updateViewStatesForInput(group, input, input.secondary);
				} else {
					updateViewStatesForInput(group, input, input);
				}
			}
		}

		if (Object.keys(viewStates).length) {
			this._proxy.$onDidChangeWebviewPanelViewStates(viewStates);
		}
	}

	private onDidClickLink(handle: extHostProtocol.WebviewPanelHandle, link: string): void {
		const webview = this.getWebviewInput(handle);
		if (this.isSupportedLink(webview, URI.parse(link))) {
			this._openerService.open(link, { fromUserGesture: true });
		}
	}

	private isSupportedLink(webview: WebviewInput, link: URI): boolean {
		if (MainThreadWebviews.standardSupportedLinkSchemes.has(link.scheme)) {
			return true;
		}
		if (!isWeb && this._productService.urlProtocol === link.scheme) {
			return true;
		}
		return !!webview.webview.contentOptions.enableCommandUris && link.scheme === Schemas.command;
	}

	private getWebview(handle: extHostProtocol.WebviewPanelHandle): Webview {
		const webview = this._webviews.get(handle);
		if (!webview) {
			throw new Error(`Unknown webview handle:${handle}`);
		}
		return webview;
	}

	private getWebviewInput(handle: extHostProtocol.WebviewPanelHandle): WebviewInput {
		const webview = this.tryGetWebviewInput(handle);
		if (!webview) {
			throw new Error(`Unknown webview handle:${handle}`);
		}
		return webview;
	}

	private tryGetWebviewInput(handle: extHostProtocol.WebviewPanelHandle): WebviewInput | undefined {
		return this._webviewInputs.getInputForHandle(handle);
	}

	public getWebviewResolvedFailedContent(viewType: string) {
		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body>${localize('errorMessage', "An error occurred while loading view: {0}", escape(viewType))}</body>
		</html>`;
	}
}

function reviveWebviewExtension(extensionData: extHostProtocol.WebviewExtensionDescription): WebviewExtensionDescription {
	return { id: extensionData.id, location: URI.revive(extensionData.location) };
}

function reviveWebviewOptions(options: modes.IWebviewOptions): WebviewInputOptions {
	return {
		...options,
		allowScripts: options.enableScripts,
		localResourceRoots: Array.isArray(options.localResourceRoots) ? options.localResourceRoots.map(r => URI.revive(r)) : undefined,
	};
}

function reviveWebviewIcon(
	value: { light: UriComponents, dark: UriComponents; } | undefined
): WebviewIcons | undefined {
	return value
		? { light: URI.revive(value.light), dark: URI.revive(value.dark) }
		: undefined;
}

