/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose, IDisposable, IReference } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { isWeb } from 'vs/base/common/platform';
import { escape } from 'vs/base/common/strings';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUndoRedoService, UndoRedoElementType } from 'vs/platform/undoRedo/common/undoRedo';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { editorGroupToViewColumn, EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/common/shared/editor';
import { IEditorInput, IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { CustomEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { ICustomEditorModel, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomTextEditorModel } from 'vs/workbench/contrib/customEditor/common/customTextEditorModel';
import { WebviewExtensionDescription, WebviewIcons } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { ICreateWebViewShowOptions, IWebviewWorkbenchService, WebviewInputOptions } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkingCopy, IWorkingCopyBackup, IWorkingCopyService, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
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
		return viewType.startsWith(this.prefix)
			? viewType.substr(this.prefix.length)
			: undefined;
	}
}

const enum ModelType {
	Custom,
	Text,
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
	private readonly _webviewFromDiffEditorHandles = new Set<string>();

	constructor(
		context: extHostProtocol.IExtHostContext,
		@IExtensionService extensionService: IExtensionService,
		@ICustomEditorService private readonly _customEditorService: ICustomEditorService,
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

		this._register(_editorService.onDidActiveEditorChange(() => {
			const activeInput = this._editorService.activeEditor;
			if (activeInput instanceof DiffEditorInput && activeInput.master instanceof WebviewInput && activeInput.details instanceof WebviewInput) {
				this.registerWebviewFromDiffEditorListeners(activeInput);
			}

			this.updateWebviewViewStates(activeInput);
		}));

		this._register(_editorService.onDidVisibleEditorsChange(() => {
			this.updateWebviewViewStates(this._editorService.activeEditor);
		}));

		// This reviver's only job is to activate webview panel extensions
		// This should trigger the real reviver to be registered from the extension host side.
		this._register(_webviewWorkbenchService.registerResolver({
			canResolve: (webview: WebviewInput) => {
				if (webview instanceof CustomEditorInput) {
					extensionService.activateByEvent(`onCustomEditor:${webview.viewType}`);
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

	public $registerTextEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: modes.IWebviewPanelOptions, capabilities: extHostProtocol.CustomTextEditorCapabilities): void {
		this.registerEditorProvider(ModelType.Text, extensionData, viewType, options, capabilities);
	}

	public $registerCustomEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: modes.IWebviewPanelOptions): void {
		this.registerEditorProvider(ModelType.Custom, extensionData, viewType, options, {});
	}

	private registerEditorProvider(
		modelType: ModelType,
		extensionData: extHostProtocol.WebviewExtensionDescription,
		viewType: string,
		options: modes.IWebviewPanelOptions,
		capabilities: extHostProtocol.CustomTextEditorCapabilities,
	): DisposableStore {
		if (this._editorProviders.has(viewType)) {
			throw new Error(`Provider for ${viewType} already registered`);
		}

		const extension = reviveWebviewExtension(extensionData);

		const disposables = new DisposableStore();
		disposables.add(this._webviewWorkbenchService.registerResolver({
			canResolve: (webviewInput) => {
				return webviewInput instanceof CustomEditorInput && webviewInput.viewType === viewType;
			},
			resolveWebview: async (webviewInput: CustomEditorInput, cancellation: CancellationToken) => {
				const handle = webviewInput.id;
				const resource = webviewInput.resource;

				this._webviewInputs.add(handle, webviewInput);
				this.hookupWebviewEventDelegate(handle, webviewInput);
				webviewInput.webview.options = options;
				webviewInput.webview.extension = extension;

				let modelRef = await this.getOrCreateCustomEditorModel(modelType, resource, viewType, cancellation);
				if (cancellation.isCancellationRequested) {
					modelRef.dispose();
					return;
				}

				webviewInput.webview.onDispose(() => {
					modelRef.dispose();
				});

				if (capabilities.supportsMove) {
					webviewInput.onMove(async (newResource: URI) => {
						const oldModel = modelRef;
						modelRef = await this.getOrCreateCustomEditorModel(modelType, newResource, viewType, CancellationToken.None);
						this._proxy.$onMoveCustomEditor(handle, newResource, viewType);
						oldModel.dispose();
					});
				}

				try {
					await this._proxy.$resolveWebviewEditor(resource, handle, viewType, webviewInput.getTitle(), editorGroupToViewColumn(this._editorGroupService, webviewInput.group || 0), webviewInput.webview.options, cancellation);
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.html = MainThreadWebviews.getDeserializationFailedContents(viewType);
					return;
				}
			}
		}));

		this._editorProviders.set(viewType, disposables);

		return disposables;
	}

	public $unregisterEditorProvider(viewType: string): void {
		const provider = this._editorProviders.get(viewType);
		if (!provider) {
			throw new Error(`No provider for ${viewType} registered`);
		}

		provider.dispose();
		this._editorProviders.delete(viewType);

		this._customEditorService.models.disposeAllModelsForView(viewType);
	}

	private async getOrCreateCustomEditorModel(
		modelType: ModelType,
		resource: URI,
		viewType: string,
		cancellation: CancellationToken,
	): Promise<IReference<ICustomEditorModel>> {
		const existingModel = this._customEditorService.models.tryRetain(resource, viewType);
		if (existingModel) {
			return existingModel;
		}

		const model = modelType === ModelType.Text
			? CustomTextEditorModel.create(this._instantiationService, viewType, resource)
			: MainThreadCustomEditorModel.create(this._instantiationService, this._proxy, viewType, resource, cancellation);

		return this._customEditorService.models.add(resource, viewType, model);
	}

	public async $onDidEdit(resourceComponents: UriComponents, viewType: string, editId: number, label: string | undefined): Promise<void> {
		const resource = URI.revive(resourceComponents);
		const model = await this._customEditorService.models.get(resource, viewType);
		if (!model || !(model instanceof MainThreadCustomEditorModel)) {
			throw new Error('Could not find model for webview editor');
		}

		model.pushEdit(editId, label);
	}

	private hookupWebviewEventDelegate(handle: extHostProtocol.WebviewPanelHandle, input: WebviewInput) {
		const disposables = new DisposableStore();

		disposables.add(input.webview.onDidClickLink((uri) => this.onDidClickLink(handle, uri)));
		disposables.add(input.webview.onMessage((message: any) => { this._proxy.$onMessage(handle, message); }));
		disposables.add(input.webview.onMissingCsp((extension: ExtensionIdentifier) => this._proxy.$onMissingCsp(handle, extension.value)));

		disposables.add(input.webview.onDispose(() => {
			disposables.dispose();

			this._proxy.$onDidDisposeWebviewPanel(handle).finally(() => {
				this._webviewInputs.delete(handle);
			});
		}));
	}

	private registerWebviewFromDiffEditorListeners(diffEditorInput: DiffEditorInput): void {
		const master = diffEditorInput.master as WebviewInput;
		const details = diffEditorInput.details as WebviewInput;

		if (this._webviewFromDiffEditorHandles.has(master.id) || this._webviewFromDiffEditorHandles.has(details.id)) {
			return;
		}

		this._webviewFromDiffEditorHandles.add(master.id);
		this._webviewFromDiffEditorHandles.add(details.id);

		const disposables = new DisposableStore();
		disposables.add(master.webview.onDidFocus(() => this.updateWebviewViewStates(master)));
		disposables.add(details.webview.onDidFocus(() => this.updateWebviewViewStates(details)));
		disposables.add(diffEditorInput.onDispose(() => {
			this._webviewFromDiffEditorHandles.delete(master.id);
			this._webviewFromDiffEditorHandles.delete(details.id);
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

	private static getDeserializationFailedContents(viewType: string) {
		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body>${localize('errorMessage', "An error occurred while restoring view:{0}", escape(viewType))}</body>
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

namespace HotExitState {
	export const enum Type {
		Allowed,
		NotAllowed,
		Pending,
	}

	export const Allowed = Object.freeze({ type: Type.Allowed } as const);
	export const NotAllowed = Object.freeze({ type: Type.NotAllowed } as const);

	export class Pending {
		readonly type = Type.Pending;

		constructor(
			public readonly operation: CancelablePromise<void>,
		) { }
	}

	export type State = typeof Allowed | typeof NotAllowed | Pending;
}

const customDocumentFileScheme = 'custom';

class MainThreadCustomEditorModel extends Disposable implements ICustomEditorModel, IWorkingCopy {

	private _hotExitState: HotExitState.State = HotExitState.Allowed;
	private _currentEditIndex: number = -1;
	private _savePoint: number = -1;
	private readonly _edits: Array<number> = [];

	public static async create(
		instantiationService: IInstantiationService,
		proxy: extHostProtocol.ExtHostWebviewsShape,
		viewType: string,
		resource: URI,
		cancellation: CancellationToken,
	) {
		const { editable } = await proxy.$createWebviewCustomEditorDocument(resource, viewType, cancellation);
		return instantiationService.createInstance(MainThreadCustomEditorModel, proxy, viewType, resource, editable);
	}

	constructor(
		private readonly _proxy: extHostProtocol.ExtHostWebviewsShape,
		private readonly _viewType: string,
		private readonly _realResource: URI,
		private readonly _editable: boolean,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILabelService private readonly _labelService: ILabelService,
		@IFileService private readonly _fileService: IFileService,
		@IUndoRedoService private readonly _undoService: IUndoRedoService,
	) {
		super();

		if (_editable) {
			this._register(workingCopyService.registerWorkingCopy(this));
		}
	}

	dispose() {
		if (this._editable) {
			this._undoService.removeElements(this._realResource);
		}
		this._proxy.$disposeWebviewCustomEditorDocument(this._realResource, this._viewType);
		super.dispose();
	}

	//#region IWorkingCopy

	public get resource() {
		// Make sure each custom editor has a unique resource for backup and edits
		return URI.from({
			scheme: customDocumentFileScheme,
			authority: this._viewType,
			path: this._realResource.path,
			query: JSON.stringify(this._realResource.toJSON())
		});
	}

	public get name() {
		return basename(this._labelService.getUriLabel(this._realResource));
	}

	public get capabilities(): WorkingCopyCapabilities {
		return 0;
	}

	public isDirty(): boolean {
		return this._edits.length > 0 && this._savePoint !== this._currentEditIndex;
	}

	private readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	//#endregion

	public isReadonly() {
		return this._editable;
	}

	public get viewType() {
		return this._viewType;
	}

	public pushEdit(editId: number, label: string | undefined) {
		if (!this._editable) {
			throw new Error('Document is not editable');
		}

		this.change(() => {
			this.spliceEdits(editId);
			this._currentEditIndex = this._edits.length - 1;
		});

		this._undoService.pushElement({
			type: UndoRedoElementType.Resource,
			resource: this._realResource,
			label: label ?? localize('defaultEditLabel', "Edit"),
			undo: () => this.undo(),
			redo: () => this.redo(),
		});
	}

	private async undo(): Promise<void> {
		if (!this._editable) {
			return;
		}

		if (this._currentEditIndex < 0) {
			// nothing to undo
			return;
		}

		const undoneEdit = this._edits[this._currentEditIndex];
		await this._proxy.$undo(this._realResource, this.viewType, undoneEdit);

		this.change(() => {
			--this._currentEditIndex;
		});
	}

	private async redo(): Promise<void> {
		if (!this._editable) {
			return;
		}

		if (this._currentEditIndex >= this._edits.length - 1) {
			// nothing to redo
			return;
		}

		const redoneEdit = this._edits[this._currentEditIndex + 1];
		await this._proxy.$redo(this._realResource, this.viewType, redoneEdit);
		this.change(() => {
			++this._currentEditIndex;
		});
	}

	private spliceEdits(editToInsert?: number) {
		const start = this._currentEditIndex + 1;
		const toRemove = this._edits.length - this._currentEditIndex;

		const removedEdits = typeof editToInsert === 'number'
			? this._edits.splice(start, toRemove, editToInsert)
			: this._edits.splice(start, toRemove);

		if (removedEdits.length) {
			this._proxy.$disposeEdits(this._realResource, this._viewType, removedEdits);
		}
	}

	private change(makeEdit: () => void): void {
		const wasDirty = this.isDirty();
		makeEdit();
		this._onDidChangeContent.fire();

		if (this.isDirty() !== wasDirty) {
			this._onDidChangeDirty.fire();
		}
	}

	public async revert(_options?: IRevertOptions) {
		if (!this._editable) {
			return;
		}

		if (this._currentEditIndex === this._savePoint) {
			return;
		}

		let editsToUndo: number[] = [];
		let editsToRedo: number[] = [];

		if (this._currentEditIndex >= this._savePoint) {
			editsToUndo = this._edits.slice(this._savePoint, this._currentEditIndex).reverse();
		} else if (this._currentEditIndex < this._savePoint) {
			editsToRedo = this._edits.slice(this._currentEditIndex, this._savePoint);
		}

		this._proxy.$revert(this._realResource, this.viewType, { undoneEdits: editsToUndo, redoneEdits: editsToRedo });
		this.change(() => {
			this._currentEditIndex = this._savePoint;
			this.spliceEdits();
		});
	}

	public async save(_options?: ISaveOptions): Promise<boolean> {
		if (!this._editable) {
			return false;
		}
		await createCancelablePromise(token => this._proxy.$onSave(this._realResource, this.viewType, token));
		this.change(() => {
			this._savePoint = this._currentEditIndex;
		});
		return true;
	}

	public async saveAs(resource: URI, targetResource: URI, _options?: ISaveOptions): Promise<boolean> {
		if (this._editable) {
			await this._proxy.$onSaveAs(this._realResource, this.viewType, targetResource);
			this.change(() => {
				this._savePoint = this._currentEditIndex;
			});
			return true;
		} else {
			// Since the editor is readonly, just copy the file over
			await this._fileService.copy(resource, targetResource, false /* overwrite */);
			return true;
		}
	}

	public async backup(): Promise<IWorkingCopyBackup> {
		const backupData: IWorkingCopyBackup = {
			meta: {
				viewType: this.viewType,
			}
		};

		if (!this._editable) {
			return backupData;
		}

		if (this._hotExitState.type === HotExitState.Type.Pending) {
			this._hotExitState.operation.cancel();
		}

		const pendingState = new HotExitState.Pending(
			createCancelablePromise(token =>
				this._proxy.$backup(this._realResource.toJSON(), this.viewType, token)));
		this._hotExitState = pendingState;

		try {
			await pendingState.operation;
			// Make sure state has not changed in the meantime
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.Allowed;
			}
		} catch (e) {
			// Make sure state has not changed in the meantime
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.NotAllowed;
			}
		}

		if (this._hotExitState === HotExitState.Allowed) {
			return backupData;
		}

		throw new Error('Cannot back up in this state');
	}
}
