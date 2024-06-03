/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { toAction } from 'vs/base/common/actions';
import { createErrorWithActions } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { Iterable } from 'vs/base/common/iterator';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { basename, isEqual } from 'vs/base/common/resources';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { INotebookEditorContribution, notebookPreloadExtensionPoint, notebookRendererExtensionPoint, notebooksExtensionPoint } from 'vs/workbench/contrib/notebook/browser/notebookExtensionPoint';
import { INotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookDiffEditorInput } from 'vs/workbench/contrib/notebook/common/notebookDiffEditorInput';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER, CellUri, NotebookSetting, INotebookContributionData, INotebookExclusiveDocumentFilter, INotebookRendererInfo, INotebookTextModel, IOrderedMimeType, IOutputDto, MimeTypeDisplayOrder, NotebookData, NotebookEditorPriority, NotebookRendererMatch, NOTEBOOK_DISPLAY_ORDER, RENDERER_EQUIVALENT_EXTENSIONS, RENDERER_NOT_AVAILABLE, TransientOptions, NotebookExtensionDescription, INotebookStaticPreloadInfo } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { NotebookOutputRendererInfo, NotebookStaticPreloadInfo as NotebookStaticPreloadInfo } from 'vs/workbench/contrib/notebook/common/notebookOutputRenderer';
import { NotebookEditorDescriptor, NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { DiffEditorInputFactoryFunction, EditorInputFactoryFunction, EditorInputFactoryObject, IEditorResolverService, IEditorType, RegisteredEditorInfo, RegisteredEditorPriority, UntitledEditorInputFactoryFunction, type MergeEditorInputFactoryFunction } from 'vs/workbench/services/editor/common/editorResolverService';
import { IExtensionService, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { InstallRecommendedExtensionAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { INotebookDocument, INotebookDocumentService } from 'vs/workbench/services/notebook/common/notebookDocumentService';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import type { EditorInputWithOptions, IResourceMergeEditorInput } from 'vs/workbench/common/editor';

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
					exclusive: false
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
				priority: notebookProviderInfo.exclusive ? RegisteredEditorPriority.exclusive : notebookProviderInfo.priority,
			};
			const notebookEditorOptions = {
				canHandleDiff: () => !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized(),
				canSupportResource: (resource: URI) => resource.scheme === Schemas.untitled || resource.scheme === Schemas.vscodeNotebookCell || this._fileService.hasProvider(resource)
			};
			const notebookEditorInputFactory: EditorInputFactoryFunction = ({ resource, options }) => {
				const data = CellUri.parse(resource);
				let notebookUri: URI;

				let cellOptions: IResourceEditorInput | undefined;
				let preferredResource = resource;

				if (data) {
					// resource is a notebook cell
					notebookUri = this.uriIdentService.asCanonicalUri(data.notebook);
					preferredResource = data.notebook;
					cellOptions = { resource, options };
				} else {
					notebookUri = this.uriIdentService.asCanonicalUri(resource);
				}

				if (!cellOptions) {
					cellOptions = (options as INotebookEditorOptions | undefined)?.cellOptions;
				}

				const notebookOptions = { ...options, cellOptions } as INotebookEditorOptions;
				const editor = NotebookEditorInput.getOrCreate(this._instantiationService, notebookUri, preferredResource, notebookProviderInfo.id);
				return { editor, options: notebookOptions };
			};

			const notebookUntitledEditorFactory: UntitledEditorInputFactoryFunction = async ({ resource, options }) => {
				const ref = await this._notebookEditorModelResolverService.resolve({ untitledResource: resource }, notebookProviderInfo.id);

				// untitled notebooks are disposed when they get saved. we should not hold a reference
				// to such a disposed notebook and therefore dispose the reference as well
				ref.object.notebook.onWillDispose(() => {
					ref.dispose();
				});

				return { editor: NotebookEditorInput.getOrCreate(this._instantiationService, ref.object.resource, undefined, notebookProviderInfo.id), options };
			};
			const notebookDiffEditorInputFactory: DiffEditorInputFactoryFunction = ({ modified, original, label, description }) => {
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
			exclusive: data.exclusive,
			priority: RegisteredEditorPriority.default,
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

	createNotebookTextModel(viewType: string, uri: URI, data: NotebookData, transientOptions: TransientOptions): NotebookTextModel {
		if (this._models.has(uri)) {
			throw new Error(`notebook for ${uri} already exists`);
		}
		const notebookModel = this._instantiationService.createInstance(NotebookTextModel, viewType, uri, data.cells, data.metadata, transientOptions);
		const modelData = new ModelData(notebookModel, this._onWillDisposeDocument.bind(this));
		this._models.set(uri, modelData);
		this._notebookDocumentService.addNotebookDocument(modelData);
		this._onWillAddNotebookDocument.fire(notebookModel);
		this._onDidAddNotebookDocument.fire(notebookModel);
		this._postDocumentOpenActivation(viewType);
		return notebookModel;
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
