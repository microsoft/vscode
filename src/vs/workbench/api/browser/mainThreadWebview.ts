/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isWeb } from 'vs/base/common/platform';
import { startsWith } from 'vs/base/common/strings';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { editorGroupToViewColumn, EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/common/shared/editor';
import { IEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { CustomFileEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { CustomEditorModel } from 'vs/workbench/contrib/customEditor/browser/customEditorModel';
import { WebviewExtensionDescription } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { ICreateWebViewShowOptions, IWebviewWorkbenchService, WebviewInputOptions } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
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
}

class WebviewViewTypeTransformer {
	public constructor(
		public readonly prefix: string,
	) { }

	public fromExternal(viewType: string): string {
		return this.prefix + viewType;
	}

	public toExternal(viewType: string): string | undefined {
		return startsWith(viewType, this.prefix)
			? viewType.substr(this.prefix.length)
			: undefined;
	}
}

const webviewPanelViewType = new WebviewViewTypeTransformer('mainThreadWebview-');

@extHostNamedCustomer(extHostProtocol.MainContext.MainThreadWebviews)
export class MainThreadWebviews extends Disposable implements extHostProtocol.MainThreadWebviewsShape {

	private static readonly standardSupportedLinkSchemes = new Set([
		Schemas.http,
		Schemas.https,
		Schemas.mailto,
		Schemas.vscode,
		'vscode-insider',
	]);

	private readonly _proxy: extHostProtocol.ExtHostWebviewsShape;
	private readonly _webviewInputs = new WebviewInputStore();
	private readonly _revivers = new Map<string, IDisposable>();
	private readonly _editorProviders = new Map<string, IDisposable>();
	private readonly _models = new Map<string, CustomEditorModel>();

	constructor(
		context: extHostProtocol.IExtHostContext,
		@IExtensionService extensionService: IExtensionService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviews);
		this._register(_editorService.onDidActiveEditorChange(this.updateWebviewViewStates, this));
		this._register(_editorService.onDidVisibleEditorsChange(this.updateWebviewViewStates, this));

		// This reviver's only job is to activate webview panel extensions
		// This should trigger the real reviver to be registered from the extension host side.
		this._register(_webviewWorkbenchService.registerResolver({
			canResolve: (webview: WebviewInput) => {
				if (webview instanceof CustomFileEditorInput) {
					extensionService.activateByEvent(`onWebviewEditor:${webview.viewType}`);
					return false;
				}

				const viewType = webviewPanelViewType.toExternal(webview.viewType);
				if (typeof viewType === 'string') {
					extensionService.activateByEvent(`onWebviewPanel:${viewType}`);
				}
				return false;
			},
			resolveWebview: () => { throw new Error('not implemented'); }
		}));
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
		const webview = this._webviewWorkbenchService.createWebview(handle, webviewPanelViewType.fromExternal(viewType), title, mainThreadShowOptions, reviveWebviewOptions(options), extension);
		this.hookupWebviewEventDelegate(handle, webview);

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

	public $setIconPath(handle: extHostProtocol.WebviewPanelHandle, value: { light: UriComponents, dark: UriComponents; } | undefined): void {
		const webview = this.getWebviewInput(handle);
		webview.iconPath = reviveWebviewIcon(value);
	}

	public $setHtml(handle: extHostProtocol.WebviewPanelHandle, value: string): void {
		const webview = this.getWebviewInput(handle);
		webview.webview.html = value;
	}

	public $setOptions(handle: extHostProtocol.WebviewPanelHandle, options: modes.IWebviewOptions): void {
		const webview = this.getWebviewInput(handle);
		webview.webview.contentOptions = reviveWebviewOptions(options);
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
		const webview = this.getWebviewInput(handle);
		webview.webview.sendMessage(message);
		return true;
	}

	public $registerSerializer(viewType: string): void {
		if (this._revivers.has(viewType)) {
			throw new Error(`Reviver for ${viewType} already registered`);
		}

		this._revivers.set(viewType, this._webviewWorkbenchService.registerResolver({
			canResolve: (webviewInput) => {
				return webviewInput.viewType === webviewPanelViewType.fromExternal(viewType);
			},
			resolveWebview: async (webviewInput): Promise<void> => {
				const viewType = webviewPanelViewType.toExternal(webviewInput.viewType);
				if (!viewType) {
					webviewInput.webview.html = MainThreadWebviews.getDeserializationFailedContents(webviewInput.viewType);
					return;
				}

				const handle = webviewInput.id;
				this._webviewInputs.add(handle, webviewInput);
				this.hookupWebviewEventDelegate(handle, webviewInput);

				let state = undefined;
				if (webviewInput.webview.state) {
					try {
						state = JSON.parse(webviewInput.webview.state);
					} catch {
						// noop
					}
				}

				try {
					await this._proxy.$deserializeWebviewPanel(handle, viewType, webviewInput.getTitle(), state, editorGroupToViewColumn(this._editorGroupService, webviewInput.group || 0), webviewInput.webview.options);
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.html = MainThreadWebviews.getDeserializationFailedContents(viewType);
				}
			}
		}));
	}

	public $unregisterSerializer(viewType: string): void {
		const reviver = this._revivers.get(viewType);
		if (!reviver) {
			throw new Error(`No reviver for ${viewType} registered`);
		}

		reviver.dispose();
		this._revivers.delete(viewType);
	}

	public $registerEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: modes.IWebviewPanelOptions): void {
		if (this._editorProviders.has(viewType)) {
			throw new Error(`Provider for ${viewType} already registered`);
		}

		const extension = reviveWebviewExtension(extensionData);

		this._editorProviders.set(viewType, this._webviewWorkbenchService.registerResolver({
			canResolve: (webviewInput) => {
				return webviewInput instanceof CustomFileEditorInput && webviewInput.viewType === viewType;
			},
			resolveWebview: async (webviewInput: CustomFileEditorInput) => {
				const handle = webviewInput.id;
				this._webviewInputs.add(handle, webviewInput);
				this.hookupWebviewEventDelegate(handle, webviewInput);

				webviewInput.webview.options = options;
				webviewInput.webview.extension = extension;

				const model = this._instantiationService.createInstance(CustomEditorModel, webviewInput.getResource());
				webviewInput.setModel(model);
				this._models.set(handle, model);

				webviewInput.onDispose(() => {
					this._models.delete(handle);
				});

				model.onUndo(edit => {
					this._proxy.$undoEdits(handle, [edit]);
				});

				try {
					await this._proxy.$resolveWebviewEditor(
						webviewInput.getResource(),
						handle,
						viewType,
						webviewInput.getTitle(),
						editorGroupToViewColumn(this._editorGroupService, webviewInput.group || 0),
						webviewInput.webview.options
					);
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.html = MainThreadWebviews.getDeserializationFailedContents(viewType);
				}
			}
		}));
	}

	public $unregisterEditorProvider(viewType: string): void {
		const provider = this._editorProviders.get(viewType);
		if (!provider) {
			throw new Error(`No provider for ${viewType} registered`);
		}

		provider.dispose();
		this._editorProviders.delete(viewType);
	}

	public $onEdit(handle: extHostProtocol.WebviewPanelHandle, editData: string): void {
		const webview = this.getWebviewInput(handle);
		if (!(webview instanceof CustomFileEditorInput)) {
			throw new Error('Webview is not a webview editor');
		}

		const model = this._models.get(handle);
		if (!model) {
			throw new Error('Could not find model for webview editor');
		}

		model.makeEdit(editData);
	}

	private hookupWebviewEventDelegate(handle: extHostProtocol.WebviewPanelHandle, input: WebviewInput) {
		input.webview.onDidClickLink((uri: URI) => this.onDidClickLink(handle, uri));
		input.webview.onMessage((message: any) => this._proxy.$onMessage(handle, message));
		input.onDispose(() => {
			this._proxy.$onDidDisposeWebviewPanel(handle).finally(() => {
				this._webviewInputs.delete(handle);
			});
		});
		input.webview.onMissingCsp((extension: ExtensionIdentifier) => this._proxy.$onMissingCsp(handle, extension.value));
	}

	private updateWebviewViewStates() {
		if (!this._webviewInputs.size) {
			return;
		}

		const activeInput = this._editorService.activeControl && this._editorService.activeControl.input;
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
					active: topLevelInput === activeInput,
					position: editorGroupToViewColumn(this._editorGroupService, group.id),
				};
			}
		};

		for (const group of this._editorGroupService.groups) {
			for (const input of group.editors) {
				if (input instanceof DiffEditorInput) {
					updateViewStatesForInput(group, input, input.master);
					updateViewStatesForInput(group, input, input.details);
				} else {
					updateViewStatesForInput(group, input, input);
				}
			}
		}

		if (Object.keys(viewStates).length) {
			this._proxy.$onDidChangeWebviewPanelViewStates(viewStates);
		}
	}

	private onDidClickLink(handle: extHostProtocol.WebviewPanelHandle, link: URI): void {
		const webview = this.getWebviewInput(handle);
		if (this.isSupportedLink(webview, link)) {
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

	private getWebviewInput(handle: extHostProtocol.WebviewPanelHandle): WebviewInput {
		const webview = this.tryGetWebviewInput(handle);
		if (!webview) {
			throw new Error('Unknown webview handle:' + handle);
		}
		return webview;
	}

	private tryGetWebviewInput(handle: extHostProtocol.WebviewPanelHandle): WebviewInput | undefined {
		return this._webviewInputs.getInputForHandle(handle);
	}

	private static getDeserializationFailedContents(viewType: string) {
		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body>${localize('errorMessage', "An error occurred while restoring view:{0}", viewType)}</body>
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
): { light: URI, dark: URI; } | undefined {
	if (!value) {
		return undefined;
	}

	return {
		light: URI.revive(value.light),
		dark: URI.revive(value.dark)
	};
}
