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
import { ResourceMap } from '../../../../base/common/map.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { isTextFileEditorModel, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { Disposable, DisposableMap, DisposableStore, ReferenceCollection } from '../../../../base/common/lifecycle.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { shouldSynchronizeModel } from '../../../../editor/common/model.js';
import { compareChanges, getModifiedEndLineNumber, IQuickDiffService } from '../common/quickDiff.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { ISCMService } from '../common/scm.js';
import { sortedDiff, equals } from '../../../../base/common/arrays.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DiffState } from '../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { toLineChanges } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IChatEditingService } from '../../chat/common/editing/chatEditingService.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
export const IQuickDiffModelService = createDecorator('IQuickDiffModelService');
const decoratorQuickDiffModelOptions = {
    algorithm: 'advanced',
    maxComputationTimeMs: 1000
};
let QuickDiffModelReferenceCollection = class QuickDiffModelReferenceCollection extends ReferenceCollection {
    constructor(_instantiationService) {
        super();
        this._instantiationService = _instantiationService;
    }
    createReferencedObject(_key, textFileModel, options) {
        return this._instantiationService.createInstance(QuickDiffModel, textFileModel, options);
    }
    destroyReferencedObject(_key, object) {
        object.dispose();
    }
};
QuickDiffModelReferenceCollection = __decorate([
    __param(0, IInstantiationService)
], QuickDiffModelReferenceCollection);
let QuickDiffModelService = class QuickDiffModelService {
    constructor(instantiationService, textFileService, uriIdentityService) {
        this.instantiationService = instantiationService;
        this.textFileService = textFileService;
        this.uriIdentityService = uriIdentityService;
        this._references = this.instantiationService.createInstance(QuickDiffModelReferenceCollection);
    }
    createQuickDiffModelReference(resource, options = decoratorQuickDiffModelOptions) {
        const textFileModel = this.textFileService.files.get(resource);
        if (!textFileModel?.isResolved()) {
            return undefined;
        }
        resource = this.uriIdentityService.asCanonicalUri(resource).with({ query: JSON.stringify(options) });
        return this._references.acquire(resource.toString(), textFileModel, options);
    }
};
QuickDiffModelService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ITextFileService),
    __param(2, IUriIdentityService)
], QuickDiffModelService);
export { QuickDiffModelService };
let QuickDiffModel = class QuickDiffModel extends Disposable {
    get originalTextModels() {
        return Iterable.map(this._originalEditorModels.values(), editorModel => editorModel.textEditorModel);
    }
    get allChanges() { return this._allChanges; }
    get changes() { return this._changes; }
    get quickDiffChanges() { return this._quickDiffChanges; }
    constructor(textFileModel, options, scmService, quickDiffService, editorWorkerService, configurationService, textModelResolverService, _chatEditingService, progressService, environmentService) {
        super();
        this.options = options;
        this.scmService = scmService;
        this.quickDiffService = quickDiffService;
        this.editorWorkerService = editorWorkerService;
        this.configurationService = configurationService;
        this.textModelResolverService = textModelResolverService;
        this._chatEditingService = _chatEditingService;
        this.progressService = progressService;
        this.environmentService = environmentService;
        this._originalEditorModels = new ResourceMap();
        this._originalEditorModelsDisposables = this._register(new DisposableStore());
        this._disposed = false;
        this._quickDiffs = [];
        this._diffDelayer = this._register(new ThrottledDelayer(200));
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._allChanges = [];
        this._changes = [];
        /**
         * Map of quick diff name to the index of the change in `this.changes`
         */
        this._quickDiffChanges = new Map();
        this._repositoryDisposables = new DisposableMap();
        this._model = textFileModel;
        this._register(textFileModel.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
        this._register(Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsIgnoreTrimWhitespace') || e.affectsConfiguration('diffEditor.ignoreTrimWhitespace'))(this.triggerDiff, this));
        this._register(scmService.onDidAddRepository(this.onDidAddRepository, this));
        for (const r of scmService.repositories) {
            this.onDidAddRepository(r);
        }
        this._register(this._model.onDidChangeEncoding(() => {
            this._diffDelayer.cancel();
            this._quickDiffs = [];
            this._originalEditorModels.clear();
            this._quickDiffsPromise = undefined;
            this.setChanges([], [], new Map());
            this.triggerDiff();
        }));
        this._register(this.quickDiffService.onDidChangeQuickDiffProviders(() => this.triggerDiff()));
        this._register(autorun(reader => {
            for (const session of this._chatEditingService.editingSessionsObs.read(reader)) {
                reader.store.add(autorun(r => {
                    for (const entry of session.entries.read(r)) {
                        entry.state.read(r); // signal
                    }
                    this.triggerDiff();
                }));
            }
        }));
        this.triggerDiff();
    }
    get quickDiffs() {
        return this._quickDiffs;
    }
    getQuickDiffResults() {
        return this._quickDiffs.map(quickDiff => {
            const changes = this.allChanges
                .filter(change => change.providerId === quickDiff.id);
            return {
                providerId: quickDiff.id,
                providerKind: quickDiff.kind,
                original: quickDiff.originalResource,
                modified: this._model.resource,
                changes: changes.map(change => change.change),
                changes2: changes.map(change => change.change2)
            };
        });
    }
    getDiffEditorModel(originalUri) {
        const editorModel = this._originalEditorModels.get(originalUri);
        return editorModel ?
            {
                modified: this._model.textEditorModel,
                original: editorModel.textEditorModel
            } : undefined;
    }
    onDidAddRepository(repository) {
        const disposables = new DisposableStore();
        disposables.add(repository.provider.onDidChangeResources(this.triggerDiff, this));
        const onDidRemoveRepository = Event.filter(this.scmService.onDidRemoveRepository, r => r === repository);
        disposables.add(onDidRemoveRepository(() => this._repositoryDisposables.deleteAndDispose(repository)));
        this._repositoryDisposables.set(repository, disposables);
        this.triggerDiff();
    }
    triggerDiff() {
        if (!this._diffDelayer) {
            return;
        }
        this._diffDelayer
            .trigger(async () => {
            const result = await this.diff();
            const editorModels = Array.from(this._originalEditorModels.values());
            if (!result || this._disposed || this._model.isDisposed() || editorModels.some(editorModel => editorModel.isDisposed())) {
                return; // disposed
            }
            this.setChanges(result.allChanges, result.changes, result.mapChanges);
        })
            .catch(err => onUnexpectedError(err));
    }
    setChanges(allChanges, changes, mapChanges) {
        const diff = sortedDiff(this.changes, changes, (a, b) => compareChanges(a.change, b.change));
        this._allChanges = allChanges;
        this._changes = changes;
        this._quickDiffChanges = mapChanges;
        this._onDidChange.fire({ changes, diff });
    }
    diff() {
        const location = this.environmentService.isSessionsWindow ? 10 /* ProgressLocation.Window */ : 3 /* ProgressLocation.Scm */;
        return this.progressService.withProgress({ location, delay: 250 }, async () => {
            const originalURIs = await this.getQuickDiffsPromise();
            if (this._disposed || this._model.isDisposed() || (originalURIs.length === 0)) {
                // Disposed
                return Promise.resolve({ allChanges: [], changes: [], mapChanges: new Map() });
            }
            const quickDiffs = originalURIs
                .filter(quickDiff => this.editorWorkerService.canComputeDirtyDiff(quickDiff.originalResource, this._model.resource));
            if (quickDiffs.length === 0) {
                // All files are too large
                return Promise.resolve({ allChanges: [], changes: [], mapChanges: new Map() });
            }
            const quickDiffPrimary = quickDiffs.find(quickDiff => quickDiff.kind === 'primary');
            const ignoreTrimWhitespaceSetting = this.configurationService.getValue('scm.diffDecorationsIgnoreTrimWhitespace');
            const ignoreTrimWhitespace = ignoreTrimWhitespaceSetting === 'inherit'
                ? this.configurationService.getValue('diffEditor.ignoreTrimWhitespace')
                : ignoreTrimWhitespaceSetting !== 'false';
            const diffs = [];
            const secondaryDiffs = [];
            for (const quickDiff of quickDiffs) {
                const diff = await this._diff(quickDiff.originalResource, this._model.resource, ignoreTrimWhitespace);
                if (diff.changes && diff.changes2 && diff.changes.length === diff.changes2.length) {
                    for (let index = 0; index < diff.changes.length; index++) {
                        const change2 = diff.changes2[index];
                        // The secondary diffs are complimentary to the primary diffs, and
                        // they can overlap. We need to remove the secondary quick diffs that
                        // overlap for the UI, but we need to expose all diffs through the API.
                        if (quickDiffPrimary && quickDiff.kind === 'secondary') {
                            // Check whether the:
                            // 1. the modified line range is equal
                            // 2. the original line range length is equal
                            const primaryQuickDiffChange = diffs
                                .find(d => d.change2.modified.equals(change2.modified) &&
                                d.change2.original.length === change2.original.length);
                            if (primaryQuickDiffChange) {
                                // Check whether the original content matches
                                const primaryModel = this._originalEditorModels.get(quickDiffPrimary.originalResource)?.textEditorModel;
                                const primaryContent = primaryModel?.getValueInRange(primaryQuickDiffChange.change2.toRangeMapping().originalRange);
                                const secondaryModel = this._originalEditorModels.get(quickDiff.originalResource)?.textEditorModel;
                                const secondaryContent = secondaryModel?.getValueInRange(change2.toRangeMapping().originalRange);
                                if (primaryContent === secondaryContent) {
                                    secondaryDiffs.push({
                                        providerId: quickDiff.id,
                                        original: quickDiff.originalResource,
                                        modified: this._model.resource,
                                        change: diff.changes[index],
                                        change2: diff.changes2[index]
                                    });
                                    continue;
                                }
                            }
                        }
                        diffs.push({
                            providerId: quickDiff.id,
                            original: quickDiff.originalResource,
                            modified: this._model.resource,
                            change: diff.changes[index],
                            change2: diff.changes2[index]
                        });
                    }
                }
            }
            const diffsSorted = diffs.sort((a, b) => compareChanges(a.change, b.change));
            const allDiffsSorted = [...diffs, ...secondaryDiffs].sort((a, b) => compareChanges(a.change, b.change));
            const map = new Map();
            for (let i = 0; i < diffsSorted.length; i++) {
                const providerId = diffsSorted[i].providerId;
                if (!map.has(providerId)) {
                    map.set(providerId, []);
                }
                map.get(providerId).push(i);
            }
            return { allChanges: allDiffsSorted, changes: diffsSorted, mapChanges: map };
        });
    }
    async _diff(original, modified, ignoreTrimWhitespace) {
        const maxComputationTimeMs = this.options.maxComputationTimeMs ?? Number.MAX_SAFE_INTEGER;
        const result = await this.editorWorkerService.computeDiff(original, modified, {
            computeMoves: false, ignoreTrimWhitespace, maxComputationTimeMs
        }, this.options.algorithm);
        return { changes: result ? toLineChanges(DiffState.fromDiffResult(result)) : null, changes2: result?.changes ?? null };
    }
    getQuickDiffsPromise() {
        if (this._quickDiffsPromise) {
            return this._quickDiffsPromise;
        }
        this._quickDiffsPromise = this.getOriginalResource().then(async (quickDiffs) => {
            if (this._disposed) { // disposed
                return [];
            }
            if (quickDiffs.length === 0) {
                this._quickDiffs = [];
                this._originalEditorModels.clear();
                return [];
            }
            if (equals(this._quickDiffs, quickDiffs, (a, b) => a.id === b.id &&
                a.originalResource.toString() === b.originalResource.toString() &&
                this.quickDiffService.isQuickDiffProviderVisible(a.id) === this.quickDiffService.isQuickDiffProviderVisible(b.id))) {
                return quickDiffs;
            }
            this._quickDiffs = quickDiffs;
            this._originalEditorModels.clear();
            this._originalEditorModelsDisposables.clear();
            return (await Promise.all(quickDiffs.map(async (quickDiff) => {
                try {
                    const ref = await this.textModelResolverService.createModelReference(quickDiff.originalResource);
                    if (this._disposed) { // disposed
                        ref.dispose();
                        return [];
                    }
                    this._originalEditorModels.set(quickDiff.originalResource, ref.object);
                    if (isTextFileEditorModel(ref.object) && !ref.object.isDirty()) {
                        const encoding = this._model.getEncoding();
                        if (encoding) {
                            ref.object.setEncoding(encoding, 1 /* EncodingMode.Decode */);
                        }
                    }
                    this._originalEditorModelsDisposables.add(ref);
                    this._originalEditorModelsDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
                    return quickDiff;
                }
                catch (error) {
                    return []; // possibly invalid reference
                }
            }))).flat();
        });
        return this._quickDiffsPromise.finally(() => {
            this._quickDiffsPromise = undefined;
        });
    }
    async getOriginalResource() {
        if (this._disposed) {
            return Promise.resolve([]);
        }
        const uri = this._model.resource;
        // disable dirty diff when doing chat edits
        const isBeingModifiedByChatEdits = this._chatEditingService.editingSessionsObs.get()
            .some(session => session.getEntry(uri)?.state.get() === 0 /* ModifiedFileEntryState.Modified */);
        if (isBeingModifiedByChatEdits) {
            return Promise.resolve([]);
        }
        const isSynchronized = this._model.textEditorModel ? shouldSynchronizeModel(this._model.textEditorModel) : undefined;
        return this.quickDiffService.getQuickDiffs(uri, this._model.getLanguageId(), isSynchronized);
    }
    findNextClosestChange(lineNumber, inclusive = true, providerId) {
        const visibleQuickDiffIds = new Set(this.quickDiffs
            .filter(quickDiff => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id))
            .map(quickDiff => quickDiff.id));
        for (let i = 0; i < this.changes.length; i++) {
            if (providerId && this.changes[i].providerId !== providerId) {
                continue;
            }
            // Skip quick diffs that are not visible
            if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
                continue;
            }
            const change = this.changes[i].change;
            if (inclusive) {
                if (getModifiedEndLineNumber(change) >= lineNumber) {
                    return i;
                }
            }
            else {
                if (change.modifiedStartLineNumber > lineNumber) {
                    return i;
                }
            }
        }
        return 0;
    }
    findPreviousClosestChange(lineNumber, inclusive = true, providerId) {
        const visibleQuickDiffIds = new Set(this.quickDiffs
            .filter(quickDiff => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id))
            .map(quickDiff => quickDiff.id));
        for (let i = this.changes.length - 1; i >= 0; i--) {
            if (providerId && this.changes[i].providerId !== providerId) {
                continue;
            }
            // Skip quick diffs that are not visible
            if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
                continue;
            }
            const change = this.changes[i].change;
            if (inclusive) {
                if (change.modifiedStartLineNumber <= lineNumber) {
                    return i;
                }
            }
            else {
                if (getModifiedEndLineNumber(change) < lineNumber) {
                    return i;
                }
            }
        }
        return this.changes.length - 1;
    }
    dispose() {
        this._disposed = true;
        this._quickDiffs = [];
        this._diffDelayer.cancel();
        this._originalEditorModels.clear();
        this._repositoryDisposables.dispose();
        super.dispose();
    }
};
QuickDiffModel = __decorate([
    __param(2, ISCMService),
    __param(3, IQuickDiffService),
    __param(4, IEditorWorkerService),
    __param(5, IConfigurationService),
    __param(6, ITextModelService),
    __param(7, IChatEditingService),
    __param(8, IProgressService),
    __param(9, IWorkbenchEnvironmentService)
], QuickDiffModel);
export { QuickDiffModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tEaWZmTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9xdWlja0RpZmZNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3BILE9BQU8sRUFBOEMscUJBQXFCLEVBQXdCLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDM0ssT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFjLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkksT0FBTyxFQUFxQixvQkFBb0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRzdGLE9BQU8sRUFBNEIsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNwSCxPQUFPLEVBQWMsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsY0FBYyxFQUFFLHdCQUF3QixFQUFFLGlCQUFpQixFQUErQyxNQUFNLHdCQUF3QixDQUFDO0FBQ2xKLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBa0IsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUdqRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQW9CLE1BQU0sa0RBQWtELENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUEwQixNQUFNLGlEQUFpRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTFHLE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGVBQWUsQ0FBeUIsd0JBQXdCLENBQUMsQ0FBQztBQU94RyxNQUFNLDhCQUE4QixHQUEwQjtJQUM3RCxTQUFTLEVBQUUsVUFBVTtJQUNyQixvQkFBb0IsRUFBRSxJQUFJO0NBQzFCLENBQUM7QUFjRixJQUFNLGlDQUFpQyxHQUF2QyxNQUFNLGlDQUFrQyxTQUFRLG1CQUFtQztJQUNsRixZQUFvRCxxQkFBNEM7UUFDL0YsS0FBSyxFQUFFLENBQUM7UUFEMkMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtJQUVoRyxDQUFDO0lBRWtCLHNCQUFzQixDQUFDLElBQVksRUFBRSxhQUEyQyxFQUFFLE9BQThCO1FBQ2xJLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzFGLENBQUM7SUFFa0IsdUJBQXVCLENBQUMsSUFBWSxFQUFFLE1BQXNCO1FBQzlFLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNsQixDQUFDO0NBQ0QsQ0FBQTtBQVpLLGlDQUFpQztJQUN6QixXQUFBLHFCQUFxQixDQUFBO0dBRDdCLGlDQUFpQyxDQVl0QztBQUVNLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCO0lBS2pDLFlBQ3lDLG9CQUEyQyxFQUNoRCxlQUFpQyxFQUM5QixrQkFBdUM7UUFGckMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUNoRCxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFDOUIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUU3RSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUNoRyxDQUFDO0lBRUQsNkJBQTZCLENBQUMsUUFBYSxFQUFFLFVBQWlDLDhCQUE4QjtRQUMzRyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ2xDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxRQUFRLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckcsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzlFLENBQUM7Q0FDRCxDQUFBO0FBdEJZLHFCQUFxQjtJQU0vQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZ0JBQWdCLENBQUE7SUFDaEIsV0FBQSxtQkFBbUIsQ0FBQTtHQVJULHFCQUFxQixDQXNCakM7O0FBRU0sSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBZSxTQUFRLFVBQVU7SUFLN0MsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUN0RyxDQUFDO0lBV0QsSUFBSSxVQUFVLEtBQXdCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFHaEUsSUFBSSxPQUFPLEtBQXdCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFNMUQsSUFBSSxnQkFBZ0IsS0FBNEIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBSWhGLFlBQ0MsYUFBMkMsRUFDMUIsT0FBOEIsRUFDbEMsVUFBd0MsRUFDbEMsZ0JBQW9ELEVBQ2pELG1CQUEwRCxFQUN6RCxvQkFBNEQsRUFDaEUsd0JBQTRELEVBQzFELG1CQUF5RCxFQUM1RCxlQUFrRCxFQUN0QyxrQkFBaUU7UUFFL0YsS0FBSyxFQUFFLENBQUM7UUFWUyxZQUFPLEdBQVAsT0FBTyxDQUF1QjtRQUNqQixlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ2pCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDaEMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtRQUN4Qyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQy9DLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBbUI7UUFDekMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUMzQyxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFDckIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUE4QjtRQXRDL0UsMEJBQXFCLEdBQUcsSUFBSSxXQUFXLEVBQTRCLENBQUM7UUFDcEUscUNBQWdDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFLbEYsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUNsQixnQkFBVyxHQUFnQixFQUFFLENBQUM7UUFFOUIsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQU8sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUV0RCxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW9FLENBQUMsQ0FBQztRQUN2SCxnQkFBVyxHQUE0RSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUVoSCxnQkFBVyxHQUFzQixFQUFFLENBQUM7UUFHcEMsYUFBUSxHQUFzQixFQUFFLENBQUM7UUFHekM7O1dBRUc7UUFDSyxzQkFBaUIsR0FBMEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUc1QywyQkFBc0IsR0FBRyxJQUFJLGFBQWEsRUFBa0IsQ0FBQztRQWU3RSxJQUFJLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQztRQUU1QixJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRixJQUFJLENBQUMsU0FBUyxDQUNiLEtBQUssQ0FBQyxNQUFNLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLEVBQ3pELENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLHlDQUF5QyxDQUFDLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLGlDQUFpQyxDQUFDLENBQ25JLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FDekIsQ0FBQztRQUNGLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdFLEtBQUssTUFBTSxDQUFDLElBQUksVUFBVSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsRUFBRTtZQUNuRCxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsU0FBUyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDbkMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTlGLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNoRixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQzVCLEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDN0MsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO29CQUMvQixDQUFDO29CQUNELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxJQUFJLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVNLG1CQUFtQjtRQUN6QixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ3ZDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVO2lCQUM3QixNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2RCxPQUFPO2dCQUNOLFVBQVUsRUFBRSxTQUFTLENBQUMsRUFBRTtnQkFDeEIsWUFBWSxFQUFFLFNBQVMsQ0FBQyxJQUFJO2dCQUM1QixRQUFRLEVBQUUsU0FBUyxDQUFDLGdCQUFnQjtnQkFDcEMsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUTtnQkFDOUIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUM3QyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7YUFDckIsQ0FBQztRQUM3QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxXQUFnQjtRQUN6QyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sV0FBVyxDQUFDLENBQUM7WUFDbkI7Z0JBQ0MsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZ0I7Z0JBQ3RDLFFBQVEsRUFBRSxXQUFXLENBQUMsZUFBZTthQUNyQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDaEIsQ0FBQztJQUVPLGtCQUFrQixDQUFDLFVBQTBCO1FBQ3BELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFMUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVsRixNQUFNLHFCQUFxQixHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxVQUFVLENBQUMsQ0FBQztRQUN6RyxXQUFXLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdkcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFekQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFFTyxXQUFXO1FBQ2xCLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWTthQUNmLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRTtZQUNuQixNQUFNLE1BQU0sR0FBNEcsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFMUksTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUNyRSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDekgsT0FBTyxDQUFDLFdBQVc7WUFDcEIsQ0FBQztZQUVELElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUM7YUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFTyxVQUFVLENBQUMsVUFBNkIsRUFBRSxPQUEwQixFQUFFLFVBQWlDO1FBQzlHLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQzdGLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1FBQzlCLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxVQUFVLENBQUM7UUFDcEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRU8sSUFBSTtRQUNYLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLGtDQUF5QixDQUFDLDZCQUFxQixDQUFDO1FBQzNHLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdFLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDdkQsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQy9FLFdBQVc7Z0JBQ1gsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNoRixDQUFDO1lBRUQsTUFBTSxVQUFVLEdBQUcsWUFBWTtpQkFDN0IsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDdEgsSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM3QiwwQkFBMEI7Z0JBQzFCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDaEYsQ0FBQztZQUVELE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLENBQUM7WUFFcEYsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUErQix5Q0FBeUMsQ0FBQyxDQUFDO1lBQ2hKLE1BQU0sb0JBQW9CLEdBQUcsMkJBQTJCLEtBQUssU0FBUztnQkFDckUsQ0FBQyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsaUNBQWlDLENBQUM7Z0JBQ2hGLENBQUMsQ0FBQywyQkFBMkIsS0FBSyxPQUFPLENBQUM7WUFFM0MsTUFBTSxLQUFLLEdBQXNCLEVBQUUsQ0FBQztZQUNwQyxNQUFNLGNBQWMsR0FBc0IsRUFBRSxDQUFDO1lBRTdDLEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztnQkFDdEcsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDbkYsS0FBSyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7d0JBQzFELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBRXJDLGtFQUFrRTt3QkFDbEUscUVBQXFFO3dCQUNyRSx1RUFBdUU7d0JBQ3ZFLElBQUksZ0JBQWdCLElBQUksU0FBUyxDQUFDLElBQUksS0FBSyxXQUFXLEVBQUUsQ0FBQzs0QkFDeEQscUJBQXFCOzRCQUNyQixzQ0FBc0M7NEJBQ3RDLDZDQUE2Qzs0QkFDN0MsTUFBTSxzQkFBc0IsR0FBRyxLQUFLO2lDQUNsQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQztnQ0FDckQsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7NEJBRXpELElBQUksc0JBQXNCLEVBQUUsQ0FBQztnQ0FDNUIsNkNBQTZDO2dDQUM3QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLEVBQUUsZUFBZSxDQUFDO2dDQUN4RyxNQUFNLGNBQWMsR0FBRyxZQUFZLEVBQUUsZUFBZSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQ0FFcEgsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxlQUFlLENBQUM7Z0NBQ25HLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUM7Z0NBQ2pHLElBQUksY0FBYyxLQUFLLGdCQUFnQixFQUFFLENBQUM7b0NBQ3pDLGNBQWMsQ0FBQyxJQUFJLENBQUM7d0NBQ25CLFVBQVUsRUFBRSxTQUFTLENBQUMsRUFBRTt3Q0FDeEIsUUFBUSxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0I7d0NBQ3BDLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVE7d0NBQzlCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQzt3Q0FDM0IsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO3FDQUM3QixDQUFDLENBQUM7b0NBRUgsU0FBUztnQ0FDVixDQUFDOzRCQUNGLENBQUM7d0JBQ0YsQ0FBQzt3QkFFRCxLQUFLLENBQUMsSUFBSSxDQUFDOzRCQUNWLFVBQVUsRUFBRSxTQUFTLENBQUMsRUFBRTs0QkFDeEIsUUFBUSxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0I7NEJBQ3BDLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVE7NEJBQzlCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQzs0QkFDM0IsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO3lCQUM3QixDQUFDLENBQUM7b0JBQ0osQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUM3RSxNQUFNLGNBQWMsR0FBRyxDQUFDLEdBQUcsS0FBSyxFQUFFLEdBQUcsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFFeEcsTUFBTSxHQUFHLEdBQTBCLElBQUksR0FBRyxFQUFFLENBQUM7WUFDN0MsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDN0MsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDMUIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7Z0JBQ0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUVELE9BQU8sRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQzlFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBYSxFQUFFLFFBQWEsRUFBRSxvQkFBNkI7UUFDOUUsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQixJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztRQUUxRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRTtZQUM3RSxZQUFZLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLG9CQUFvQjtTQUMvRCxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFM0IsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUN4SCxDQUFDO0lBRU8sb0JBQW9CO1FBQzNCLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDN0IsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUM7UUFDaEMsQ0FBQztRQUVELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxFQUFFO1lBQzlFLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsV0FBVztnQkFDaEMsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1lBRUQsSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNuQyxPQUFPLEVBQUUsQ0FBQztZQUNYLENBQUM7WUFFRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUNqRCxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxFQUFFO2dCQUNiLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFO2dCQUMvRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDakgsQ0FBQztnQkFDRixPQUFPLFVBQVUsQ0FBQztZQUNuQixDQUFDO1lBRUQsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7WUFFOUIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM5QyxPQUFPLENBQUMsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxFQUFFO2dCQUM1RCxJQUFJLENBQUM7b0JBQ0osTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ2pHLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsV0FBVzt3QkFDaEMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUNkLE9BQU8sRUFBRSxDQUFDO29CQUNYLENBQUM7b0JBRUQsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUV2RSxJQUFJLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQzt3QkFDaEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQzt3QkFFM0MsSUFBSSxRQUFRLEVBQUUsQ0FBQzs0QkFDYixHQUFHLENBQUMsTUFBK0IsQ0FBQyxXQUFXLENBQUMsUUFBUSw4QkFBc0IsQ0FBQzt3QkFDakYsQ0FBQztvQkFDRixDQUFDO29CQUVELElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQy9DLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFFbkgsT0FBTyxTQUFTLENBQUM7Z0JBQ2xCLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDaEIsT0FBTyxFQUFFLENBQUMsQ0FBQyw2QkFBNkI7Z0JBQ3pDLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDYixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUU7WUFDM0MsSUFBSSxDQUFDLGtCQUFrQixHQUFHLFNBQVMsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxLQUFLLENBQUMsbUJBQW1CO1FBQ2hDLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1QixDQUFDO1FBQ0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFFakMsMkNBQTJDO1FBQzNDLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTthQUNsRixJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsNENBQW9DLENBQUMsQ0FBQztRQUMxRixJQUFJLDBCQUEwQixFQUFFLENBQUM7WUFDaEMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3JILE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUM5RixDQUFDO0lBRUQscUJBQXFCLENBQUMsVUFBa0IsRUFBRSxTQUFTLEdBQUcsSUFBSSxFQUFFLFVBQW1CO1FBQzlFLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVU7YUFDakQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNuRixHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVsQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM5QyxJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBSyxVQUFVLEVBQUUsQ0FBQztnQkFDN0QsU0FBUztZQUNWLENBQUM7WUFFRCx3Q0FBd0M7WUFDeEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQzFELFNBQVM7WUFDVixDQUFDO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFFdEMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixJQUFJLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNwRCxPQUFPLENBQUMsQ0FBQztnQkFDVixDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksTUFBTSxDQUFDLHVCQUF1QixHQUFHLFVBQVUsRUFBRSxDQUFDO29CQUNqRCxPQUFPLENBQUMsQ0FBQztnQkFDVixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFRCx5QkFBeUIsQ0FBQyxVQUFrQixFQUFFLFNBQVMsR0FBRyxJQUFJLEVBQUUsVUFBbUI7UUFDbEYsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVTthQUNqRCxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ25GLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxDLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNuRCxJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBSyxVQUFVLEVBQUUsQ0FBQztnQkFDN0QsU0FBUztZQUNWLENBQUM7WUFFRCx3Q0FBd0M7WUFDeEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQzFELFNBQVM7WUFDVixDQUFDO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFFdEMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixJQUFJLE1BQU0sQ0FBQyx1QkFBdUIsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDbEQsT0FBTyxDQUFDLENBQUM7Z0JBQ1YsQ0FBQztZQUNGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsRUFBRSxDQUFDO29CQUNuRCxPQUFPLENBQUMsQ0FBQztnQkFDVixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUV0QyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztDQUNELENBQUE7QUFsWlksY0FBYztJQWtDeEIsV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLDRCQUE0QixDQUFBO0dBekNsQixjQUFjLENBa1oxQiJ9