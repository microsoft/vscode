/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { diffMaps, diffSets } from 'vs/base/common/collections';
import { Emitter } from 'vs/base/common/event';
import { IRelativePattern } from 'vs/base/common/glob';
import { combinedDisposable, Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EditorActivation, EditorOverride } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { BoundModelReferenceCollection } from 'vs/workbench/api/browser/mainThreadDocuments';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { getNotebookEditorFromEditorPane, INotebookEditor, NotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { ICellEditOperation, ICellRange, IEditor, IMainCellDto, INotebookDecorationRenderOptions, INotebookDocumentFilter, INotebookExclusiveDocumentFilter, INotebookKernel, NotebookCellsChangeType, TransientMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { IMainNotebookController, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ExtHostContext, ExtHostNotebookShape, IExtHostContext, INotebookCellStatusBarEntryDto, INotebookDocumentsAndEditorsDelta, INotebookDocumentShowOptions, INotebookEditorAddData, INotebookModelAddedData, MainContext, MainThreadNotebookShape, NotebookEditorRevealType, NotebookExtensionDescription } from '../common/extHost.protocol';

class DocumentAndEditorState {
	static compute(before: DocumentAndEditorState | undefined, after: DocumentAndEditorState): INotebookDocumentsAndEditorsDelta {
		if (!before) {
			return {
				addedDocuments: [...after.documents].map(DocumentAndEditorState._asModelAddData),
				addedEditors: [...after.textEditors.values()].map(DocumentAndEditorState._asEditorAddData),
				visibleEditors: [...after.visibleEditors].map(editor => editor[0])
			};
		}
		const documentDelta = diffSets(before.documents, after.documents);
		const editorDelta = diffMaps(before.textEditors, after.textEditors);
		const addedAPIEditors = editorDelta.added.map(DocumentAndEditorState._asEditorAddData);

		const removedAPIEditors = editorDelta.removed.map(removed => removed.getId());

		// const oldActiveEditor = before.activeEditor !== after.activeEditor ? before.activeEditor : undefined;
		const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;

		const visibleEditorDelta = diffMaps(before.visibleEditors, after.visibleEditors);

		return {
			addedDocuments: documentDelta.added.map(DocumentAndEditorState._asModelAddData),
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
		readonly textEditors: Map<string, IEditor>,
		readonly activeEditor: string | null | undefined,
		readonly visibleEditors: Map<string, IEditor>
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
			})),
			contentOptions: e.transientOptions,
		};
	}

	private static _asEditorAddData(add: IEditor): INotebookEditorAddData {
		return {
			id: add.getId(),
			documentUri: add.textModel!.uri,
			selections: add.getSelections(),
			visibleRanges: add.visibleRanges
		};
	}
}

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks extends Disposable implements MainThreadNotebookShape {

	private readonly _proxy: ExtHostNotebookShape;
	private readonly _notebookProviders = new Map<string, { controller: IMainNotebookController, disposable: IDisposable }>();
	private readonly _notebookKernelProviders = new Map<number, { extension: NotebookExtensionDescription, emitter: Emitter<URI | undefined>, provider: IDisposable }>();
	private readonly _toDisposeOnEditorRemove = new Map<string, IDisposable>();
	private readonly _editorEventListenersMapping: Map<string, DisposableStore> = new Map();
	private readonly _documentEventListenersMapping: ResourceMap<DisposableStore> = new ResourceMap();
	private readonly _cellStatusBarEntries: Map<number, IDisposable> = new Map();
	private readonly _modelReferenceCollection: BoundModelReferenceCollection;

	private _currentState?: DocumentAndEditorState;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@INotebookService private _notebookService: INotebookService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILogService private readonly _logService: ILogService,
		@INotebookCellStatusBarService private readonly _cellStatusBarService: INotebookCellStatusBarService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
		this._modelReferenceCollection = new BoundModelReferenceCollection(this._uriIdentityService.extUri);
		this.registerListeners();
	}

	dispose(): void {
		super.dispose();

		this._modelReferenceCollection.dispose();

		// remove all notebook providers
		for (let item of this._notebookProviders.values()) {
			item.disposable.dispose();
		}

		// remove all kernel providers
		for (let item of this._notebookKernelProviders.values()) {
			item.emitter.dispose();
			item.provider.dispose();
		}
		dispose(this._editorEventListenersMapping.values());
		dispose(this._documentEventListenersMapping.values());
		dispose(this._toDisposeOnEditorRemove.values());
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

	private _isDeltaEmpty(delta: INotebookDocumentsAndEditorsDelta) {
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

	private _emitDelta(delta: INotebookDocumentsAndEditorsDelta) {
		if (this._isDeltaEmpty(delta)) {
			return;
		}

		return this._proxy.$acceptDocumentAndEditorsDelta(delta);
	}

	registerListeners() {

		// forward changes to dirty state
		// todo@rebornix todo@mjbvz this seem way too complicated... is there an easy way to
		// the actual resource from a working copy?
		this._register(this._workingCopyService.onDidChangeDirty(e => {
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

		this._notebookService.listNotebookEditors().forEach((e) => {
			this._addNotebookEditor(e);
		});

		this._register(this._notebookService.onDidChangeActiveEditor(e => {
			this._updateState();
		}));

		this._register(this._notebookService.onDidChangeVisibleEditors(e => {
			if (this._notebookProviders.size > 0) {
				if (!this._currentState) {
					// no current state means we didn't even create editors in ext host yet.
					return;
				}

				// we can't simply update visibleEditors as we need to check if we should create editors first.
				this._updateState();
			}
		}));

		const notebookEditorAddedHandler = (editor: IEditor) => {
			if (!this._editorEventListenersMapping.has(editor.getId())) {
				const disposableStore = new DisposableStore();
				disposableStore.add(editor.onDidChangeVisibleRanges(() => {
					this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { visibleRanges: { ranges: editor.visibleRanges }, selections: null });
				}));

				disposableStore.add(editor.onDidChangeSelection(() => {
					this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { visibleRanges: null, selections: { selections: editor.getSelections() } });
				}));

				this._editorEventListenersMapping.set(editor.getId(), disposableStore);
			}
		};

		this._register(this._notebookService.onNotebookEditorAdd(editor => {
			notebookEditorAddedHandler(editor);
			this._addNotebookEditor(editor);
		}));

		this._register(this._notebookService.onNotebookEditorsRemove(editors => {
			this._removeNotebookEditor(editors);

			editors.forEach(editor => {
				this._editorEventListenersMapping.get(editor.getId())?.dispose();
				this._editorEventListenersMapping.delete(editor.getId());
			});
		}));

		this._notebookService.listNotebookEditors().forEach(editor => {
			notebookEditorAddedHandler(editor);
		});

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


		const notebookDocumentAddedHandler = (textModel: NotebookTextModel) => {
			if (!this._documentEventListenersMapping.has(textModel.uri)) {
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
			}
		};

		this._notebookService.listNotebookDocuments().forEach(notebookDocumentAddedHandler);
		this._register(this._notebookService.onDidAddNotebookDocument(document => {
			notebookDocumentAddedHandler(document);
			this._updateState();
		}));

		this._register(this._notebookService.onDidRemoveNotebookDocument(uri => {
			this._documentEventListenersMapping.get(uri)?.dispose();
			this._documentEventListenersMapping.delete(uri);
			this._updateState();
		}));

		this._register(this._notebookService.onDidChangeNotebookActiveKernel(e => {
			this._proxy.$acceptNotebookActiveKernelChange(e);
		}));

		this._register(this._notebookService.onNotebookDocumentSaved(e => {
			this._proxy.$acceptModelSaved(e);
		}));

		const notebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		this._updateState(notebookEditor);
	}

	private _addNotebookEditor(e: IEditor) {
		this._toDisposeOnEditorRemove.set(e.getId(), combinedDisposable(
			e.onDidChangeModel(() => this._updateState()),
			e.onDidFocusEditorWidget(() => {
				this._updateState(e);
			}),
		));

		const activeNotebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		this._updateState(activeNotebookEditor);
	}

	private _removeNotebookEditor(editors: IEditor[]) {
		editors.forEach(e => {
			const sub = this._toDisposeOnEditorRemove.get(e.getId());
			if (sub) {
				this._toDisposeOnEditorRemove.delete(e.getId());
				sub.dispose();
			}
		});

		this._updateState();
	}

	private async _updateState(focusedNotebookEditor?: IEditor) {
		let activeEditor: string | null = null;

		const activeNotebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		activeEditor = activeNotebookEditor && activeNotebookEditor.hasModel() ? activeNotebookEditor.getId() : null;
		const documentEditorsMap = new Map<string, IEditor>();

		const editors = new Map<string, IEditor>();
		this._notebookService.listNotebookEditors().forEach(editor => {
			if (editor.textModel) {
				editors.set(editor.getId(), editor);
				documentEditorsMap.set(editor.textModel.uri.toString(), editor);
			}
		});

		const visibleEditorsMap = new Map<string, IEditor>();
		this._editorService.visibleEditorPanes.forEach(editorPane => {
			const nbEditorWidget = getNotebookEditorFromEditorPane(editorPane);
			if (nbEditorWidget && editors.has(nbEditorWidget.getId())) {
				visibleEditorsMap.set(nbEditorWidget.getId(), nbEditorWidget);
			}
		});

		const documents = new Set<NotebookTextModel>();
		this._notebookService.listNotebookDocuments().forEach(document => {
			documents.add(document);
		});

		if (!activeEditor && focusedNotebookEditor && focusedNotebookEditor.textModel) {
			activeEditor = focusedNotebookEditor.getId();
		}

		// editors always have view model attached, which means there is already a document in exthost.
		const newState = new DocumentAndEditorState(documents, editors, activeEditor, visibleEditorsMap);
		const delta = DocumentAndEditorState.compute(this._currentState, newState);
		// const isEmptyChange = (!delta.addedDocuments || delta.addedDocuments.length === 0)
		// 	&& (!delta.removedDocuments || delta.removedDocuments.length === 0)
		// 	&& (!delta.addedEditors || delta.addedEditors.length === 0)
		// 	&& (!delta.removedEditors || delta.removedEditors.length === 0)
		// 	&& (delta.newActiveEditor === undefined)

		// if (!isEmptyChange) {
		this._currentState = newState;
		this._emitDelta(delta);
		// }
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
			openNotebook: async (viewType: string, uri: URI, backupId?: string) => {
				const data = await this._proxy.$openNotebook(viewType, uri, backupId);
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
						executeNotebookCell: (uri: URI, cellHandle: number | undefined): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.executeNotebookCell', uri.path, dto.friendlyId, cellHandle);
							return this._proxy.$executeNotebookKernelFromProvider(handle, uri, dto.friendlyId, cellHandle);
						},
						cancelNotebookCell: (uri: URI, cellHandle: number | undefined): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.cancelNotebookCell', uri.path, dto.friendlyId, cellHandle);
							return this._proxy.$cancelNotebookKernelFromProvider(handle, uri, dto.friendlyId, cellHandle);
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

	async $postMessage(editorId: string, forRendererId: string | undefined, value: any): Promise<boolean> {
		const editor = this._notebookService.getNotebookEditor(editorId) as INotebookEditor | undefined;
		if (editor) {
			editor.postMessage(forRendererId, value);
			return true;
		}

		return false;
	}

	async $tryRevealRange(id: string, range: ICellRange, revealType: NotebookEditorRevealType) {
		const editor = this._notebookService.listNotebookEditors().find(editor => editor.getId() === id) as INotebookEditor | undefined;
		if (editor) {
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
				default:
					break;
			}
		}
	}

	$registerNotebookEditorDecorationType(key: string, options: INotebookDecorationRenderOptions) {
		this._notebookService.registerEditorDecorationType(key, options);
	}

	$removeNotebookEditorDecorationType(key: string) {
		this._notebookService.removeEditorDecorationType(key);
	}

	$trySetDecorations(id: string, range: ICellRange, key: string) {
		const editor = this._notebookService.listNotebookEditors().find(editor => editor.getId() === id) as INotebookEditor | undefined;
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


	async $tryOpenDocument(uriComponents: UriComponents, viewType?: string): Promise<URI> {
		const uri = URI.revive(uriComponents);
		const ref = await this._notebookModelResolverService.resolve(uri, viewType);
		this._modelReferenceCollection.add(uri, ref);

		return uri;
	}

	async $trySaveDocument(uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);

		const ref = await this._notebookModelResolverService.resolve(uri);
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
