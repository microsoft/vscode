/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { multibyteAwareBtoa } from '../../../base/common/strings.js';
import { CancelablePromise, createCancelablePromise, DeferredPromise } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IReference } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { basename } from '../../../base/common/path.js';
import { isEqual, isEqualOrParent, toLocalResource } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { FileOperation, IFileService } from '../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IUndoRedoService, UndoRedoElementType } from '../../../platform/undoRedo/common/undoRedo.js';
import { MainThreadWebviewPanels } from './mainThreadWebviewPanels.js';
import { MainThreadWebviews, reviveWebviewExtension } from './mainThreadWebviews.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { IRevertOptions, ISaveOptions } from '../../common/editor.js';
import { CustomEditorDiffInput, CustomEditorSideBySideDiffInput } from '../../contrib/customEditor/browser/customEditorDiffInput.js';
import { CustomEditorInput } from '../../contrib/customEditor/browser/customEditorInput.js';
import { CustomDocumentBackupData } from '../../contrib/customEditor/browser/customEditorInputFactory.js';
import { ICustomEditorModel, ICustomEditorService } from '../../contrib/customEditor/common/customEditor.js';
import { CustomTextEditorModel } from '../../contrib/customEditor/common/customTextEditorModel.js';
import { ExtensionKeyedWebviewOriginStore, WebviewExtensionDescription } from '../../contrib/webview/browser/webview.js';
import { WebviewInput } from '../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { EditorGroupColumn, editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IPathService } from '../../services/path/common/pathService.js';
import { ResourceWorkingCopy } from '../../services/workingCopy/common/resourceWorkingCopy.js';
import { IWorkingCopy, IWorkingCopyBackup, IWorkingCopySaveEvent, NO_TYPE_ID, WorkingCopyCapabilities } from '../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyFileService, WorkingCopyFileEvent } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';

const enum CustomEditorModelType {
	Custom,
	Text,
}

type CustomEditorWebviewInput = CustomEditorInput | CustomEditorDiffInput | CustomEditorSideBySideDiffInput;

interface CustomEditorDiffInitData {
	readonly title: string;
	readonly contentOptions: extHostProtocol.IWebviewContentOptions;
	readonly options: extHostProtocol.IWebviewPanelOptions;
	readonly active: boolean;
}

interface CustomEditorSideBySideDiffData {
	readonly handle: extHostProtocol.WebviewHandle;
	readonly initData: CustomEditorDiffInitData;
}

interface PendingCustomEditorSideBySideDiffResolution {
	original?: CustomEditorSideBySideDiffData;
	modified?: CustomEditorSideBySideDiffData;
	started?: boolean;
	readonly promise: DeferredPromise<void>;
	readonly cancellation: CancellationTokenSource;
	readonly disposables: DisposableStore;
}

export class MainThreadCustomEditors extends Disposable implements extHostProtocol.MainThreadCustomEditorsShape {

	private readonly _proxyCustomEditors: extHostProtocol.ExtHostCustomEditorsShape;

	private readonly _editorProviders = this._register(new DisposableMap<string>());

	private readonly _editorRenameBackups = new Map<string, CustomDocumentBackupData>();
	private readonly _pendingSideBySideDiffResolutions = new Map<string, PendingCustomEditorSideBySideDiffResolution>();

	private readonly _webviewOriginStore: ExtensionKeyedWebviewOriginStore;

	constructor(
		context: IExtHostContext,
		private readonly mainThreadWebview: MainThreadWebviews,
		private readonly mainThreadWebviewPanels: MainThreadWebviewPanels,
		@IExtensionService extensionService: IExtensionService,
		@IStorageService storageService: IStorageService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@ICustomEditorService private readonly _customEditorService: ICustomEditorService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();

		this._webviewOriginStore = new ExtensionKeyedWebviewOriginStore('mainThreadCustomEditors.origins', storageService);

		this._proxyCustomEditors = context.getProxy(extHostProtocol.ExtHostContext.ExtHostCustomEditors);

		this._register(workingCopyFileService.registerWorkingCopyProvider((editorResource) => {
			const matchedWorkingCopies: IWorkingCopy[] = [];

			for (const workingCopy of workingCopyService.workingCopies) {
				if (workingCopy instanceof MainThreadCustomEditorModel) {
					if (isEqualOrParent(editorResource, workingCopy.editorResource)) {
						matchedWorkingCopies.push(workingCopy);
					}
				}
			}
			return matchedWorkingCopies;
		}));

		// This reviver's only job is to activate custom editor extensions.
		this._register(_webviewWorkbenchService.registerResolver({
			canResolve: (webview: WebviewInput) => {
				if (webview instanceof CustomEditorInput || webview instanceof CustomEditorDiffInput || webview instanceof CustomEditorSideBySideDiffInput) {
					extensionService.activateByEvent(`onCustomEditor:${webview.viewType}`);
				}
				return false;
			},
			resolveWebview: () => { throw new Error('not implemented'); }
		}));

		// Working copy operations
		this._register(workingCopyFileService.onWillRunWorkingCopyFileOperation(async e => this.onWillRunWorkingCopyFileOperation(e)));
	}

	public $registerTextEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: extHostProtocol.IWebviewPanelOptions, capabilities: extHostProtocol.CustomEditorProviderCapabilities, serializeBuffersForPostMessage: boolean): void {
		this.registerEditorProvider(
			CustomEditorModelType.Text,
			reviveWebviewExtension(extensionData),
			viewType,
			options,
			capabilities,
			true,
			serializeBuffersForPostMessage
		);
	}

	public $registerCustomEditorProvider(extensionData: extHostProtocol.WebviewExtensionDescription, viewType: string, options: extHostProtocol.IWebviewPanelOptions, capabilities: extHostProtocol.CustomEditorProviderCapabilities, supportsMultipleEditorsPerDocument: boolean, serializeBuffersForPostMessage: boolean): void {
		this.registerEditorProvider(
			CustomEditorModelType.Custom,
			reviveWebviewExtension(extensionData),
			viewType,
			options,
			capabilities,
			supportsMultipleEditorsPerDocument,
			serializeBuffersForPostMessage
		);
	}

	private registerEditorProvider(
		modelType: CustomEditorModelType,
		extension: WebviewExtensionDescription,
		viewType: string,
		options: extHostProtocol.IWebviewPanelOptions,
		capabilities: extHostProtocol.CustomEditorProviderCapabilities,
		supportsMultipleEditorsPerDocument: boolean,
		serializeBuffersForPostMessage: boolean,
	): void {
		if (this._editorProviders.has(viewType)) {
			throw new Error(`Provider for ${viewType} already registered`);
		}

		const disposables = new DisposableStore();

		disposables.add(this._customEditorService.registerCustomEditorCapabilities(viewType, {
			supportsMultipleEditorsPerDocument,
			isTextEditor: modelType === CustomEditorModelType.Text,
			supportsInlineDiff: capabilities.supportsInlineDiff,
			supportsSideBySideDiff: capabilities.supportsSideBySideDiff,
		}));

		disposables.add(this._webviewWorkbenchService.registerResolver({
			canResolve: (webviewInput) => {
				return (webviewInput instanceof CustomEditorInput || webviewInput instanceof CustomEditorDiffInput || webviewInput instanceof CustomEditorSideBySideDiffInput) && webviewInput.viewType === viewType;
			},
			resolveWebview: async (webviewInput: WebviewInput, cancellation: CancellationToken) => {
				if (!(webviewInput instanceof CustomEditorInput || webviewInput instanceof CustomEditorDiffInput || webviewInput instanceof CustomEditorSideBySideDiffInput)) {
					return;
				}

				const handle = generateUuid();

				webviewInput.webview.origin = this._webviewOriginStore.getOrigin(viewType, extension.id);

				this.mainThreadWebviewPanels.addWebviewInput(handle, webviewInput, { serializeBuffersForPostMessage });
				webviewInput.webview.options = options;
				webviewInput.webview.extension = extension;

				const resource = webviewInput instanceof CustomEditorDiffInput ? webviewInput.modifiedResource : webviewInput.resource;

				// If there's an old resource this was a move and we must resolve the backup at the same time as the webview
				// This is because the backup must be ready upon model creation, and the input resolve method comes after
				let backupId: string | undefined;
				if (webviewInput instanceof CustomEditorInput) {
					backupId = webviewInput.backupId;
					if (webviewInput.oldResource && !webviewInput.backupId) {
						const backup = this._editorRenameBackups.get(webviewInput.oldResource.toString());
						backupId = backup?.backupId;
						this._editorRenameBackups.delete(webviewInput.oldResource.toString());
					}
				}

				let modelRef: IReference<ICustomEditorModel> | undefined;
				const additionalModelRefs = new DisposableStore();
				try {
					modelRef = await this.getOrCreateCustomEditorModel(modelType, resource, viewType, { backupId }, cancellation);
					if (webviewInput instanceof CustomEditorDiffInput && !isEqual(webviewInput.originalResource, resource)) {
						additionalModelRefs.add(await this.getOrCreateCustomEditorModel(modelType, webviewInput.originalResource, viewType, {}, cancellation));
					} else if (modelType === CustomEditorModelType.Text && webviewInput instanceof CustomEditorSideBySideDiffInput) {
						const otherResource = webviewInput.side === 'original' ? webviewInput.modifiedResource : webviewInput.originalResource;
						if (!isEqual(otherResource, resource)) {
							additionalModelRefs.add(await this.getOrCreateCustomEditorModel(modelType, otherResource, viewType, {}, cancellation));
						}
					}
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
					additionalModelRefs.dispose();
					modelRef?.dispose();
					return;
				}

				if (!modelRef) {
					additionalModelRefs.dispose();
					return;
				}
				let resolvedModelRef = modelRef;

				if (cancellation.isCancellationRequested) {
					additionalModelRefs.dispose();
					resolvedModelRef.dispose();
					return;
				}

				const disposeModelRefs = () => {
					additionalModelRefs.dispose();

					// If the model is still dirty, make sure we have time to save it
					if (resolvedModelRef.object.isDirty()) {
						const sub = resolvedModelRef.object.onDidChangeDirty(() => {
							if (!resolvedModelRef.object.isDirty()) {
								sub.dispose();
								resolvedModelRef.dispose();
							}
						});
						return;
					}

					resolvedModelRef.dispose();
				};

				const disposeSub = webviewInput.webview.onDidDispose(() => {
					disposeSub.dispose();
					inputDisposeSub.dispose();
					disposeModelRefs();
				});

				// Also listen for when the input is disposed (e.g., during SaveAs when the webview is transferred to a new editor).
				// In this case, webview.onDidDispose won't fire because the webview is reused.
				const inputDisposeSub = webviewInput.onWillDispose(() => {
					inputDisposeSub.dispose();
					disposeSub.dispose();
					disposeModelRefs();
				});

				if (webviewInput instanceof CustomEditorInput && capabilities.supportsMove) {
					webviewInput.onMove(async (newResource: URI) => {
						const oldModel = resolvedModelRef;
						resolvedModelRef = await this.getOrCreateCustomEditorModel(modelType, newResource, viewType, {}, CancellationToken.None);
						this._proxyCustomEditors.$onMoveCustomEditor(handle, newResource, viewType);
						oldModel.dispose();
					});
				}

				try {
					const initData = {
						title: webviewInput.getTitle(),
						contentOptions: webviewInput.webview.contentOptions,
						options: webviewInput.webview.options,
						active: webviewInput === this._editorService.activeEditor,
					};
					const position = editorGroupToColumn(this._editorGroupService, webviewInput.group || 0);

					if (webviewInput instanceof CustomEditorDiffInput) {
						const originalResource = modelType === CustomEditorModelType.Text ? this._uriIdentityService.asCanonicalUri(webviewInput.originalResource) : webviewInput.originalResource;
						const modifiedResource = modelType === CustomEditorModelType.Text ? this._uriIdentityService.asCanonicalUri(webviewInput.modifiedResource) : webviewInput.modifiedResource;
						await this._proxyCustomEditors.$resolveCustomEditorInlineDiff(
							originalResource,
							modifiedResource,
							handle,
							viewType,
							initData,
							position,
							cancellation
						);
					} else if (webviewInput instanceof CustomEditorSideBySideDiffInput) {
						await this.resolveCustomEditorSideBySideDiff(modelType, webviewInput, handle, viewType, initData, position, cancellation);
					} else {
						const actualResource = modelType === CustomEditorModelType.Text ? this._uriIdentityService.asCanonicalUri(resource) : resource;
						await this._proxyCustomEditors.$resolveCustomEditor(actualResource, handle, viewType, initData, position, cancellation);
					}
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
					additionalModelRefs.dispose();
					resolvedModelRef.dispose();
					return;
				}
			}
		}));

		this._editorProviders.set(viewType, disposables);
	}

	private resolveCustomEditorSideBySideDiff(
		modelType: CustomEditorModelType,
		webviewInput: CustomEditorSideBySideDiffInput,
		handle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: CustomEditorDiffInitData,
		position: EditorGroupColumn,
		cancellation: CancellationToken,
	): Promise<void> {
		let pending = this._pendingSideBySideDiffResolutions.get(webviewInput.diffId);
		if (!pending) {
			pending = {
				promise: new DeferredPromise<void>(),
				cancellation: new CancellationTokenSource(),
				disposables: new DisposableStore(),
			};
			this._pendingSideBySideDiffResolutions.set(webviewInput.diffId, pending);
		}

		const cleanup = () => {
			this._pendingSideBySideDiffResolutions.delete(webviewInput.diffId);
			pending.disposables.dispose();
			pending.cancellation.dispose();
		};

		pending.disposables.add(cancellation.onCancellationRequested(() => {
			pending.cancellation.cancel();
			if (!pending.started) {
				pending.promise.cancel();
				cleanup();
			}
		}));

		pending[webviewInput.side] = { handle, initData };

		if (pending.original && pending.modified && !pending.started) {
			pending.started = true;
			pending.promise.settleWith((async () => {
				try {
					const originalResource = modelType === CustomEditorModelType.Text ? this._uriIdentityService.asCanonicalUri(webviewInput.originalResource) : webviewInput.originalResource;
					const modifiedResource = modelType === CustomEditorModelType.Text ? this._uriIdentityService.asCanonicalUri(webviewInput.modifiedResource) : webviewInput.modifiedResource;
					await this._proxyCustomEditors.$resolveCustomEditorSideBySideDiff(
						originalResource,
						modifiedResource,
						{
							original: pending.original!.handle,
							modified: pending.modified!.handle,
						},
						viewType,
						{
							original: pending.original!.initData,
							modified: pending.modified!.initData,
						},
						position,
						pending.cancellation.token
					);
				} finally {
					cleanup();
				}
			})());
		}

		return pending.promise.p;
	}

	public $unregisterEditorProvider(viewType: string): void {
		if (!this._editorProviders.has(viewType)) {
			throw new Error(`No provider for ${viewType} registered`);
		}

		this._editorProviders.deleteAndDispose(viewType);

		this._customEditorService.models.disposeAllModelsForView(viewType);
	}

	private async getOrCreateCustomEditorModel(
		modelType: CustomEditorModelType,
		resource: URI,
		viewType: string,
		options: { backupId?: string },
		cancellation: CancellationToken,
	): Promise<IReference<ICustomEditorModel>> {
		const existingModel = this._customEditorService.models.tryRetain(resource, viewType);
		if (existingModel) {
			return existingModel;
		}

		switch (modelType) {
			case CustomEditorModelType.Text:
				{
					const model = CustomTextEditorModel.create(this._instantiationService, viewType, resource);
					return this._customEditorService.models.add(resource, viewType, model);
				}
			case CustomEditorModelType.Custom:
				{
					const model = MainThreadCustomEditorModel.create(this._instantiationService, this._proxyCustomEditors, viewType, resource, options, () => {
						return Array.from(this.mainThreadWebviewPanels.webviewInputs)
							.filter(editor =>
								(editor instanceof CustomEditorInput && isEqual(editor.resource, resource))
								|| (editor instanceof CustomEditorDiffInput && (isEqual(editor.originalResource, resource) || isEqual(editor.modifiedResource, resource)))
								|| (editor instanceof CustomEditorSideBySideDiffInput && isEqual(editor.resource, resource))) as CustomEditorWebviewInput[];
					}, cancellation);
					return this._customEditorService.models.add(resource, viewType, model);
				}
		}
	}

	public async $onDidEdit(resourceComponents: UriComponents, viewType: string, editId: number, label: string | undefined): Promise<void> {
		const model = await this.getCustomEditorModel(resourceComponents, viewType);
		model.pushEdit(editId, label);
	}

	public async $onContentChange(resourceComponents: UriComponents, viewType: string): Promise<void> {
		const model = await this.getCustomEditorModel(resourceComponents, viewType);
		model.changeContent();
	}

	private async getCustomEditorModel(resourceComponents: UriComponents, viewType: string) {
		const resource = URI.revive(resourceComponents);
		const model = await this._customEditorService.models.get(resource, viewType);
		if (!model || !(model instanceof MainThreadCustomEditorModel)) {
			throw new Error('Could not find model for webview editor');
		}
		return model;
	}

	//#region Working Copy
	private async onWillRunWorkingCopyFileOperation(e: WorkingCopyFileEvent) {
		if (e.operation !== FileOperation.MOVE) {
			return;
		}
		e.waitUntil((async () => {
			const models = [];
			for (const file of e.files) {
				if (file.source) {
					models.push(...(await this._customEditorService.models.getAllModels(file.source)));
				}
			}
			for (const model of models) {
				if (model instanceof MainThreadCustomEditorModel && model.isDirty()) {
					const workingCopy = await model.backup(CancellationToken.None);
					if (workingCopy.meta) {
						// This cast is safe because we do an instanceof check above and a custom document backup data is always returned
						this._editorRenameBackups.set(model.editorResource.toString(), workingCopy.meta as CustomDocumentBackupData);
					}
				}
			}
		})());
	}
	//#endregion
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
			public readonly operation: CancelablePromise<string>,
		) { }
	}

	export type State = typeof Allowed | typeof NotAllowed | Pending;
}


class MainThreadCustomEditorModel extends ResourceWorkingCopy implements ICustomEditorModel {

	private _fromBackup: boolean = false;
	private _hotExitState: HotExitState.State = HotExitState.Allowed;
	private _backupId: string | undefined;

	private _currentEditIndex: number = -1;
	private _savePoint: number = -1;
	private readonly _edits: Array<number> = [];
	private _isDirtyFromContentChange: boolean;

	private _ongoingSave?: CancelablePromise<void>;

	// TODO@mjbvz consider to enable a `typeId` that is specific for custom
	// editors. Using a distinct `typeId` allows the working copy to have
	// any resource (including file based resources) even if other working
	// copies exist with the same resource.
	//
	// IMPORTANT: changing the `typeId` has an impact on backups for this
	// working copy. Any value that is not the empty string will be used
	// as seed to the backup. Only change the `typeId` if you have implemented
	// a fallback solution to resolve any existing backups that do not have
	// this seed.
	readonly typeId = NO_TYPE_ID;

	public static async create(
		instantiationService: IInstantiationService,
		proxy: extHostProtocol.ExtHostCustomEditorsShape,
		viewType: string,
		resource: URI,
		options: { backupId?: string },
		getEditors: () => CustomEditorWebviewInput[],
		cancellation: CancellationToken,
	): Promise<MainThreadCustomEditorModel> {
		const editors = getEditors();
		let untitledDocumentData: VSBuffer | undefined;
		const primaryCustomEditorInput = editors.find(editor => editor instanceof CustomEditorInput);
		if (primaryCustomEditorInput) {
			untitledDocumentData = primaryCustomEditorInput.untitledDocumentData;
		}
		const { editable } = await proxy.$createCustomDocument(resource, viewType, options.backupId, untitledDocumentData, cancellation);
		return instantiationService.createInstance(MainThreadCustomEditorModel, proxy, viewType, resource, !!options.backupId, editable, !!untitledDocumentData, getEditors);
	}

	constructor(
		private readonly _proxy: extHostProtocol.ExtHostCustomEditorsShape,
		private readonly _viewType: string,
		private readonly _editorResource: URI,
		fromBackup: boolean,
		private readonly _editable: boolean,
		startDirty: boolean,
		private readonly _getEditors: () => CustomEditorWebviewInput[],
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IFileService fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@IUndoRedoService private readonly _undoService: IUndoRedoService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IPathService private readonly _pathService: IPathService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super(MainThreadCustomEditorModel.toWorkingCopyResource(_viewType, _editorResource), fileService);

		this._fromBackup = fromBackup;

		// Normally means we're re-opening an untitled file (set this before registering the working copy
		// so that dirty state is correct when first queried).
		this._isDirtyFromContentChange = startDirty;

		if (_editable) {
			this._register(workingCopyService.registerWorkingCopy(this));

			this._register(extensionService.onWillStop(e => {
				e.veto(true, localize('vetoExtHostRestart', "An extension provided editor for '{0}' is still open that would close otherwise.", this.name));
			}));
		}
	}

	get editorResource() {
		return this._editorResource;
	}

	override dispose() {
		if (this._editable) {
			this._undoService.removeElements(this._editorResource);
		}

		this._proxy.$disposeCustomDocument(this._editorResource, this._viewType);

		super.dispose();
	}

	//#region IWorkingCopy

	// Make sure each custom editor has a unique resource for backup and edits
	private static toWorkingCopyResource(viewType: string, resource: URI) {
		const authority = viewType.replace(/[^a-z0-9\-_]/gi, '-');
		const path = `/${multibyteAwareBtoa(resource.with({ query: null, fragment: null }).toString(true))}`;
		return URI.from({
			scheme: Schemas.vscodeCustomEditor,
			authority: authority,
			path: path,
			query: JSON.stringify(resource.toJSON()),
		});
	}

	public get name() {
		return basename(this._labelService.getUriLabel(this._editorResource));
	}

	public get capabilities(): WorkingCopyCapabilities {
		return this.isUntitled() ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
	}

	public isDirty(): boolean {
		if (this._isDirtyFromContentChange) {
			return true;
		}
		if (this._edits.length > 0) {
			return this._savePoint !== this._currentEditIndex;
		}
		return this._fromBackup;
	}

	private isUntitled() {
		return this._editorResource.scheme === Schemas.untitled;
	}

	private readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	private readonly _onDidSave: Emitter<IWorkingCopySaveEvent> = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave: Event<IWorkingCopySaveEvent> = this._onDidSave.event;

	readonly onDidChangeReadonly = Event.None;

	//#endregion

	public isReadonly(): boolean {
		return !this._editable;
	}

	public get viewType() {
		return this._viewType;
	}

	public get backupId() {
		return this._backupId;
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
			resource: this._editorResource,
			label: label ?? localize('defaultEditLabel', "Edit"),
			code: 'undoredo.customEditorEdit',
			undo: () => this.undo(),
			redo: () => this.redo(),
		});
	}

	public changeContent() {
		this.change(() => {
			this._isDirtyFromContentChange = true;
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
		this.change(() => {
			--this._currentEditIndex;
		});
		await this._proxy.$undo(this._editorResource, this.viewType, undoneEdit, this.isDirty());
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
		this.change(() => {
			++this._currentEditIndex;
		});
		await this._proxy.$redo(this._editorResource, this.viewType, redoneEdit, this.isDirty());
	}

	private spliceEdits(editToInsert?: number) {
		const start = this._currentEditIndex + 1;
		const toRemove = this._edits.length - this._currentEditIndex;

		const removedEdits = typeof editToInsert === 'number'
			? this._edits.splice(start, toRemove, editToInsert)
			: this._edits.splice(start, toRemove);

		if (removedEdits.length) {
			this._proxy.$disposeEdits(this._editorResource, this._viewType, removedEdits);
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

	public async revert(options?: IRevertOptions) {
		if (!this._editable) {
			return;
		}

		if (this._currentEditIndex === this._savePoint && !this._isDirtyFromContentChange && !this._fromBackup) {
			return;
		}

		if (!options?.soft) {
			this._proxy.$revert(this._editorResource, this.viewType, CancellationToken.None);
		}

		this.change(() => {
			this._isDirtyFromContentChange = false;
			this._fromBackup = false;
			this._currentEditIndex = this._savePoint;
			this.spliceEdits();
		});
	}

	public async save(options?: ISaveOptions): Promise<boolean> {
		const result = !!await this.saveCustomEditor(options);

		// Emit Save Event
		if (result) {
			this._onDidSave.fire({ reason: options?.reason, source: options?.source });
		}

		return result;
	}

	public async saveCustomEditor(options?: ISaveOptions): Promise<URI | undefined> {
		if (!this._editable) {
			return undefined;
		}

		if (this.isUntitled()) {
			const targetUri = await this.suggestUntitledSavePath(options);
			if (!targetUri) {
				return undefined;
			}

			await this.saveCustomEditorAs(this._editorResource, targetUri, options);
			return targetUri;
		}

		const savePromise = createCancelablePromise(token => this._proxy.$onSave(this._editorResource, this.viewType, token));
		this._ongoingSave?.cancel();
		this._ongoingSave = savePromise;

		try {
			await savePromise;

			if (this._ongoingSave === savePromise) { // Make sure we are still doing the same save
				this.change(() => {
					this._isDirtyFromContentChange = false;
					this._savePoint = this._currentEditIndex;
					this._fromBackup = false;
				});
			}
		} finally {
			if (this._ongoingSave === savePromise) { // Make sure we are still doing the same save
				this._ongoingSave = undefined;
			}
		}

		return this._editorResource;
	}

	private suggestUntitledSavePath(options: ISaveOptions | undefined): Promise<URI | undefined> {
		if (!this.isUntitled()) {
			throw new Error('Resource is not untitled');
		}

		const remoteAuthority = this._environmentService.remoteAuthority;
		const localResource = toLocalResource(this._editorResource, remoteAuthority, this._pathService.defaultUriScheme);

		return this._fileDialogService.pickFileToSave(localResource, options?.availableFileSystems);
	}

	public async saveCustomEditorAs(resource: URI, targetResource: URI, _options?: ISaveOptions): Promise<boolean> {
		if (this._editable) {
			// TODO: handle cancellation
			await createCancelablePromise(token => this._proxy.$onSaveAs(this._editorResource, this.viewType, targetResource, token));
			this.change(() => {
				this._isDirtyFromContentChange = false;
				this._savePoint = this._currentEditIndex;
				this._fromBackup = false;
			});
			return true;
		} else {
			// Since the editor is readonly, just copy the file over
			await this.fileService.copy(resource, targetResource, false /* overwrite */);
			return true;
		}
	}

	public get canHotExit() { return typeof this._backupId === 'string' && this._hotExitState.type === HotExitState.Type.Allowed; }

	public async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
		const editors = this._getEditors();
		if (!editors.length) {
			throw new Error('No editors found for resource, cannot back up');
		}
		const primaryEditor = editors[0];

		const backupMeta: CustomDocumentBackupData = {
			viewType: this.viewType,
			editorResource: this._editorResource,
			customTitle: primaryEditor.getWebviewTitle(),
			iconPath: primaryEditor.iconPath,
			backupId: '',
			extension: primaryEditor.extension ? {
				id: primaryEditor.extension.id.value,
				location: primaryEditor.extension.location!,
			} : undefined,
			webview: {
				origin: primaryEditor.webview.origin,
				options: primaryEditor.webview.options,
				state: primaryEditor.webview.state,
			}
		};

		const backupData: IWorkingCopyBackup = {
			meta: backupMeta
		};

		if (!this._editable) {
			return backupData;
		}

		if (this._hotExitState.type === HotExitState.Type.Pending) {
			this._hotExitState.operation.cancel();
		}

		const pendingState = new HotExitState.Pending(
			createCancelablePromise(token =>
				this._proxy.$backup(this._editorResource.toJSON(), this.viewType, token)));
		this._hotExitState = pendingState;

		token.onCancellationRequested(() => {
			pendingState.operation.cancel();
		});

		let errorMessage = '';
		try {
			const backupId = await pendingState.operation;
			// Make sure state has not changed in the meantime
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.Allowed;
				backupData.meta!.backupId = backupId;
				this._backupId = backupId;
			}
		} catch (e) {
			if (isCancellationError(e)) {
				// This is expected
				throw e;
			}

			// Otherwise it could be a real error. Make sure state has not changed in the meantime.
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.NotAllowed;
			}
			if (e.message) {
				errorMessage = e.message;
			}
		}

		if (this._hotExitState === HotExitState.Allowed) {
			return backupData;
		}

		throw new Error(`Cannot backup in this state: ${errorMessage}`);
	}
}
