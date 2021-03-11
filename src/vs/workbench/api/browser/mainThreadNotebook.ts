/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { diffMaps, diffSets } from 'vs/base/common/collections';
import { Emitter } from 'vs/base/common/event';
import { IRelativePattern } from 'vs/base/common/glob';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EditorActivation, EditorOverride } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { BoundModelReferenceCollection } from 'vs/workbench/api/browser/mainThreadDocuments';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { getNotebookEditorFromEditorPane, IActiveNotebookEditor, INotebookEditor, NotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { ICellEditOperation, ICellRange, IMainCellDto, INotebookDecorationRenderOptions, INotebookDocumentFilter, INotebookExclusiveDocumentFilter, INotebookKernel, NotebookCellsChangeType, NotebookDataDto, TransientMetadata, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { IMainNotebookController, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ExtHostContext, ExtHostNotebookShape, IExtHostContext, INotebookCellStatusBarEntryDto, INotebookDocumentsAndEditorsDelta, INotebookDocumentShowOptions, INotebookEditorAddData, INotebookModelAddedData, MainContext, MainThreadNotebookShape, NotebookEditorRevealType, NotebookExtensionDescription } from '../common/extHost.protocol';

class NotebookAndEditorState {
	static compute(before: NotebookAndEditorState | undefined, after: NotebookAndEditorState): INotebookDocumentsAndEditorsDelta {
		if (!before) {
			return {
				addedDocuments: [...after.documents].map(NotebookAndEditorState._asModelAddData),
				addedEditors: [...after.textEditors.values()].map(NotebookAndEditorState._asEditorAddData),
				visibleEditors: [...after.visibleEditors].map(editor => editor[0])
			};
		}
		const documentDelta = diffSets(before.documents, after.documents);
		const editorDelta = diffMaps(before.textEditors, after.textEditors);
		const addedAPIEditors = editorDelta.added.map(NotebookAndEditorState._asEditorAddData);

		const removedAPIEditors = editorDelta.removed.map(removed => removed.getId());
		const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;
		const visibleEditorDelta = diffMaps(before.visibleEditors, after.visibleEditors);

		return {
			addedDocuments: documentDelta.added.map(NotebookAndEditorState._asModelAddData),
			removedDocuments: documentDelta.removed.map(e => e.uri),
			addedEditors: addedAPIEditors,
			removedEditors: removedAPIEditors,
			newActiveEditor: newActiveEditor,
			visibleEditors: visibleEditorDelta.added.length === 0 && visibleEditorDelta.removed.length === 0
				? undefined
				: [...after.visibleEditors].map(editor => editor[0])
		};
	}

	constructor(
		readonly documents: Set<NotebookTextModel>,
		readonly textEditors: Map<string, IActiveNotebookEditor>,
		readonly activeEditor: string | null | undefined,
		readonly visibleEditors: Map<string, IActiveNotebookEditor>
	) {
		//
	}

	private static _asModelAddData(e: NotebookTextModel): INotebookModelAddedData {
		return {
			viewType: e.viewType,
			uri: e.uri,
			metadata: e.metadata,
			versionId: e.versionId,
			cells: e.cells.map(cell => ({
				handle: cell.handle,
				uri: cell.uri,
				source: cell.textBuffer.getLinesContent(),
				eol: cell.textBuffer.getEOL(),
				language: cell.language,
				cellKind: cell.cellKind,
				outputs: cell.outputs,
				metadata: cell.metadata
			}))
		};
	}

	private static _asEditorAddData(add: IActiveNotebookEditor): INotebookEditorAddData {
		return {
			id: add.getId(),
			documentUri: add.viewModel.uri,
			selections: add.getSelections(),
			visibleRanges: add.visibleRanges,
			viewColumn: undefined
		};
	}
}

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks implements MainThreadNotebookShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostNotebookShape;
	private readonly _notebookProviders = new Map<string, { controller: IMainNotebookController, disposable: IDisposable }>();
	private readonly _notebookSerializer = new Map<number, IDisposable>();
	private readonly _notebookKernelProviders = new Map<number, { extension: NotebookExtensionDescription, emitter: Emitter<URI | undefined>, provider: IDisposable }>();
	private readonly _editorEventListenersMapping = new Map<string, DisposableStore>();
	private readonly _documentEventListenersMapping = new ResourceMap<DisposableStore>();
	private readonly _cellStatusBarEntries = new Map<number, IDisposable>();
	private readonly _modelReferenceCollection: BoundModelReferenceCollection;

	private _currentState?: NotebookAndEditorState;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILogService private readonly _logService: ILogService,
		@INotebookCellStatusBarService private readonly _cellStatusBarService: INotebookCellStatusBarService,
		@INotebookEditorModelResolverService private readonly _notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
		this._modelReferenceCollection = new BoundModelReferenceCollection(this._uriIdentityService.extUri);
		this._registerListeners();
	}

	dispose(): void {
		this._disposables.dispose();

		this._modelReferenceCollection.dispose();

		// remove all notebook providers
		for (const item of this._notebookProviders.values()) {
			item.disposable.dispose();
		}

		// remove all kernel providers
		for (const item of this._notebookKernelProviders.values()) {
			item.emitter.dispose();
			item.provider.dispose();
		}
		dispose(this._notebookSerializer.values());
		dispose(this._editorEventListenersMapping.values());
		dispose(this._documentEventListenersMapping.values());
		dispose(this._cellStatusBarEntries.values());
	}

	async $tryApplyEdits(_viewType: string, resource: UriComponents, modelVersionId: number, cellEdits: ICellEditOperation[]): Promise<boolean> {
		const textModel = this._notebookService.getNotebookTextModel(URI.from(resource));
		if (!textModel) {
			return false;
		}
		if (textModel.versionId !== modelVersionId) {
			return false;
		}
		return textModel.applyEdits(cellEdits, true, undefined, () => undefined, undefined);
	}

	private _registerListeners(): void {

		// forward changes to dirty state
		// todo@rebornix todo@mjbvz this seem way too complicated... is there an easy way to
		// the actual resource from a working copy?
		this._disposables.add(this._workingCopyService.onDidChangeDirty(e => {
			if (e.resource.scheme !== Schemas.vscodeNotebook) {
				return;
			}
			for (const notebook of this._notebookService.getNotebookTextModels()) {
				if (isEqual(notebook.uri.with({ scheme: Schemas.vscodeNotebook }), e.resource)) {
					this._proxy.$acceptDirtyStateChanged(notebook.uri, e.isDirty());
					break;
				}
			}
		}));


		this._disposables.add(this._editorService.onDidActiveEditorChange(e => {
			this._updateState();
		}));

		this._disposables.add(this._editorService.onDidVisibleEditorsChange(e => {
			if (this._notebookProviders.size > 0) { // TODO@rebornix propably wrong, what about providers from another host
				if (!this._currentState) {
					// no current state means we didn't even create editors in ext host yet.
					return;
				}

				// we can't simply update visibleEditors as we need to check if we should create editors first.
				this._updateState();
			}
		}));

		const handleNotebookEditorAdded = (editor: INotebookEditor) => {
			if (this._editorEventListenersMapping.has(editor.getId())) {
				//todo@jrieken a bug when this happens?
				return;
			}
			const disposableStore = new DisposableStore();
			disposableStore.add(editor.onDidChangeVisibleRanges(() => {
				this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { visibleRanges: { ranges: editor.visibleRanges } });
			}));

			disposableStore.add(editor.onDidChangeSelection(() => {
				this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { selections: { selections: editor.getSelections() } });
			}));

			disposableStore.add(editor.onDidChangeKernel(() => {
				if (!editor.hasModel()) {
					return;
				}
				this._proxy.$acceptNotebookActiveKernelChange({
					uri: editor.viewModel.uri,
					providerHandle: editor.activeKernel?.providerHandle,
					kernelFriendlyId: editor.activeKernel?.friendlyId
				});
			}));

			disposableStore.add(editor.onDidChangeModel(() => this._updateState()));
			disposableStore.add(editor.onDidFocusEditorWidget(() => this._updateState(editor)));

			this._editorEventListenersMapping.set(editor.getId(), disposableStore);

			const activeNotebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			this._updateState(activeNotebookEditor);
		};

		this._notebookEditorService.listNotebookEditors().forEach(handleNotebookEditorAdded);
		this._disposables.add(this._notebookEditorService.onDidAddNotebookEditor(handleNotebookEditorAdded));

		this._disposables.add(this._notebookEditorService.onDidRemoveNotebookEditor(editor => {
			this._editorEventListenersMapping.get(editor.getId())?.dispose();
			this._editorEventListenersMapping.delete(editor.getId());
			this._updateState();
		}));


		const cellToDto = (cell: NotebookCellTextModel): IMainCellDto => {
			return {
				handle: cell.handle,
				uri: cell.uri,
				source: cell.textBuffer.getLinesContent(),
				eol: cell.textBuffer.getEOL(),
				language: cell.language,
				cellKind: cell.cellKind,
				outputs: cell.outputs,
				metadata: cell.metadata
			};
		};


		const handleNotebookDocumentAdded = (textModel: NotebookTextModel) => {
			if (this._documentEventListenersMapping.has(textModel.uri)) {
				//todo@jrieken a bug when this happens?
				return;
			}
			const disposableStore = new DisposableStore();
			disposableStore.add(textModel!.onDidChangeContent(event => {
				const dto = event.rawEvents.map(e => {
					const data =
						e.kind === NotebookCellsChangeType.ModelChange || e.kind === NotebookCellsChangeType.Initialize
							? {
								kind: e.kind,
								versionId: event.versionId,
								changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(cell => cellToDto(cell as NotebookCellTextModel))] as [number, number, IMainCellDto[]])
							}
							: (
								e.kind === NotebookCellsChangeType.Move
									? {
										kind: e.kind,
										index: e.index,
										length: e.length,
										newIdx: e.newIdx,
										versionId: event.versionId,
										cells: e.cells.map(cell => cellToDto(cell as NotebookCellTextModel))
									}
									: e
							);

					return data;
				});

				/**
				 * TODO@rebornix, @jrieken
				 * When a document is modified, it will trigger onDidChangeContent events.
				 * The first event listener is this one, which doesn't know if the text model is dirty or not. It can ask `workingCopyService` but get the wrong result
				 * The second event listener is `NotebookEditorModel`, which will then set `isDirty` to `true`.
				 * Since `e.transient` decides if the model should be dirty or not, we will use the same logic here.
				 */
				const hasNonTransientEvent = event.rawEvents.find(e => !e.transient);
				this._proxy.$acceptModelChanged(textModel.uri, {
					rawEvents: dto,
					versionId: event.versionId
				}, !!hasNonTransientEvent);

				const hasDocumentMetadataChangeEvent = event.rawEvents.find(e => e.kind === NotebookCellsChangeType.ChangeDocumentMetadata);
				if (!!hasDocumentMetadataChangeEvent) {
					this._proxy.$acceptDocumentPropertiesChanged(textModel.uri, { metadata: textModel.metadata });
				}
			}));
			this._documentEventListenersMapping.set(textModel!.uri, disposableStore);
		};

		this._notebookService.listNotebookDocuments().forEach(handleNotebookDocumentAdded);
		this._disposables.add(this._notebookService.onDidAddNotebookDocument(document => {
			handleNotebookDocumentAdded(document);
			this._updateState();
		}));

		this._disposables.add(this._notebookService.onDidRemoveNotebookDocument(uri => {
			this._documentEventListenersMapping.get(uri)?.dispose();
			this._documentEventListenersMapping.delete(uri);
			this._updateState();
		}));

		this._disposables.add(this._notebookService.onDidChangeNotebookActiveKernel(e => {
			this._proxy.$acceptNotebookActiveKernelChange(e);
		}));

		this._disposables.add(this._notebookEditorModelResolverService.onDidSaveNotebook(e => {
			this._proxy.$acceptModelSaved(e);
		}));

		const notebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		this._updateState(notebookEditor);
	}

	private _updateState(focusedNotebookEditor?: INotebookEditor): void {

		const activeNotebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		let activeEditor = activeNotebookEditor?.hasModel() ? activeNotebookEditor.getId() : null;

		const editors = new Map<string, IActiveNotebookEditor>();
		const visibleEditorsMap = new Map<string, IActiveNotebookEditor>();

		for (const editor of this._notebookEditorService.listNotebookEditors()) {
			if (editor.hasModel()) {
				editors.set(editor.getId(), editor);
			}
		}

		this._editorService.visibleEditorPanes.forEach(editorPane => {
			const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
			if (notebookEditor?.hasModel() && editors.has(notebookEditor.getId())) {
				visibleEditorsMap.set(notebookEditor.getId(), notebookEditor);
			}
		});

		if (!activeEditor && focusedNotebookEditor?.textModel) {
			activeEditor = focusedNotebookEditor.getId();
		}

		const newState = new NotebookAndEditorState(new Set(this._notebookService.listNotebookDocuments()), editors, activeEditor, visibleEditorsMap);
		const delta = NotebookAndEditorState.compute(this._currentState, newState);

		this._currentState = newState;
		if (!this._isDeltaEmpty(delta)) {
			return this._proxy.$acceptDocumentAndEditorsDelta(delta);
		}
	}

	private _isDeltaEmpty(delta: INotebookDocumentsAndEditorsDelta): boolean {
		if (delta.addedDocuments !== undefined && delta.addedDocuments.length > 0) {
			return false;
		}
		if (delta.removedDocuments !== undefined && delta.removedDocuments.length > 0) {
			return false;
		}
		if (delta.addedEditors !== undefined && delta.addedEditors.length > 0) {
			return false;
		}
		if (delta.removedEditors !== undefined && delta.removedEditors.length > 0) {
			return false;
		}
		if (delta.visibleEditors !== undefined && delta.visibleEditors.length > 0) {
			return false;
		}
		if (delta.newActiveEditor !== undefined) {
			return false;
		}
		return true;
	}

	async $registerNotebookProvider(extension: NotebookExtensionDescription, viewType: string, options: {
		transientOutputs: boolean;
		transientMetadata: TransientMetadata;
		viewOptions?: { displayName: string; filenamePattern: (string | IRelativePattern | INotebookExclusiveDocumentFilter)[]; exclusive: boolean; };
	}): Promise<void> {
		let contentOptions = { transientOutputs: options.transientOutputs, transientMetadata: options.transientMetadata };

		const controller: IMainNotebookController = {
			get options() {
				return contentOptions;
			},
			set options(newOptions) {
				contentOptions.transientMetadata = newOptions.transientMetadata;
				contentOptions.transientOutputs = newOptions.transientOutputs;
			},
			viewOptions: options.viewOptions,
			open: async (uri: URI, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken) => {
				const data = await this._proxy.$openNotebook(viewType, uri, backupId, untitledDocumentData, token);
				return {
					data,
					transientOptions: contentOptions
				};
			},
			resolveNotebookEditor: async (viewType: string, uri: URI, editorId: string) => {
				await this._proxy.$resolveNotebookEditor(viewType, uri, editorId);
			},
			onDidReceiveMessage: (editorId: string, rendererType: string | undefined, message: unknown) => {
				this._proxy.$onDidReceiveMessage(editorId, rendererType, message);
			},
			save: async (uri: URI, token: CancellationToken) => {
				return this._proxy.$saveNotebook(viewType, uri, token);
			},
			saveAs: async (uri: URI, target: URI, token: CancellationToken) => {
				return this._proxy.$saveNotebookAs(viewType, uri, target, token);
			},
			backup: async (uri: URI, token: CancellationToken) => {
				return this._proxy.$backupNotebook(viewType, uri, token);
			}
		};

		const disposable = this._notebookService.registerNotebookController(viewType, extension, controller);
		this._notebookProviders.set(viewType, { controller, disposable });
	}

	async $updateNotebookProviderOptions(viewType: string, options?: { transientOutputs: boolean; transientMetadata: TransientMetadata; }): Promise<void> {
		const provider = this._notebookProviders.get(viewType);

		if (provider && options) {
			provider.controller.options = options;
			this._notebookService.listNotebookDocuments().forEach(document => {
				if (document.viewType === viewType) {
					document.transientOptions = provider.controller.options;
				}
			});
		}
	}

	async $unregisterNotebookProvider(viewType: string): Promise<void> {
		const entry = this._notebookProviders.get(viewType);
		if (entry) {
			entry.disposable.dispose();
			this._notebookProviders.delete(viewType);
		}
	}

	$registerNotebookSerializer(handle: number, extension: NotebookExtensionDescription, viewType: string, options: TransientOptions): void {
		const registration = this._notebookService.registerNotebookSerializer(viewType, extension, {
			options,
			dataToNotebook: (data: VSBuffer): Promise<NotebookDataDto> => {
				return this._proxy.$dataToNotebook(handle, data);
			},
			notebookToData: (data: NotebookDataDto): Promise<VSBuffer> => {
				return this._proxy.$notebookToData(handle, data);
			}
		});
		this._notebookSerializer.set(handle, registration);
	}

	$unregisterNotebookSerializer(handle: number): void {
		this._notebookSerializer.get(handle)?.dispose();
		this._notebookSerializer.delete(handle);
	}

	async $registerNotebookKernelProvider(extension: NotebookExtensionDescription, handle: number, documentFilter: INotebookDocumentFilter): Promise<void> {
		const emitter = new Emitter<URI | undefined>();
		const that = this;

		const provider = this._notebookService.registerNotebookKernelProvider({
			providerExtensionId: extension.id.value,
			providerDescription: extension.description,
			onDidChangeKernels: emitter.event,
			selector: documentFilter,
			provideKernels: async (uri: URI, token: CancellationToken): Promise<INotebookKernel[]> => {
				const result: INotebookKernel[] = [];
				const kernelsDto = await that._proxy.$provideNotebookKernels(handle, uri, token);
				for (const dto of kernelsDto) {
					result.push({
						id: dto.id,
						friendlyId: dto.friendlyId,
						label: dto.label,
						extension: dto.extension,
						extensionLocation: URI.revive(dto.extensionLocation),
						providerHandle: dto.providerHandle,
						description: dto.description,
						detail: dto.detail,
						isPreferred: dto.isPreferred,
						preloads: dto.preloads?.map(u => URI.revive(u)),
						supportedLanguages: dto.supportedLanguages,
						resolve: (uri: URI, editorId: string, token: CancellationToken): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.resolveNotebookKernel', uri.path, dto.friendlyId);
							return this._proxy.$resolveNotebookKernel(handle, editorId, uri, dto.friendlyId, token);
						},
						executeNotebookCellsRequest: (uri: URI, cellRanges: ICellRange[]): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.executeNotebookCell', uri.path, dto.friendlyId, cellRanges);
							return this._proxy.$executeNotebookKernelFromProvider(handle, uri, dto.friendlyId, cellRanges);
						},
						cancelNotebookCellExecution: (uri: URI, cellRanges: ICellRange[]): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.cancelNotebookCellExecution', uri.path, dto.friendlyId, cellRanges);
							return this._proxy.$cancelNotebookCellExecution(handle, uri, dto.friendlyId, cellRanges);
						}
					});
				}
				return result;
			}
		});
		this._notebookKernelProviders.set(handle, { extension, emitter, provider });
		return;
	}

	async $unregisterNotebookKernelProvider(handle: number): Promise<void> {
		const entry = this._notebookKernelProviders.get(handle);

		if (entry) {
			entry.emitter.dispose();
			entry.provider.dispose();
			this._notebookKernelProviders.delete(handle);
		}
	}

	$onNotebookKernelChange(handle: number, uriComponents: UriComponents): void {
		const entry = this._notebookKernelProviders.get(handle);

		entry?.emitter.fire(uriComponents ? URI.revive(uriComponents) : undefined);
	}

	async $postMessage(id: string, forRendererId: string | undefined, value: any): Promise<boolean> {
		const editor = this._notebookEditorService.getNotebookEditor(id);
		if (!editor) {
			return false;
		}
		editor.postMessage(forRendererId, value);
		return true;
	}

	async $tryRevealRange(id: string, range: ICellRange, revealType: NotebookEditorRevealType): Promise<void> {
		const editor = this._notebookEditorService.getNotebookEditor(id);
		if (!editor) {
			return;
		}
		const notebookEditor = editor as INotebookEditor;
		if (!notebookEditor.hasModel()) {
			return;
		}
		const viewModel = notebookEditor.viewModel;
		const cell = viewModel.viewCells[range.start];
		if (!cell) {
			return;
		}

		switch (revealType) {
			case NotebookEditorRevealType.Default:
				return notebookEditor.revealCellRangeInView(range);
			case NotebookEditorRevealType.InCenter:
				return notebookEditor.revealInCenter(cell);
			case NotebookEditorRevealType.InCenterIfOutsideViewport:
				return notebookEditor.revealInCenterIfOutsideViewport(cell);
			case NotebookEditorRevealType.AtTop:
				return notebookEditor.revealInViewAtTop(cell);
		}
	}

	$registerNotebookEditorDecorationType(key: string, options: INotebookDecorationRenderOptions): void {
		this._notebookEditorService.registerEditorDecorationType(key, options);
	}

	$removeNotebookEditorDecorationType(key: string): void {
		this._notebookEditorService.removeEditorDecorationType(key);
	}

	$trySetDecorations(id: string, range: ICellRange, key: string): void {
		const editor = this._notebookEditorService.getNotebookEditor(id);
		if (editor) {
			const notebookEditor = editor as INotebookEditor;
			notebookEditor.setEditorDecorations(key, range);
		}
	}

	async $setStatusBarEntry(id: number, rawStatusBarEntry: INotebookCellStatusBarEntryDto): Promise<void> {
		const statusBarEntry = {
			...rawStatusBarEntry,
			...{ cellResource: URI.revive(rawStatusBarEntry.cellResource) }
		};

		const existingEntry = this._cellStatusBarEntries.get(id);
		if (existingEntry) {
			existingEntry.dispose();
		}

		if (statusBarEntry.visible) {
			this._cellStatusBarEntries.set(id, this._cellStatusBarService.addEntry(statusBarEntry));
		}
	}


	async $tryOpenDocument(uriComponents: UriComponents): Promise<URI> {
		const uri = URI.revive(uriComponents);
		const ref = await this._notebookEditorModelResolverService.resolve(uri, undefined);
		this._modelReferenceCollection.add(uri, ref);
		return uri;
	}

	async $trySaveDocument(uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);

		const ref = await this._notebookEditorModelResolverService.resolve(uri);
		const saveResult = await ref.object.save();
		ref.dispose();
		return saveResult;
	}

	async $tryShowNotebookDocument(resource: UriComponents, viewType: string, options: INotebookDocumentShowOptions): Promise<string> {
		const editorOptions = new NotebookEditorOptions({
			cellSelections: options.selection && [options.selection],
			preserveFocus: options.preserveFocus,
			pinned: options.pinned,
			// selection: options.selection,
			// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
			// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
			activation: options.preserveFocus ? EditorActivation.RESTORE : undefined,
			override: EditorOverride.DISABLED,
		});

		const input = NotebookEditorInput.create(this._instantiationService, URI.revive(resource), viewType);
		const editorPane = await this._editorService.openEditor(input, editorOptions, options.position);
		const notebookEditor = getNotebookEditorFromEditorPane(editorPane);

		if (notebookEditor) {
			return notebookEditor.getId();
		} else {
			throw new Error(`Notebook Editor creation failure for documenet ${resource}`);
		}
	}
}
