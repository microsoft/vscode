/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { MainThreadCustomEditors } from 'vs/workbench/api/browser/mainThreadCustomEditors';
import { MainThreadWebviews, reviveWebviewExtension, reviveWebviewOptions } from 'vs/workbench/api/browser/mainThreadWebviews';
import { MainThreadWebviewSerializers } from 'vs/workbench/api/browser/mainThreadWebviewSerializer';
import { MainThreadWebviewsViews } from 'vs/workbench/api/browser/mainThreadWebviewViews';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { editorGroupToViewColumn, EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/common/shared/editor';
import { IEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { WebviewIcons } from 'vs/workbench/contrib/webview/browser/webview';
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

@extHostNamedCustomer(extHostProtocol.MainContext.MainThreadWebviewService)
export class MainThreadWebviewPanelsAndViews extends Disposable implements extHostProtocol.MainThreadWebviewPanelsAndViewsShape {

	public readonly webviewPanelViewType = new WebviewViewTypeTransformer('mainThreadWebview-');

	private readonly _proxy: extHostProtocol.ExtHostWebviewsShape;

	private readonly _webviewInputs = new WebviewInputStore();

	private readonly _editorProviders = new Map<string, IDisposable>();
	private readonly _webviewFromDiffEditorHandles = new Set<string>();

	private readonly _mainThreadWebviews: MainThreadWebviews;

	private readonly serializers: MainThreadWebviewSerializers;

	constructor(
		context: extHostProtocol.IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviews);

		this._mainThreadWebviews = this._instantiationService.createInstance(MainThreadWebviews, context);
		context.set(extHostProtocol.MainContext.MainThreadWebviews, this._mainThreadWebviews);

		const webviewViews = this._instantiationService.createInstance(MainThreadWebviewsViews, this._mainThreadWebviews, context);
		context.set(extHostProtocol.MainContext.MainThreadWebviewViews, webviewViews);

		const customEditors = this._instantiationService.createInstance(MainThreadCustomEditors, this._mainThreadWebviews, this, context);
		context.set(extHostProtocol.MainContext.MainThreadCustomEditors, customEditors);

		this.serializers = this._instantiationService.createInstance(MainThreadWebviewSerializers, this._mainThreadWebviews, this, context);

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
		this._mainThreadWebviews.addWebview(handle, input.webview);

		input.webview.onDispose(() => {
			this._proxy.$onDidDisposeWebviewPanel(handle).finally(() => {
				this._webviewInputs.delete(handle);
			});
		});
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
		this.addWebviewInput(handle, webview);

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


	public $setIconPath(handle: extHostProtocol.WebviewPanelHandle, value: { light: UriComponents, dark: UriComponents; } | undefined): void {
		const webview = this.getWebviewInput(handle);
		webview.iconPath = reviveWebviewIcon(value);
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

	public $registerSerializer(viewType: string): void {
		this.serializers.$registerSerializer(viewType);
	}

	public $unregisterSerializer(viewType: string): void {
		this.serializers.$unregisterSerializer(viewType);
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
}


function reviveWebviewIcon(
	value: { light: UriComponents, dark: UriComponents; } | undefined
): WebviewIcons | undefined {
	return value
		? { light: URI.revive(value.light), dark: URI.revive(value.dark) }
		: undefined;
}

