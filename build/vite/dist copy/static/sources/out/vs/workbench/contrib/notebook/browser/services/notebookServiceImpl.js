/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotebookProviderInfoStore_1, NotebookService_1;
import { localize } from '../../../../../nls.js';
import { toAction } from '../../../../../base/common/actions.js';
import { createErrorWithActions } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { notebookPreloadExtensionPoint, notebookRendererExtensionPoint, notebooksExtensionPoint } from '../notebookExtensionPoint.js';
import { NotebookDiffEditorInput } from '../../common/notebookDiffEditorInput.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER, CellUri, NotebookSetting, MimeTypeDisplayOrder, NotebookEditorPriority, NOTEBOOK_DISPLAY_ORDER, RENDERER_EQUIVALENT_EXTENSIONS, RENDERER_NOT_AVAILABLE } from '../../common/notebookCommon.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { NotebookOutputRendererInfo, NotebookStaticPreloadInfo } from '../../common/notebookOutputRenderer.js';
import { NotebookProviderInfo } from '../../common/notebookProvider.js';
import { SimpleNotebookProviderInfo } from '../../common/notebookService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { InstallRecommendedExtensionAction } from '../../../extensions/browser/extensionsActions.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { MergeEditorInput } from '../../../mergeEditor/browser/mergeEditorInput.js';
import { bufferToStream, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { NotebookMultiDiffEditorInput } from '../diff/notebookMultiDiffEditorInput.js';
import { CancellationError } from '../../../../../base/common/errors.js';
let NotebookProviderInfoStore = class NotebookProviderInfoStore extends Disposable {
    static { NotebookProviderInfoStore_1 = this; }
    static { this.CUSTOM_EDITORS_STORAGE_ID = 'notebookEditors'; }
    static { this.CUSTOM_EDITORS_ENTRY_ID = 'editors'; }
    constructor(storageService, extensionService, _editorResolverService, _configurationService, _accessibilityService, _instantiationService, _fileService, _notebookEditorModelResolverService, uriIdentService) {
        super();
        this._editorResolverService = _editorResolverService;
        this._configurationService = _configurationService;
        this._accessibilityService = _accessibilityService;
        this._instantiationService = _instantiationService;
        this._fileService = _fileService;
        this._notebookEditorModelResolverService = _notebookEditorModelResolverService;
        this.uriIdentService = uriIdentService;
        this._handled = false;
        this._contributedEditors = new Map();
        this._contributedEditorDisposables = this._register(new DisposableStore());
        this._memento = new Memento(NotebookProviderInfoStore_1.CUSTOM_EDITORS_STORAGE_ID, storageService);
        const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // Process the notebook contributions but buffer changes from the resolver
        this._editorResolverService.bufferChangeEvents(() => {
            for (const info of (mementoObject[NotebookProviderInfoStore_1.CUSTOM_EDITORS_ENTRY_ID] || [])) {
                this.add(new NotebookProviderInfo(info), false);
            }
        });
        this._register(extensionService.onDidRegisterExtensions(() => {
            if (!this._handled) {
                // there is no extension point registered for notebook content provider
                // clear the memento and cache
                this._clear();
                mementoObject[NotebookProviderInfoStore_1.CUSTOM_EDITORS_ENTRY_ID] = [];
                this._memento.saveMemento();
            }
        }));
        notebooksExtensionPoint.setHandler(extensions => this._setupHandler(extensions));
    }
    dispose() {
        this._clear();
        super.dispose();
    }
    _setupHandler(extensions) {
        this._handled = true;
        const builtins = [...this._contributedEditors.values()].filter(info => !info.extension);
        this._clear();
        const builtinProvidersFromCache = new Map();
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
                    }
                    else {
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
        const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        mementoObject[NotebookProviderInfoStore_1.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
        this._memento.saveMemento();
    }
    clearEditorCache() {
        const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        mementoObject[NotebookProviderInfoStore_1.CUSTOM_EDITORS_ENTRY_ID] = [];
        this._memento.saveMemento();
    }
    _convertPriority(priority) {
        if (!priority) {
            return RegisteredEditorPriority.default;
        }
        if (priority === NotebookEditorPriority.default) {
            return RegisteredEditorPriority.default;
        }
        return RegisteredEditorPriority.option;
    }
    _registerContributionPoint(notebookProviderInfo) {
        const disposables = new DisposableStore();
        for (const selector of notebookProviderInfo.selectors) {
            const globPattern = selector.include || selector;
            const notebookEditorInfo = {
                id: notebookProviderInfo.id,
                label: notebookProviderInfo.displayName,
                detail: notebookProviderInfo.providerDisplayName,
                priority: notebookProviderInfo.priority,
            };
            const notebookEditorOptions = {
                canHandleDiff: () => !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized(),
                canSupportResource: (resource) => {
                    if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
                        const params = new URLSearchParams(resource.query);
                        return params.get('openIn') === 'notebook';
                    }
                    return resource.scheme === Schemas.untitled || resource.scheme === Schemas.vscodeNotebookCell || this._fileService.hasProvider(resource);
                }
            };
            const notebookEditorInputFactory = async ({ resource, options }) => {
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
                }
                else {
                    data = CellUri.parse(resource);
                }
                let notebookUri;
                let cellOptions;
                if (data) {
                    // resource is a notebook cell
                    notebookUri = this.uriIdentService.asCanonicalUri(data.notebook);
                    cellOptions = { resource, options };
                }
                else {
                    notebookUri = this.uriIdentService.asCanonicalUri(resource);
                }
                if (!cellOptions) {
                    cellOptions = options?.cellOptions;
                }
                let notebookOptions;
                if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
                    if (data?.handle === undefined || !data?.notebook) {
                        throw new Error('Invalid cell handle');
                    }
                    const cellUri = CellUri.generate(data.notebook, data.handle);
                    cellOptions = { resource: cellUri, options };
                    const cellIndex = await this._notebookEditorModelResolverService.resolve(notebookUri)
                        .then(model => model.object.notebook.cells.findIndex(cell => cell.handle === data?.handle))
                        .then(index => index >= 0 ? index : 0);
                    const cellIndexesToRanges = [{ start: cellIndex, end: cellIndex + 1 }];
                    notebookOptions = {
                        ...options,
                        cellOptions,
                        viewState: undefined,
                        cellSelections: cellIndexesToRanges
                    };
                }
                else {
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
            const notebookUntitledEditorFactory = async ({ resource, options }) => {
                const ref = await this._notebookEditorModelResolverService.resolve({ untitledResource: resource }, notebookProviderInfo.id);
                // untitled notebooks are disposed when they get saved. we should not hold a reference
                // to such a disposed notebook and therefore dispose the reference as well
                Event.once(ref.object.notebook.onWillDispose)(() => {
                    ref.dispose();
                });
                return { editor: NotebookEditorInput.getOrCreate(this._instantiationService, ref.object.resource, undefined, notebookProviderInfo.id), options };
            };
            const notebookDiffEditorInputFactory = (diffEditorInput, group) => {
                const { modified, original, label, description } = diffEditorInput;
                if (this._configurationService.getValue('notebook.experimental.enableNewDiffEditor')) {
                    return { editor: NotebookMultiDiffEditorInput.create(this._instantiationService, modified.resource, label, description, original.resource, notebookProviderInfo.id) };
                }
                return { editor: NotebookDiffEditorInput.create(this._instantiationService, modified.resource, label, description, original.resource, notebookProviderInfo.id) };
            };
            const mergeEditorInputFactory = (mergeEditor) => {
                return {
                    editor: this._instantiationService.createInstance(MergeEditorInput, mergeEditor.base.resource, {
                        uri: mergeEditor.input1.resource,
                        title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
                        description: mergeEditor.input1.description ?? '',
                        detail: mergeEditor.input1.detail
                    }, {
                        uri: mergeEditor.input2.resource,
                        title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
                        description: mergeEditor.input2.description ?? '',
                        detail: mergeEditor.input2.detail
                    }, mergeEditor.result.resource)
                };
            };
            const notebookFactoryObject = {
                createEditorInput: notebookEditorInputFactory,
                createDiffEditorInput: notebookDiffEditorInputFactory,
                createUntitledEditorInput: notebookUntitledEditorFactory,
                createMergeEditorInput: mergeEditorInputFactory
            };
            const notebookCellFactoryObject = {
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
                    }
                    else {
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
                }
                else {
                    notebookFactoryObject.createDiffEditorInput = undefined;
                    notebookCellFactoryObject.createDiffEditorInput = undefined;
                }
            }));
            // Register the notebook editor
            disposables.add(this._editorResolverService.registerEditor(globPattern, notebookEditorInfo, notebookEditorOptions, notebookFactoryObject));
            // Then register the schema handler as exclusive for that notebook
            disposables.add(this._editorResolverService.registerEditor(`${Schemas.vscodeNotebookCell}:/**/${globPattern}`, { ...notebookEditorInfo, priority: RegisteredEditorPriority.exclusive }, notebookEditorOptions, notebookCellFactoryObject));
        }
        return disposables;
    }
    _clear() {
        this._contributedEditors.clear();
        this._contributedEditorDisposables.clear();
    }
    get(viewType) {
        return this._contributedEditors.get(viewType);
    }
    add(info, saveMemento = true) {
        if (this._contributedEditors.has(info.id)) {
            throw new Error(`notebook type '${info.id}' ALREADY EXISTS`);
        }
        this._contributedEditors.set(info.id, info);
        let editorRegistration;
        // built-in notebook providers contribute their own editors
        if (info.extension) {
            editorRegistration = this._registerContributionPoint(info);
            this._contributedEditorDisposables.add(editorRegistration);
        }
        if (saveMemento) {
            const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            mementoObject[NotebookProviderInfoStore_1.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
            this._memento.saveMemento();
        }
        return this._register(toDisposable(() => {
            const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            mementoObject[NotebookProviderInfoStore_1.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
            this._memento.saveMemento();
            editorRegistration?.dispose();
            this._contributedEditors.delete(info.id);
        }));
    }
    getContributedNotebook(resource) {
        const result = [];
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
    [Symbol.iterator]() {
        return this._contributedEditors.values();
    }
};
NotebookProviderInfoStore = NotebookProviderInfoStore_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IExtensionService),
    __param(2, IEditorResolverService),
    __param(3, IConfigurationService),
    __param(4, IAccessibilityService),
    __param(5, IInstantiationService),
    __param(6, IFileService),
    __param(7, INotebookEditorModelResolverService),
    __param(8, IUriIdentityService)
], NotebookProviderInfoStore);
export { NotebookProviderInfoStore };
let NotebookOutputRendererInfoStore = class NotebookOutputRendererInfoStore {
    constructor(storageService) {
        this.contributedRenderers = new Map();
        this.preferredMimetype = new Lazy(() => this.preferredMimetypeMemento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */));
        this.preferredMimetypeMemento = new Memento('workbench.editor.notebook.preferredRenderer2', storageService);
    }
    clear() {
        this.contributedRenderers.clear();
    }
    get(rendererId) {
        return this.contributedRenderers.get(rendererId);
    }
    getAll() {
        return Array.from(this.contributedRenderers.values());
    }
    add(info) {
        if (this.contributedRenderers.has(info.id)) {
            return;
        }
        this.contributedRenderers.set(info.id, info);
    }
    /** Update and remember the preferred renderer for the given mimetype in this workspace */
    setPreferred(notebookProviderInfo, mimeType, rendererId) {
        const mementoObj = this.preferredMimetype.value;
        const forNotebook = mementoObj[notebookProviderInfo.id];
        if (forNotebook) {
            forNotebook[mimeType] = rendererId;
        }
        else {
            mementoObj[notebookProviderInfo.id] = { [mimeType]: rendererId };
        }
        this.preferredMimetypeMemento.saveMemento();
    }
    findBestRenderers(notebookProviderInfo, mimeType, kernelProvides) {
        let ReuseOrder;
        (function (ReuseOrder) {
            ReuseOrder[ReuseOrder["PreviouslySelected"] = 256] = "PreviouslySelected";
            ReuseOrder[ReuseOrder["SameExtensionAsNotebook"] = 512] = "SameExtensionAsNotebook";
            ReuseOrder[ReuseOrder["OtherRenderer"] = 768] = "OtherRenderer";
            ReuseOrder[ReuseOrder["BuiltIn"] = 1024] = "BuiltIn";
        })(ReuseOrder || (ReuseOrder = {}));
        const preferred = notebookProviderInfo && this.preferredMimetype.value[notebookProviderInfo.id]?.[mimeType];
        const notebookExtId = notebookProviderInfo?.extension?.value;
        const notebookId = notebookProviderInfo?.id;
        const renderers = Array.from(this.contributedRenderers.values())
            .map(renderer => {
            const ownScore = kernelProvides === undefined
                ? renderer.matchesWithoutKernel(mimeType)
                : renderer.matches(mimeType, kernelProvides);
            if (ownScore === 3 /* NotebookRendererMatch.Never */) {
                return undefined;
            }
            const rendererExtId = renderer.extensionId.value;
            const reuseScore = preferred === renderer.id
                ? 256 /* ReuseOrder.PreviouslySelected */
                : rendererExtId === notebookExtId || RENDERER_EQUIVALENT_EXTENSIONS.get(rendererExtId)?.has(notebookId)
                    ? 512 /* ReuseOrder.SameExtensionAsNotebook */
                    : renderer.isBuiltin ? 1024 /* ReuseOrder.BuiltIn */ : 768 /* ReuseOrder.OtherRenderer */;
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
};
NotebookOutputRendererInfoStore = __decorate([
    __param(0, IStorageService)
], NotebookOutputRendererInfoStore);
export { NotebookOutputRendererInfoStore };
class ModelData {
    get uri() { return this.model.uri; }
    constructor(model, onWillDispose) {
        this.model = model;
        this._modelEventListeners = new DisposableStore();
        this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
    }
    getCellIndex(cellUri) {
        return this.model.cells.findIndex(cell => isEqual(cell.uri, cellUri));
    }
    dispose() {
        this._modelEventListeners.dispose();
    }
}
let NotebookService = class NotebookService extends Disposable {
    static { NotebookService_1 = this; }
    static { this._storageNotebookViewTypeProvider = 'notebook.viewTypeProvider'; }
    get notebookProviderInfoStore() {
        if (!this._notebookProviderInfoStore) {
            this._notebookProviderInfoStore = this._register(this._instantiationService.createInstance(NotebookProviderInfoStore));
        }
        return this._notebookProviderInfoStore;
    }
    constructor(_extensionService, _configurationService, _accessibilityService, _instantiationService, _storageService, _notebookDocumentService) {
        super();
        this._extensionService = _extensionService;
        this._configurationService = _configurationService;
        this._accessibilityService = _accessibilityService;
        this._instantiationService = _instantiationService;
        this._storageService = _storageService;
        this._notebookDocumentService = _notebookDocumentService;
        this._notebookProviders = new Map();
        this._notebookProviderInfoStore = undefined;
        this._notebookRenderersInfoStore = this._instantiationService.createInstance(NotebookOutputRendererInfoStore);
        this._onDidChangeOutputRenderers = this._register(new Emitter());
        this.onDidChangeOutputRenderers = this._onDidChangeOutputRenderers.event;
        this._notebookStaticPreloadInfoStore = new Set();
        this._models = new ResourceMap();
        this._onWillAddNotebookDocument = this._register(new Emitter());
        this._onDidAddNotebookDocument = this._register(new Emitter());
        this._onWillRemoveNotebookDocument = this._register(new Emitter());
        this._onDidRemoveNotebookDocument = this._register(new Emitter());
        this.onWillAddNotebookDocument = this._onWillAddNotebookDocument.event;
        this.onDidAddNotebookDocument = this._onDidAddNotebookDocument.event;
        this.onDidRemoveNotebookDocument = this._onDidRemoveNotebookDocument.event;
        this.onWillRemoveNotebookDocument = this._onWillRemoveNotebookDocument.event;
        this._onAddViewType = this._register(new Emitter());
        this.onAddViewType = this._onAddViewType.event;
        this._onWillRemoveViewType = this._register(new Emitter());
        this.onWillRemoveViewType = this._onWillRemoveViewType.event;
        this._onDidChangeEditorTypes = this._register(new Emitter());
        this.onDidChangeEditorTypes = this._onDidChangeEditorTypes.event;
        this._lastClipboardIsCopy = true;
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
            this._displayOrder = new MimeTypeDisplayOrder(this._configurationService.getValue(NotebookSetting.displayOrder) || [], this._accessibilityService.isScreenReaderOptimized()
                ? ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER
                : NOTEBOOK_DISPLAY_ORDER);
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
        this._memento = new Memento(NotebookService_1._storageNotebookViewTypeProvider, this._storageService);
        this._viewTypeCache = this._memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    getEditorTypes() {
        return [...this.notebookProviderInfoStore].map(info => ({
            id: info.id,
            displayName: info.displayName,
            providerDisplayName: info.providerDisplayName
        }));
    }
    clearEditorCache() {
        this.notebookProviderInfoStore.clearEditorCache();
    }
    _postDocumentOpenActivation(viewType) {
        // send out activations on notebook text model creation
        this._extensionService.activateByEvent(`onNotebook:${viewType}`);
        this._extensionService.activateByEvent(`onNotebook:*`);
    }
    async canResolve(viewType) {
        if (this._notebookProviders.has(viewType)) {
            return true;
        }
        await this._extensionService.whenInstalledExtensionsRegistered();
        await this._extensionService.activateByEvent(`onNotebookSerializer:${viewType}`);
        return this._notebookProviders.has(viewType);
    }
    registerContributedNotebookType(viewType, data) {
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
    _registerProviderData(viewType, data) {
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
    registerNotebookSerializer(viewType, extensionData, serializer) {
        this.notebookProviderInfoStore.get(viewType)?.update({ options: serializer.options });
        this._viewTypeCache[viewType] = extensionData.id.value;
        this._persistMementos();
        return this._registerProviderData(viewType, new SimpleNotebookProviderInfo(viewType, serializer, extensionData));
    }
    async withNotebookDataProvider(viewType) {
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
    tryGetDataProviderSync(viewType) {
        const selected = this.notebookProviderInfoStore.get(viewType);
        if (!selected) {
            return undefined;
        }
        return this._notebookProviders.get(selected.id);
    }
    _persistMementos() {
        this._memento.saveMemento();
    }
    getViewTypeProvider(viewType) {
        return this._viewTypeCache[viewType];
    }
    getRendererInfo(rendererId) {
        return this._notebookRenderersInfoStore.get(rendererId);
    }
    updateMimePreferredRenderer(viewType, mimeType, rendererId, otherMimetypes) {
        const info = this.notebookProviderInfoStore.get(viewType);
        if (info) {
            this._notebookRenderersInfoStore.setPreferred(info, mimeType, rendererId);
        }
        this._displayOrder.prioritize(mimeType, otherMimetypes);
    }
    saveMimeDisplayOrder(target) {
        this._configurationService.updateValue(NotebookSetting.displayOrder, this._displayOrder.toArray(), target);
    }
    getRenderers() {
        return this._notebookRenderersInfoStore.getAll();
    }
    *getStaticPreloads(viewType) {
        for (const preload of this._notebookStaticPreloadInfoStore) {
            if (preload.type === viewType) {
                yield preload;
            }
        }
    }
    // --- notebook documents: create, destory, retrieve, enumerate
    async createNotebookTextModel(viewType, uri, stream) {
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
    async createNotebookTextDocumentSnapshot(uri, context, token) {
        const model = this.getNotebookTextModel(uri);
        if (!model) {
            throw new Error(`notebook for ${uri} doesn't exist`);
        }
        const info = await this.withNotebookDataProvider(model.viewType);
        if (!(info instanceof SimpleNotebookProviderInfo)) {
            throw new Error('CANNOT open file notebook with this provider');
        }
        const serializer = info.serializer;
        const outputSizeLimit = this._configurationService.getValue(NotebookSetting.outputBackupSizeLimit) * 1024;
        const data = model.createSnapshot({ context: context, outputSizeLimit: outputSizeLimit, transientOptions: serializer.options });
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
    async restoreNotebookTextModelFromSnapshot(uri, viewType, snapshot) {
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
    getNotebookTextModel(uri) {
        return this._models.get(uri)?.model;
    }
    getNotebookTextModels() {
        return Iterable.map(this._models.values(), data => data.model);
    }
    listNotebookDocuments() {
        return [...this._models].map(e => e[1].model);
    }
    _onWillDisposeDocument(model) {
        const modelData = this._models.get(model.uri);
        if (modelData) {
            this._onWillRemoveNotebookDocument.fire(modelData.model);
            this._models.delete(model.uri);
            this._notebookDocumentService.removeNotebookDocument(modelData);
            modelData.dispose();
            this._onDidRemoveNotebookDocument.fire(modelData.model);
        }
    }
    getOutputMimeTypeInfo(textModel, kernelProvides, output) {
        const sorted = this._displayOrder.sort(new Set(output.outputs.map(op => op.mime)));
        const notebookProviderInfo = this.notebookProviderInfoStore.get(textModel.viewType);
        return sorted
            .flatMap(mimeType => this._notebookRenderersInfoStore.findBestRenderers(notebookProviderInfo, mimeType, kernelProvides))
            .sort((a, b) => (a.rendererId === RENDERER_NOT_AVAILABLE ? 1 : 0) - (b.rendererId === RENDERER_NOT_AVAILABLE ? 1 : 0));
    }
    getContributedNotebookTypes(resource) {
        if (resource) {
            return this.notebookProviderInfoStore.getContributedNotebook(resource);
        }
        return [...this.notebookProviderInfoStore];
    }
    hasSupportedNotebooks(resource) {
        if (this._models.has(resource)) {
            // it might be untitled
            return true;
        }
        const contribution = this.notebookProviderInfoStore.getContributedNotebook(resource);
        if (!contribution.length) {
            return false;
        }
        return contribution.some(info => info.matches(resource) &&
            (info.priority === RegisteredEditorPriority.default || info.priority === RegisteredEditorPriority.exclusive));
    }
    getContributedNotebookType(viewType) {
        return this.notebookProviderInfoStore.get(viewType);
    }
    getNotebookProviderResourceRoots() {
        const ret = [];
        this._notebookProviders.forEach(val => {
            if (val.extensionData.location) {
                ret.push(URI.revive(val.extensionData.location));
            }
        });
        return ret;
    }
    // --- copy & paste
    setToCopy(items, isCopy) {
        this._cutItems = items;
        this._lastClipboardIsCopy = isCopy;
    }
    getToCopy() {
        if (this._cutItems) {
            return { items: this._cutItems, isCopy: this._lastClipboardIsCopy };
        }
        return undefined;
    }
};
NotebookService = NotebookService_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IConfigurationService),
    __param(2, IAccessibilityService),
    __param(3, IInstantiationService),
    __param(4, IStorageService),
    __param(5, INotebookDocumentService)
], NotebookService);
export { NotebookService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTZXJ2aWNlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tTZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRTNILE9BQU8sRUFBRSxZQUFZ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