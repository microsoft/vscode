/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { toAction } from '../../../../../base/common/actions.js';
import { createErrorWithActions } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import * as glob from '../../../../../base/common/glob.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento, MementoObject } from '../../../../common/memento.js';
import { INotebookEditorContribution, notebookPreloadExtensionPoint, notebookRendererExtensionPoint, notebooksExtensionPoint } from '../notebookExtensionPoint.js';
import { INotebookEditorOptions } from '../notebookBrowser.js';
import { NotebookDiffEditorInput } from '../../common/notebookDiffEditorInput.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER, CellUri, NotebookSetting, INotebookContributionData, INotebookExclusiveDocumentFilter, INotebookRendererInfo, INotebookTextModel, IOrderedMimeType, IOutputDto, MimeTypeDisplayOrder, NotebookEditorPriority, NotebookRendererMatch, NOTEBOOK_DISPLAY_ORDER, RENDERER_EQUIVALENT_EXTENSIONS, RENDERER_NOT_AVAILABLE, NotebookExtensionDescription, INotebookStaticPreloadInfo, NotebookData } from '../../common/notebookCommon.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { NotebookOutputRendererInfo, NotebookStaticPreloadInfo as NotebookStaticPreloadInfo } from '../../common/notebookOutputRenderer.js';
import { NotebookEditorDescriptor, NotebookProviderInfo } from '../../common/notebookProvider.js';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from '../../common/notebookService.js';
import { DiffEditorInputFactoryFunction, EditorInputFactoryFunction, EditorInputFactoryObject, IEditorResolverService, IEditorType, RegisteredEditorInfo, RegisteredEditorPriority, UntitledEditorInputFactoryFunction, type MergeEditorInputFactoryFunction } from '../../../../services/editor/common/editorResolverService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { IExtensionPointUser } from '../../../../services/extensions/common/extensionsRegistry.js';
import { InstallRecommendedExtensionAction } from '../../../extensions/browser/extensionsActions.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotebookDocument, INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { MergeEditorInput } from '../../../mergeEditor/browser/mergeEditorInput.js';
import type { EditorInputWithOptions, IResourceDiffEditorInput, IResourceMergeEditorInput } from '../../../../common/editor.js';
import { bufferToStream, streamToBuffer, VSBuffer, VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import type { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { NotebookMultiDiffEditorInput } from '../diff/notebookMultiDiffEditorInput.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { ICellRange } from '../../common/notebookRange.js';

export class NotebookProviderInfoStore extends Disposable {

	private static readonly CUSTOM_EDITORS_STORAGE_ID = 'notebookEditors';
	private static readonly CUSTOM_EDITORS_ENTRY_ID = 'editors';

	private readonly _memento: Memento;
	private _handled: boolean = false;

	private readonly _contributedEditors = new Map<string, NotebookProviderInfo>();
	private readonly _contributedEditorDisposables = this._register(new DisposableStore());

	constructor(
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@INotebookEditorModelResolverService private readonly _notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@IUriIdentityService private readonly uriIdentService: IUriIdentityService,
	) {
		super();

		this._memento = new Memento(NotebookProviderInfoStore.CUSTOM_EDITORS_STORAGE_ID, storageService);

		const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		// Process the notebook contributions but buffer changes from the resolver
		this._editorResolverService.bufferChangeEvents(() => {
			for (const info of (mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] || []) as NotebookEditorDescriptor[]) {
				this.add(new NotebookProviderInfo(info), false);
			}
		});

		this._register(extensionService.onDidRegisterExtensions(() => {
			if (!this._handled) {
				// there is no extension point registered for notebook content provider
				// clear the memento and cache
				this._clear();
				mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = [];
				this._memento.saveMemento();
			}
		}));

		notebooksExtensionPoint.setHandler(extensions => this._setupHandler(extensions));
	}

	override dispose(): void {
		this._clear();
		super.dispose();
	}

	private _setupHandler(extensions: readonly IExtensionPointUser<INotebookEditorContribution[]>[]) {
		this._handled = true;
		const builtins: NotebookProviderInfo[] = [...this._contributedEditors.values()].filter(info => !info.extension);
		this._clear();

		const builtinProvidersFromCache: Map<string, IDisposable> = new Map();
		builtins.forEach(builtin => {
			builtinProvidersFromCache.set(builtin.id, this.add(builtin));
		});

		for (const extension of extensions) {
			for (const notebookContribution of extension.value) {

				if (!notebookContribution.type) {
					extension.collector.error(`Notebook does not specify type-property`);
					continue;
				}

				const existing = this.get(notebookContribution.type);

				if (existing) {
					if (!existing.extension && extension.description.isBuiltin && builtins.find(builtin => builtin.id === notebookContribution.type)) {
						// we are registering an extension which is using the same view type which is already cached
						builtinProvidersFromCache.get(notebookContribution.type)?.dispose();
					} else {
						extension.collector.error(`Notebook type '${notebookContribution.type}' already used`);
						continue;
					}
				}

				this.add(new NotebookProviderInfo({
					extension: extension.description.identifier,
					id: notebookContribution.type,
					displayName: notebookContribution.displayName,
					selectors: notebookContribution.selector || [],
					priority: this._convertPriority(notebookContribution.priority),
					providerDisplayName: extension.description.displayName ?? extension.description.identifier.value,
				}));
			}
		}

		const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
		this._memento.saveMemento();
	}

	clearEditorCache() {
		const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = [];
		this._memento.saveMemento();
	}

	private _convertPriority(priority?: string) {
		if (!priority) {
			return RegisteredEditorPriority.default;
		}

		if (priority === NotebookEditorPriority.default) {
			return RegisteredEditorPriority.default;
		}

		return RegisteredEditorPriority.option;

	}

	private _registerContributionPoint(notebookProviderInfo: NotebookProviderInfo): IDisposable {

		const disposables = new DisposableStore();

		for (const selector of notebookProviderInfo.selectors) {
			const globPattern = (selector as INotebookExclusiveDocumentFilter).include || selector as glob.IRelativePattern | string;
			const notebookEditorInfo: RegisteredEditorInfo = {
				id: notebookProviderInfo.id,
				label: notebookProviderInfo.displayName,
				detail: notebookProviderInfo.providerDisplayName,
				priority: notebookProviderInfo.priority,
			};
			const notebookEditorOptions = {
				canHandleDiff: () => !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized(),
				canSupportResource: (resource: URI) => {
					if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
						const params = new URLSearchParams(resource.query);
						return params.get('openIn') === 'notebook';
					}
					return resource.scheme === Schemas.untitled || resource.scheme === Schemas.vscodeNotebookCell || this._fileService.hasProvider(resource);
				}
			};
			const notebookEditorInputFactory: EditorInputFactoryFunction = async ({ resource, options }) => {
				let data;
				if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
					const outputUriData = CellUri.parseCellOutputUri(resource);
					if (!outputUriData || !outputUriData.notebook || outputUriData.cellHandle === undefined) {
						throw new Error('Invalid cell output uri');
					}

					data = {
						notebook: outputUriData.notebook,
						handle: outputUriData.cellHandle
					};

				} else {
					data = CellUri.parse(resource);
				}

				let notebookUri: URI;

				let cellOptions: IResourceEditorInput | undefined;

				if (data) {
					// resource is a notebook cell
					notebookUri = this.uriIdentService.asCanonicalUri(data.notebook);
					cellOptions = { resource, options };
				} else {
					notebookUri = this.uriIdentService.asCanonicalUri(resource);
				}

				if (!cellOptions) {
					cellOptions = (options as INotebookEditorOptions | undefined)?.cellOptions;
				}

				let notebookOptions: INotebookEditorOptions;

				if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
					if (data?.handle === undefined || !data?.notebook) {
						throw new Error('Invalid cell handle');
					}

					const cellUri = CellUri.generate(data.notebook, data.handle);

					cellOptions = { resource: cellUri, options };

					const cellIndex = await this._notebookEditorModelResolverService.resolve(notebookUri)
						.then(model => model.object.notebook.cells.findIndex(cell => cell.handle === data?.handle))
						.then(index => index >= 0 ? index : 0);

					const cellIndexesToRanges: ICellRange[] = [{ start: cellIndex, end: cellIndex + 1 }];

					notebookOptions = {
						...options,
						cellOptions,
						viewState: undefined,
						cellSelections: cellIndexesToRanges
					};
				} else {
					notebookOptions = {
						...options,
						cellOptions,
						viewState: undefined,
					};
				}
				const preferredResourceParam = cellOptions?.resource;
				const editor = NotebookEditorInput.getOrCreate(this._instantiationService, notebookUri, preferredResourceParam, notebookProviderInfo.id);
				return { editor, options: notebookOptions };
			};

			const notebookUntitledEditorFactory: UntitledEditorInputFactoryFunction = async ({ resource, options }) => {
				const ref = await this._notebookEditorModelResolverService.resolve({ untitledResource: resource }, notebookProviderInfo.id);

				// untitled notebooks are disposed when they get saved. we should not hold a reference
				// to such a disposed notebook and therefore dispose the reference as well
				Event.once(ref.object.notebook.onWillDispose)(() => {
					ref.dispose();
				});

				return { editor: NotebookEditorInput.getOrCreate(this._instantiationService, ref.object.resource, undefined, notebookProviderInfo.id), options };
			};
			const notebookDiffEditorInputFactory: DiffEditorInputFactoryFunction = (diffEditorInput: IResourceDiffEditorInput, group: IEditorGroup) => {
				const { modified, original, label, description } = diffEditorInput;

				if (this._configurationService.getValue('notebook.experimental.enableNewDiffEditor')) {
					return { editor: NotebookMultiDiffEditorInput.create(this._instantiationService, modified.resource!, label, description, original.resource!, notebookProviderInfo.id) };
				}
				return { editor: NotebookDiffEditorInput.create(this._instantiationService, modified.resource!, label, description, original.resource!, notebookProviderInfo.id) };
			};
			const mergeEditorInputFactory: MergeEditorInputFactoryFunction = (mergeEditor: IResourceMergeEditorInput): EditorInputWithOptions => {
				return {
					editor: this._instantiationService.createInstance(
						MergeEditorInput,
						mergeEditor.base.resource,
						{
							uri: mergeEditor.input1.resource,
							title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
							description: mergeEditor.input1.description ?? '',
							detail: mergeEditor.input1.detail
						},
						{
							uri: mergeEditor.input2.resource,
							title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
							description: mergeEditor.input2.description ?? '',
							detail: mergeEditor.input2.detail
						},
						mergeEditor.result.resource
					)
				};
			};

			const notebookFactoryObject: EditorInputFactoryObject = {
				createEditorInput: notebookEditorInputFactory,
				createDiffEditorInput: notebookDiffEditorInputFactory,
				createUntitledEditorInput: notebookUntitledEditorFactory,
				createMergeEditorInput: mergeEditorInputFactory
			};
			const notebookCellFactoryObject: EditorInputFactoryObject = {
				createEditorInput: notebookEditorInputFactory,
				createDiffEditorInput: notebookDiffEditorInputFactory,
			};

			// TODO @lramos15 find a better way to toggle handling diff editors than needing these listeners for every registration
			// This is a lot of event listeners especially if there are many notebooks
			disposables.add(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(NotebookSetting.textDiffEditorPreview)) {
					const canHandleDiff = !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized();
					if (canHandleDiff) {
						notebookFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
						notebookCellFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
					} else {
						notebookFactoryObject.createDiffEditorInput = undefined;
						notebookCellFactoryObject.createDiffEditorInput = undefined;
					}
				}
			}));

			disposables.add(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
				const canHandleDiff = !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized();
				if (canHandleDiff) {
					notebookFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
					notebookCellFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
				} else {
					notebookFactoryObject.createDiffEditorInput = undefined;
					notebookCellFactoryObject.createDiffEditorInput = undefined;
				}
			}));

			// Register the notebook editor
			disposables.add(this._editorResolverService.registerEditor(
				globPattern,
				notebookEditorInfo,
				notebookEditorOptions,
				notebookFactoryObject,
			));
			// Then register the schema handler as exclusive for that notebook
			disposables.add(this._editorResolverService.registerEditor(
				`${Schemas.vscodeNotebookCell}:/**/${globPattern}`,
				{ ...notebookEditorInfo, priority: RegisteredEditorPriority.exclusive },
				notebookEditorOptions,
				notebookCellFactoryObject
			));
		}

		return disposables;
	}


	private _clear(): void {
		this._contributedEditors.clear();
		this._contributedEditorDisposables.clear();
	}

	get(viewType: string): NotebookProviderInfo | undefined {
		return this._contributedEditors.get(viewType);
	}

	add(info: NotebookProviderInfo, saveMemento = true): IDisposable {
		if (this._contributedEditors.has(info.id)) {
			throw new Error(`notebook type '${info.id}' ALREADY EXISTS`);
		}
		this._contributedEditors.set(info.id, info);
		let editorRegistration: IDisposable | undefined;

		// built-in notebook providers contribute their own editors
		if (info.extension) {
			editorRegistration = this._registerContributionPoint(info);
			this._contributedEditorDisposables.add(editorRegistration);
		}

		if (saveMemento) {
			const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
			mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
			this._memento.saveMemento();
		}

		return this._register(toDisposable(() => {
			const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
			mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
			this._memento.saveMemento();
			editorRegistration?.dispose();
			this._contributedEditors.delete(info.id);
		}));
	}

	getContributedNotebook(resource: URI): readonly NotebookProviderInfo[] {
		const result: NotebookProviderInfo[] = [];
		for (const info of this._contributedEditors.values()) {
			if (info.matches(resource)) {
				result.push(info);
			}
		}
		if (result.length === 0 && resource.scheme === Schemas.untitled) {
			// untitled resource and no path-specific match => all providers apply
			return Array.from(this._contributedEditors.values());
		}
		return result;
	}

	[Symbol.iterator](): Iterator<NotebookProviderInfo> {
		return this._contributedEditors.values();
	}
}

export class NotebookOutputRendererInfoStore {
	private readonly contributedRenderers = new Map</* rendererId */ string, NotebookOutputRendererInfo>();
	private readonly preferredMimetypeMemento: Memento;
	private readonly preferredMimetype = new Lazy<{ [notebookType: string]: { [mimeType: string]: /* rendererId */ string } }>(
		() => this.preferredMimetypeMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE));

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		this.preferredMimetypeMemento = new Memento('workbench.editor.notebook.preferredRenderer2', storageService);
	}

	clear() {
		this.contributedRenderers.clear();
	}

	get(rendererId: string): NotebookOutputRendererInfo | undefined {
		return this.contributedRenderers.get(rendererId);
	}

	getAll(): NotebookOutputRendererInfo[] {
		return Array.from(this.contributedRenderers.values());
	}

	add(info: NotebookOutputRendererInfo): void {
		if (this.contributedRenderers.has(info.id)) {
			return;
		}
		this.contributedRenderers.set(info.id, info);
	}

	/** Update and remember the preferred renderer for the given mimetype in this workspace */
	setPreferred(notebookProviderInfo: NotebookProviderInfo, mimeType: string, rendererId: string) {
		const mementoObj = this.preferredMimetype.value;
		const forNotebook = mementoObj[notebookProviderInfo.id];
		if (forNotebook) {
			forNotebook[mimeType] = rendererId;
		} else {
			mementoObj[notebookProviderInfo.id] = { [mimeType]: rendererId };
		}

		this.preferredMimetypeMemento.saveMemento();
	}

	findBestRenderers(notebookProviderInfo: NotebookProviderInfo | undefined, mimeType: string, kernelProvides: readonly string[] | undefined): IOrderedMimeType[] {

		const enum ReuseOrder {
			PreviouslySelected = 1 << 8,
			SameExtensionAsNotebook = 2 << 8,
			OtherRenderer = 3 << 8,
			BuiltIn = 4 << 8,
		}

		const preferred = notebookProviderInfo && this.preferredMimetype.value[notebookProviderInfo.id]?.[mimeType];
		const notebookExtId = notebookProviderInfo?.extension?.value;
		const notebookId = notebookProviderInfo?.id;
		const renderers: { ordered: IOrderedMimeType; score: number }[] = Array.from(this.contributedRenderers.values())
			.map(renderer => {
				const ownScore = kernelProvides === undefined
					? renderer.matchesWithoutKernel(mimeType)
					: renderer.matches(mimeType, kernelProvides);

				if (ownScore === NotebookRendererMatch.Never) {
					return undefined;
				}

				const rendererExtId = renderer.extensionId.value;
				const reuseScore = preferred === renderer.id
					? ReuseOrder.PreviouslySelected
					: rendererExtId === notebookExtId || RENDERER_EQUIVALENT_EXTENSIONS.get(rendererExtId)?.has(notebookId!)
						? ReuseOrder.SameExtensionAsNotebook
						: renderer.isBuiltin ? ReuseOrder.BuiltIn : ReuseOrder.OtherRenderer;
				return {
					ordered: { mimeType, rendererId: renderer.id, isTrusted: true },
					score: reuseScore | ownScore,
				};
			}).filter(isDefined);

		if (renderers.length === 0) {
			return [{ mimeType, rendererId: RENDERER_NOT_AVAILABLE, isTrusted: true }];
		}

		return renderers.sort((a, b) => a.score - b.score).map(r => r.ordered);
	}
}

class ModelData implements IDisposable, INotebookDocument {
	private readonly _modelEventListeners = new DisposableStore();
	get uri() { return this.model.uri; }

	constructor(
		readonly model: NotebookTextModel,
		onWillDispose: (model: INotebookTextModel) => void
	) {
		this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
	}

	getCellIndex(cellUri: URI): number | undefined {
		return this.model.cells.findIndex(cell => isEqual(cell.uri, cellUri));
	}

	dispose(): void {
		this._modelEventListeners.dispose();
	}
}

export class NotebookService extends Disposable implements INotebookService {

	declare readonly _serviceBrand: undefined;
	private static _storageNotebookViewTypeProvider = 'notebook.viewTypeProvider';
	private readonly _memento: Memento;
	private readonly _viewTypeCache: MementoObject;

	private readonly _notebookProviders = new Map<string, SimpleNotebookProviderInfo>();
	private _notebookProviderInfoStore: NotebookProviderInfoStore | undefined = undefined;
	private get notebookProviderInfoStore(): NotebookProviderInfoStore {
		if (!this._notebookProviderInfoStore) {
			this._notebookProviderInfoStore = this._register(this._instantiationService.createInstance(NotebookProviderInfoStore));
		}

		return this._notebookProviderInfoStore;
	}
	private readonly _notebookRenderersInfoStore = this._instantiationService.createInstance(NotebookOutputRendererInfoStore);
	private readonly _onDidChangeOutputRenderers = this._register(new Emitter<void>());
	readonly onDidChangeOutputRenderers = this._onDidChangeOutputRenderers.event;

	private readonly _notebookStaticPreloadInfoStore = new Set<NotebookStaticPreloadInfo>();

	private readonly _models = new ResourceMap<ModelData>();

	private readonly _onWillAddNotebookDocument = this._register(new Emitter<NotebookTextModel>());
	private readonly _onDidAddNotebookDocument = this._register(new Emitter<NotebookTextModel>());
	private readonly _onWillRemoveNotebookDocument = this._register(new Emitter<NotebookTextModel>());
	private readonly _onDidRemoveNotebookDocument = this._register(new Emitter<NotebookTextModel>());

	readonly onWillAddNotebookDocument = this._onWillAddNotebookDocument.event;
	readonly onDidAddNotebookDocument = this._onDidAddNotebookDocument.event;
	readonly onDidRemoveNotebookDocument = this._onDidRemoveNotebookDocument.event;
	readonly onWillRemoveNotebookDocument = this._onWillRemoveNotebookDocument.event;

	private readonly _onAddViewType = this._register(new Emitter<string>());
	readonly onAddViewType = this._onAddViewType.event;

	private readonly _onWillRemoveViewType = this._register(new Emitter<string>());
	readonly onWillRemoveViewType = this._onWillRemoveViewType.event;

	private readonly _onDidChangeEditorTypes = this._register(new Emitter<void>());
	onDidChangeEditorTypes: Event<void> = this._onDidChangeEditorTypes.event;

	private _cutItems: NotebookCellTextModel[] | undefined;
	private _lastClipboardIsCopy: boolean = true;

	private _displayOrder!: MimeTypeDisplayOrder;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@INotebookDocumentService private readonly _notebookDocumentService: INotebookDocumentService
	) {
		super();

		notebookRendererExtensionPoint.setHandler((renderers) => {
			this._notebookRenderersInfoStore.clear();

			for (const extension of renderers) {
				for (const notebookContribution of extension.value) {
					if (!notebookContribution.entrypoint) { // avoid crashing
						extension.collector.error(`Notebook renderer does not specify entry point`);
						continue;
					}

					const id = notebookContribution.id;
					if (!id) {
						extension.collector.error(`Notebook renderer does not specify id-property`);
						continue;
					}

					this._notebookRenderersInfoStore.add(new NotebookOutputRendererInfo({
						id,
						extension: extension.description,
						entrypoint: notebookContribution.entrypoint,
						displayName: notebookContribution.displayName,
						mimeTypes: notebookContribution.mimeTypes || [],
						dependencies: notebookContribution.dependencies,
						optionalDependencies: notebookContribution.optionalDependencies,
						requiresMessaging: notebookContribution.requiresMessaging,
					}));
				}
			}

			this._onDidChangeOutputRenderers.fire();
		});

		notebookPreloadExtensionPoint.setHandler(extensions => {
			this._notebookStaticPreloadInfoStore.clear();

			for (const extension of extensions) {
				if (!isProposedApiEnabled(extension.description, 'contribNotebookStaticPreloads')) {
					continue;
				}

				for (const notebookContribution of extension.value) {
					if (!notebookContribution.entrypoint) { // avoid crashing
						extension.collector.error(`Notebook preload does not specify entry point`);
						continue;
					}

					const type = notebookContribution.type;
					if (!type) {
						extension.collector.error(`Notebook preload does not specify type-property`);
						continue;
					}

					this._notebookStaticPreloadInfoStore.add(new NotebookStaticPreloadInfo({
						type,
						extension: extension.description,
						entrypoint: notebookContribution.entrypoint,
						localResourceRoots: notebookContribution.localResourceRoots ?? [],
					}));
				}
			}
		});

		const updateOrder = () => {
			this._displayOrder = new MimeTypeDisplayOrder(
				this._configurationService.getValue<string[]>(NotebookSetting.displayOrder) || [],
				this._accessibilityService.isScreenReaderOptimized()
					? ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER
					: NOTEBOOK_DISPLAY_ORDER,
			);
		};

		updateOrder();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.displayOrder)) {
				updateOrder();
			}
		}));

		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			updateOrder();
		}));

		this._memento = new Memento(NotebookService._storageNotebookViewTypeProvider, this._storageService);
		this._viewTypeCache = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}


	getEditorTypes(): IEditorType[] {
		return [...this.notebookProviderInfoStore].map(info => ({
			id: info.id,
			displayName: info.displayName,
			providerDisplayName: info.providerDisplayName
		}));
	}

	clearEditorCache(): void {
		this.notebookProviderInfoStore.clearEditorCache();
	}

	private _postDocumentOpenActivation(viewType: string) {
		// send out activations on notebook text model creation
		this._extensionService.activateByEvent(`onNotebook:${viewType}`);
		this._extensionService.activateByEvent(`onNotebook:*`);
	}

	async canResolve(viewType: string): Promise<boolean> {
		if (this._notebookProviders.has(viewType)) {
			return true;
		}

		await this._extensionService.whenInstalledExtensionsRegistered();
		await this._extensionService.activateByEvent(`onNotebookSerializer:${viewType}`);

		return this._notebookProviders.has(viewType);
	}

	registerContributedNotebookType(viewType: string, data: INotebookContributionData): IDisposable {

		const info = new NotebookProviderInfo({
			extension: data.extension,
			id: viewType,
			displayName: data.displayName,
			providerDisplayName: data.providerDisplayName,
			priority: data.priority || RegisteredEditorPriority.default,
			selectors: []
		});

		info.update({ selectors: data.filenamePattern });

		const reg = this.notebookProviderInfoStore.add(info);
		this._onDidChangeEditorTypes.fire();

		return toDisposable(() => {
			reg.dispose();
			this._onDidChangeEditorTypes.fire();
		});
	}

	private _registerProviderData(viewType: string, data: SimpleNotebookProviderInfo): IDisposable {
		if (this._notebookProviders.has(viewType)) {
			throw new Error(`notebook provider for viewtype '${viewType}' already exists`);
		}
		this._notebookProviders.set(viewType, data);
		this._onAddViewType.fire(viewType);
		return toDisposable(() => {
			this._onWillRemoveViewType.fire(viewType);
			this._notebookProviders.delete(viewType);
		});
	}

	registerNotebookSerializer(viewType: string, extensionData: NotebookExtensionDescription, serializer: INotebookSerializer): IDisposable {
		this.notebookProviderInfoStore.get(viewType)?.update({ options: serializer.options });
		this._viewTypeCache[viewType] = extensionData.id.value;
		this._persistMementos();
		return this._registerProviderData(viewType, new SimpleNotebookProviderInfo(viewType, serializer, extensionData));
	}

	async withNotebookDataProvider(viewType: string): Promise<SimpleNotebookProviderInfo> {
		const selected = this.notebookProviderInfoStore.get(viewType);
		if (!selected) {
			const knownProvider = this.getViewTypeProvider(viewType);

			const actions = knownProvider ? [
				toAction({
					id: 'workbench.notebook.action.installMissingViewType', label: localize('notebookOpenInstallMissingViewType', "Install extension for '{0}'", viewType), run: async () => {
						await this._instantiationService.createInstance(InstallRecommendedExtensionAction, knownProvider).run();
					}
				})
			] : [];

			throw createErrorWithActions(`UNKNOWN notebook type '${viewType}'`, actions);
		}
		await this.canResolve(selected.id);
		const result = this._notebookProviders.get(selected.id);
		if (!result) {
			throw new Error(`NO provider registered for view type: '${selected.id}'`);
		}
		return result;
	}

	tryGetDataProviderSync(viewType: string): SimpleNotebookProviderInfo | undefined {
		const selected = this.notebookProviderInfoStore.get(viewType);
		if (!selected) {
			return undefined;
		}
		return this._notebookProviders.get(selected.id);
	}


	private _persistMementos(): void {
		this._memento.saveMemento();
	}

	getViewTypeProvider(viewType: string): string | undefined {
		return this._viewTypeCache[viewType];
	}

	getRendererInfo(rendererId: string): INotebookRendererInfo | undefined {
		return this._notebookRenderersInfoStore.get(rendererId);
	}

	updateMimePreferredRenderer(viewType: string, mimeType: string, rendererId: string, otherMimetypes: readonly string[]): void {
		const info = this.notebookProviderInfoStore.get(viewType);
		if (info) {
			this._notebookRenderersInfoStore.setPreferred(info, mimeType, rendererId);
		}

		this._displayOrder.prioritize(mimeType, otherMimetypes);
	}

	saveMimeDisplayOrder(target: ConfigurationTarget) {
		this._configurationService.updateValue(NotebookSetting.displayOrder, this._displayOrder.toArray(), target);
	}

	getRenderers(): INotebookRendererInfo[] {
		return this._notebookRenderersInfoStore.getAll();
	}

	*getStaticPreloads(viewType: string): Iterable<INotebookStaticPreloadInfo> {
		for (const preload of this._notebookStaticPreloadInfoStore) {
			if (preload.type === viewType) {
				yield preload;
			}
		}
	}

	// --- notebook documents: create, destory, retrieve, enumerate

	async createNotebookTextModel(viewType: string, uri: URI, stream?: VSBufferReadableStream): Promise<NotebookTextModel> {
		if (this._models.has(uri)) {
			throw new Error(`notebook for ${uri} already exists`);
		}

		const info = await this.withNotebookDataProvider(viewType);
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}


		const bytes = stream ? await streamToBuffer(stream) : VSBuffer.fromByteArray([]);
		const data = await info.serializer.dataToNotebook(bytes);


		const notebookModel = this._instantiationService.createInstance(NotebookTextModel, info.viewType, uri, data.cells, data.metadata, info.serializer.options);
		const modelData = new ModelData(notebookModel, this._onWillDisposeDocument.bind(this));
		this._models.set(uri, modelData);
		this._notebookDocumentService.addNotebookDocument(modelData);
		this._onWillAddNotebookDocument.fire(notebookModel);
		this._onDidAddNotebookDocument.fire(notebookModel);
		this._postDocumentOpenActivation(info.viewType);
		return notebookModel;
	}

	async createNotebookTextDocumentSnapshot(uri: URI, context: SnapshotContext, token: CancellationToken): Promise<VSBufferReadableStream> {
		const model = this.getNotebookTextModel(uri);

		if (!model) {
			throw new Error(`notebook for ${uri} doesn't exist`);
		}

		const info = await this.withNotebookDataProvider(model.viewType);

		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}

		const serializer = info.serializer;
		const outputSizeLimit = this._configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
		const data: NotebookData = model.createSnapshot({ context: context, outputSizeLimit: outputSizeLimit, transientOptions: serializer.options });
		const indentAmount = model.metadata.indentAmount;
		if (typeof indentAmount === 'string' && indentAmount) {
			// This is required for ipynb serializer to preserve the whitespace in the notebook.
			data.metadata.indentAmount = indentAmount;
		}
		const bytes = await serializer.notebookToData(data);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return bufferToStream(bytes);
	}

	async restoreNotebookTextModelFromSnapshot(uri: URI, viewType: string, snapshot: VSBufferReadableStream): Promise<NotebookTextModel> {
		const model = this.getNotebookTextModel(uri);

		if (!model) {
			throw new Error(`notebook for ${uri} doesn't exist`);
		}

		const info = await this.withNotebookDataProvider(model.viewType);

		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}

		const serializer = info.serializer;

		const bytes = await streamToBuffer(snapshot);
		const data = await info.serializer.dataToNotebook(bytes);
		model.restoreSnapshot(data, serializer.options);

		return model;
	}

	getNotebookTextModel(uri: URI): NotebookTextModel | undefined {
		return this._models.get(uri)?.model;
	}

	getNotebookTextModels(): Iterable<NotebookTextModel> {
		return Iterable.map(this._models.values(), data => data.model);
	}

	listNotebookDocuments(): NotebookTextModel[] {
		return [...this._models].map(e => e[1].model);
	}

	private _onWillDisposeDocument(model: INotebookTextModel): void {
		const modelData = this._models.get(model.uri);
		if (modelData) {
			this._onWillRemoveNotebookDocument.fire(modelData.model);
			this._models.delete(model.uri);
			this._notebookDocumentService.removeNotebookDocument(modelData);
			modelData.dispose();
			this._onDidRemoveNotebookDocument.fire(modelData.model);
		}
	}

	getOutputMimeTypeInfo(textModel: NotebookTextModel, kernelProvides: readonly string[] | undefined, output: IOutputDto): readonly IOrderedMimeType[] {
		const sorted = this._displayOrder.sort(new Set<string>(output.outputs.map(op => op.mime)));
		const notebookProviderInfo = this.notebookProviderInfoStore.get(textModel.viewType);

		return sorted
			.flatMap(mimeType => this._notebookRenderersInfoStore.findBestRenderers(notebookProviderInfo, mimeType, kernelProvides))
			.sort((a, b) => (a.rendererId === RENDERER_NOT_AVAILABLE ? 1 : 0) - (b.rendererId === RENDERER_NOT_AVAILABLE ? 1 : 0));
	}

	getContributedNotebookTypes(resource?: URI): readonly NotebookProviderInfo[] {
		if (resource) {
			return this.notebookProviderInfoStore.getContributedNotebook(resource);
		}

		return [...this.notebookProviderInfoStore];
	}

	hasSupportedNotebooks(resource: URI): boolean {
		if (this._models.has(resource)) {
			// it might be untitled
			return true;
		}

		const contribution = this.notebookProviderInfoStore.getContributedNotebook(resource);
		if (!contribution.length) {
			return false;
		}
		return contribution.some(info => info.matches(resource) &&
			(info.priority === RegisteredEditorPriority.default || info.priority === RegisteredEditorPriority.exclusive)
		);
	}

	getContributedNotebookType(viewType: string): NotebookProviderInfo | undefined {
		return this.notebookProviderInfoStore.get(viewType);
	}

	getNotebookProviderResourceRoots(): URI[] {
		const ret: URI[] = [];
		this._notebookProviders.forEach(val => {
			if (val.extensionData.location) {
				ret.push(URI.revive(val.extensionData.location));
			}
		});

		return ret;
	}

	// --- copy & paste

	setToCopy(items: NotebookCellTextModel[], isCopy: boolean) {
		this._cutItems = items;
		this._lastClipboardIsCopy = isCopy;
	}

	getToCopy(): { items: NotebookCellTextModel[]; isCopy: boolean } | undefined {
		if (this._cutItems) {
			return { items: this._cutItems, isCopy: this._lastClipboardIsCopy };
		}

		return undefined;
	}

}
