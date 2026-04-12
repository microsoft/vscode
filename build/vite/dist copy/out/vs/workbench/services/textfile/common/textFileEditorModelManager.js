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
import { localize } from '../../../../nls.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { TextFileEditorModel } from './textFileEditorModel.js';
import { dispose, Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Promises, ResourceQueue } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { TextFileSaveParticipant } from './textFileSaveParticipant.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkingCopyFileService } from '../../workingCopy/common/workingCopyFileService.js';
import { extname, joinPath } from '../../../../base/common/resources.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { PLAINTEXT_EXTENSION, PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
let TextFileEditorModelManager = class TextFileEditorModelManager extends Disposable {
    get models() {
        return [...this.mapResourceToModel.values()];
    }
    constructor(instantiationService, fileService, notificationService, workingCopyFileService, uriIdentityService) {
        super();
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.notificationService = notificationService;
        this.workingCopyFileService = workingCopyFileService;
        this.uriIdentityService = uriIdentityService;
        this._onDidCreate = this._register(new Emitter({ leakWarningThreshold: 500 /* increased for users with hundreds of inputs opened */ }));
        this.onDidCreate = this._onDidCreate.event;
        this._onDidResolve = this._register(new Emitter());
        this.onDidResolve = this._onDidResolve.event;
        this._onDidRemove = this._register(new Emitter());
        this.onDidRemove = this._onDidRemove.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidChangeReadonly = this._register(new Emitter());
        this.onDidChangeReadonly = this._onDidChangeReadonly.event;
        this._onDidChangeOrphaned = this._register(new Emitter());
        this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
        this._onDidSaveError = this._register(new Emitter());
        this.onDidSaveError = this._onDidSaveError.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidRevert = this._register(new Emitter());
        this.onDidRevert = this._onDidRevert.event;
        this._onDidChangeEncoding = this._register(new Emitter());
        this.onDidChangeEncoding = this._onDidChangeEncoding.event;
        this.mapResourceToModel = new ResourceMap();
        this.mapResourceToModelListeners = new ResourceMap();
        this.mapResourceToDisposeListener = new ResourceMap();
        this.mapResourceToPendingModelResolvers = new ResourceMap();
        this.modelResolveQueue = this._register(new ResourceQueue());
        this.saveErrorHandler = (() => {
            const notificationService = this.notificationService;
            return {
                onSaveError(error, model) {
                    notificationService.error(localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", model.name, toErrorMessage(error, false)));
                }
            };
        })();
        this.mapCorrelationIdToModelsToRestore = new Map();
        this.saveParticipants = this._register(this.instantiationService.createInstance(TextFileSaveParticipant));
        this.registerListeners();
    }
    registerListeners() {
        // Update models from file change events
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
        // File system provider changes
        this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProviderCapabilities(e)));
        this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProviderRegistrations(e)));
        // Working copy operations
        this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => this.onWillRunWorkingCopyFileOperation(e)));
        this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation(e => this.onDidFailWorkingCopyFileOperation(e)));
        this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this.onDidRunWorkingCopyFileOperation(e)));
    }
    onDidFilesChange(e) {
        for (const model of this.models) {
            if (model.isDirty()) {
                continue; // never reload dirty models
            }
            // Trigger a model resolve for any update or add event that impacts
            // the model. We also consider the added event because it could
            // be that a file was added and updated right after.
            if (e.contains(model.resource, 0 /* FileChangeType.UPDATED */, 1 /* FileChangeType.ADDED */)) {
                this.queueModelReload(model);
            }
        }
    }
    onDidChangeFileSystemProviderCapabilities(e) {
        // Resolve models again for file systems that changed
        // capabilities to fetch latest metadata (e.g. readonly)
        // into all models.
        this.queueModelReloads(e.scheme);
    }
    onDidChangeFileSystemProviderRegistrations(e) {
        if (!e.added) {
            return; // only if added
        }
        // Resolve models again for file systems that registered
        // to account for capability changes: extensions may
        // unregister and register the same provider with different
        // capabilities, so we want to ensure to fetch latest
        // metadata (e.g. readonly) into all models.
        this.queueModelReloads(e.scheme);
    }
    queueModelReloads(scheme) {
        for (const model of this.models) {
            if (model.isDirty()) {
                continue; // never reload dirty models
            }
            if (scheme === model.resource.scheme) {
                this.queueModelReload(model);
            }
        }
    }
    queueModelReload(model) {
        // Resolve model to update (use a queue to prevent accumulation of resolves
        // when the resolve actually takes long. At most we only want the queue
        // to have a size of 2 (1 running resolve and 1 queued resolve).
        const queueSize = this.modelResolveQueue.queueSize(model.resource);
        if (queueSize <= 1) {
            this.modelResolveQueue.queueFor(model.resource, async () => {
                try {
                    await this.reload(model);
                }
                catch (error) {
                    onUnexpectedError(error);
                }
            });
        }
    }
    onWillRunWorkingCopyFileOperation(e) {
        // Move / Copy: remember models to restore after the operation
        if (e.operation === 2 /* FileOperation.MOVE */ || e.operation === 3 /* FileOperation.COPY */) {
            const modelsToRestore = [];
            for (const { source, target } of e.files) {
                if (source) {
                    if (this.uriIdentityService.extUri.isEqual(source, target)) {
                        continue; // ignore if resources are considered equal
                    }
                    // find all models that related to source (can be many if resource is a folder)
                    const sourceModels = [];
                    for (const model of this.models) {
                        if (this.uriIdentityService.extUri.isEqualOrParent(model.resource, source)) {
                            sourceModels.push(model);
                        }
                    }
                    // remember each source model to resolve again after move is done
                    // with optional content to restore if it was dirty
                    for (const sourceModel of sourceModels) {
                        const sourceModelResource = sourceModel.resource;
                        // If the source is the actual model, just use target as new resource
                        let targetModelResource;
                        if (this.uriIdentityService.extUri.isEqual(sourceModelResource, source)) {
                            targetModelResource = target;
                        }
                        // Otherwise a parent folder of the source is being moved, so we need
                        // to compute the target resource based on that
                        else {
                            targetModelResource = joinPath(target, sourceModelResource.path.substr(source.path.length + 1));
                        }
                        const languageId = sourceModel.getLanguageId();
                        modelsToRestore.push({
                            source: sourceModelResource,
                            target: targetModelResource,
                            language: languageId ? {
                                id: languageId,
                                explicit: sourceModel.languageChangeSource === 'user'
                            } : undefined,
                            encoding: sourceModel.getEncoding(),
                            snapshot: sourceModel.isDirty() ? sourceModel.createSnapshot() : undefined
                        });
                    }
                }
            }
            this.mapCorrelationIdToModelsToRestore.set(e.correlationId, modelsToRestore);
        }
    }
    onDidFailWorkingCopyFileOperation(e) {
        // Move / Copy: restore dirty flag on models to restore that were dirty
        if ((e.operation === 2 /* FileOperation.MOVE */ || e.operation === 3 /* FileOperation.COPY */)) {
            const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
            if (modelsToRestore) {
                this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);
                modelsToRestore.forEach(model => {
                    // snapshot presence means this model used to be dirty and so we restore that
                    // flag. we do NOT have to restore the content because the model was only soft
                    // reverted and did not loose its original dirty contents.
                    if (model.snapshot) {
                        this.get(model.source)?.setDirty(true);
                    }
                });
            }
        }
    }
    onDidRunWorkingCopyFileOperation(e) {
        switch (e.operation) {
            // Create: Revert existing models
            case 0 /* FileOperation.CREATE */:
                e.waitUntil((async () => {
                    for (const { target } of e.files) {
                        const model = this.get(target);
                        if (model && !model.isDisposed()) {
                            await model.revert();
                        }
                    }
                })());
                break;
            // Move/Copy: restore models that were resolved before the operation took place
            case 2 /* FileOperation.MOVE */:
            case 3 /* FileOperation.COPY */:
                e.waitUntil((async () => {
                    const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
                    if (modelsToRestore) {
                        this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);
                        await Promises.settled(modelsToRestore.map(async (modelToRestore) => {
                            // From this moment on, only operate on the canonical resource
                            // to fix a potential data loss issue:
                            // https://github.com/microsoft/vscode/issues/211374
                            const target = this.uriIdentityService.asCanonicalUri(modelToRestore.target);
                            // restore the model at the target. if we have previous dirty content, we pass it
                            // over to be used, otherwise we force a reload from disk. this is important
                            // because we know the file has changed on disk after the move and the model might
                            // have still existed with the previous state. this ensures that the model is not
                            // tracking a stale state.
                            const restoredModel = await this.resolve(target, {
                                reload: { async: false }, // enforce a reload
                                contents: modelToRestore.snapshot ? createTextBufferFactoryFromSnapshot(modelToRestore.snapshot) : undefined,
                                encoding: modelToRestore.encoding
                            });
                            // restore model language only if it is specific
                            if (modelToRestore.language?.id && modelToRestore.language.id !== PLAINTEXT_LANGUAGE_ID) {
                                // an explicitly set language is restored via `setLanguageId`
                                // to preserve it as explicitly set by the user.
                                // (https://github.com/microsoft/vscode/issues/203648)
                                if (modelToRestore.language.explicit) {
                                    restoredModel.setLanguageId(modelToRestore.language.id);
                                }
                                // otherwise, a model language is applied via lower level
                                // APIs to not confuse it with an explicitly set language.
                                // (https://github.com/microsoft/vscode/issues/125795)
                                else if (restoredModel.getLanguageId() === PLAINTEXT_LANGUAGE_ID && extname(target) !== PLAINTEXT_EXTENSION) {
                                    restoredModel.updateTextEditorModel(undefined, modelToRestore.language.id);
                                }
                            }
                        }));
                    }
                })());
                break;
        }
    }
    get(resource) {
        return this.mapResourceToModel.get(resource);
    }
    has(resource) {
        return this.mapResourceToModel.has(resource);
    }
    async reload(model) {
        // Await a pending model resolve first before proceeding
        // to ensure that we never resolve a model more than once
        // in parallel.
        await this.joinPendingResolves(model.resource);
        if (model.isDirty() || model.isDisposed() || !this.has(model.resource)) {
            return; // the model possibly got dirty or disposed, so return early then
        }
        // Trigger reload
        await this.doResolve(model, { reload: { async: false } });
    }
    async resolve(resource, options) {
        // Await a pending model resolve first before proceeding
        // to ensure that we never resolve a model more than once
        // in parallel.
        const pendingResolve = this.joinPendingResolves(resource);
        if (pendingResolve) {
            await pendingResolve;
        }
        // Trigger resolve
        return this.doResolve(resource, options);
    }
    async doResolve(resourceOrModel, options) {
        let model;
        let resource;
        if (URI.isUri(resourceOrModel)) {
            resource = resourceOrModel;
            model = this.get(resource);
        }
        else {
            resource = resourceOrModel.resource;
            model = resourceOrModel;
        }
        let modelResolve;
        let didCreateModel = false;
        // Model exists
        if (model) {
            // Always reload if contents are provided
            if (options?.contents) {
                modelResolve = model.resolve(options);
            }
            // Reload async or sync based on options
            else if (options?.reload) {
                // async reload: trigger a reload but return immediately
                if (options.reload.async) {
                    modelResolve = Promise.resolve();
                    (async () => {
                        try {
                            await model.resolve(options);
                        }
                        catch (error) {
                            if (!model.isDisposed()) {
                                onUnexpectedError(error); // only log if the model is still around
                            }
                        }
                    })();
                }
                // sync reload: do not return until model reloaded
                else {
                    modelResolve = model.resolve(options);
                }
            }
            // Do not reload
            else {
                modelResolve = Promise.resolve();
            }
        }
        // Model does not exist
        else {
            didCreateModel = true;
            const newModel = model = this.instantiationService.createInstance(TextFileEditorModel, resource, options ? options.encoding : undefined, options ? options.languageId : undefined);
            modelResolve = model.resolve(options);
            this.registerModel(newModel);
        }
        // Store pending resolves to avoid race conditions
        this.mapResourceToPendingModelResolvers.set(resource, modelResolve);
        // Make known to manager (if not already known)
        this.add(resource, model);
        // Emit some events if we created the model
        if (didCreateModel) {
            this._onDidCreate.fire(model);
            // If the model is dirty right from the beginning,
            // make sure to emit this as an event
            if (model.isDirty()) {
                this._onDidChangeDirty.fire(model);
            }
        }
        try {
            await modelResolve;
        }
        catch (error) {
            // Automatically dispose the model if we created it
            // because we cannot dispose a model we do not own
            // https://github.com/microsoft/vscode/issues/138850
            if (didCreateModel) {
                model.dispose();
            }
            throw error;
        }
        finally {
            // Remove from pending resolves
            this.mapResourceToPendingModelResolvers.delete(resource);
        }
        // Apply language if provided
        if (options?.languageId) {
            model.setLanguageId(options.languageId);
        }
        // Model can be dirty if a backup was restored, so we make sure to
        // have this event delivered if we created the model here
        if (didCreateModel && model.isDirty()) {
            this._onDidChangeDirty.fire(model);
        }
        return model;
    }
    joinPendingResolves(resource) {
        const pendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
        if (!pendingModelResolve) {
            return;
        }
        return this.doJoinPendingResolves(resource);
    }
    async doJoinPendingResolves(resource) {
        // While we have pending model resolves, ensure
        // to await the last one finishing before returning.
        // This prevents a race when multiple clients await
        // the pending resolve and then all trigger the resolve
        // at the same time.
        let currentModelCopyResolve;
        while (this.mapResourceToPendingModelResolvers.has(resource)) {
            const nextPendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
            if (nextPendingModelResolve === currentModelCopyResolve) {
                return; // already awaited on - return
            }
            currentModelCopyResolve = nextPendingModelResolve;
            try {
                await nextPendingModelResolve;
            }
            catch (error) {
                // ignore any error here, it will bubble to the original requestor
            }
        }
    }
    registerModel(model) {
        // Install model listeners
        const modelListeners = new DisposableStore();
        modelListeners.add(model.onDidResolve(reason => this._onDidResolve.fire({ model, reason })));
        modelListeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire(model)));
        modelListeners.add(model.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(model)));
        modelListeners.add(model.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(model)));
        modelListeners.add(model.onDidSaveError(() => this._onDidSaveError.fire(model)));
        modelListeners.add(model.onDidSave(e => this._onDidSave.fire({ model, ...e })));
        modelListeners.add(model.onDidRevert(() => this._onDidRevert.fire(model)));
        modelListeners.add(model.onDidChangeEncoding(() => this._onDidChangeEncoding.fire(model)));
        // Keep for disposal
        this.mapResourceToModelListeners.set(model.resource, modelListeners);
    }
    add(resource, model) {
        const knownModel = this.mapResourceToModel.get(resource);
        if (knownModel === model) {
            return; // already cached
        }
        // dispose any previously stored dispose listener for this resource
        const disposeListener = this.mapResourceToDisposeListener.get(resource);
        disposeListener?.dispose();
        // store in cache but remove when model gets disposed
        this.mapResourceToModel.set(resource, model);
        this.mapResourceToDisposeListener.set(resource, model.onWillDispose(() => this.remove(resource)));
    }
    remove(resource) {
        const removed = this.mapResourceToModel.delete(resource);
        const disposeListener = this.mapResourceToDisposeListener.get(resource);
        if (disposeListener) {
            dispose(disposeListener);
            this.mapResourceToDisposeListener.delete(resource);
        }
        const modelListener = this.mapResourceToModelListeners.get(resource);
        if (modelListener) {
            dispose(modelListener);
            this.mapResourceToModelListeners.delete(resource);
        }
        if (removed) {
            this._onDidRemove.fire(resource);
        }
    }
    addSaveParticipant(participant) {
        return this.saveParticipants.addSaveParticipant(participant);
    }
    runSaveParticipants(model, context, progress, token) {
        return this.saveParticipants.participate(model, context, progress, token);
    }
    //#endregion
    canDispose(model) {
        // quick return if model already disposed or not dirty and not resolving
        if (model.isDisposed() ||
            (!this.mapResourceToPendingModelResolvers.has(model.resource) && !model.isDirty())) {
            return true;
        }
        // promise based return in all other cases
        return this.doCanDispose(model);
    }
    async doCanDispose(model) {
        // Await any pending resolves first before proceeding
        const pendingResolve = this.joinPendingResolves(model.resource);
        if (pendingResolve) {
            await pendingResolve;
            return this.canDispose(model);
        }
        // dirty model: we do not allow to dispose dirty models to prevent
        // data loss cases. dirty models can only be disposed when they are
        // either saved or reverted
        if (model.isDirty()) {
            await Event.toPromise(model.onDidChangeDirty);
            return this.canDispose(model);
        }
        return true;
    }
    dispose() {
        super.dispose();
        // model caches
        this.mapResourceToModel.clear();
        this.mapResourceToPendingModelResolvers.clear();
        // dispose the dispose listeners
        dispose(this.mapResourceToDisposeListener.values());
        this.mapResourceToDisposeListener.clear();
        // dispose the model change listeners
        dispose(this.mapResourceToModelListeners.values());
        this.mapResourceToModelListeners.clear();
    }
};
TextFileEditorModelManager = __decorate([
    __param(0, IInstantiationService),
    __param(1, IFileService),
    __param(2, INotificationService),
    __param(3, IWorkingCopyFileService),
    __param(4, IUriIdentityService)
], TextFileEditorModelManager);
export { TextFileEditorModelManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBZSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxZQUFZLEVBQXFJLE1BQU0sNENBQTRDLENBQUM7QUFDN00sT0FBTyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQWdELHVCQUF1QixFQUF3QixNQUFNLG9EQUFvRCxDQUFDO0FBRWpLLE9B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