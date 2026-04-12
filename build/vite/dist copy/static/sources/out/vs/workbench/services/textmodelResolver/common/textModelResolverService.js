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
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { toDisposable, ReferenceCollection, Disposable, AsyncReferenceCollection } from '../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { TextResourceEditorModel } from '../../../common/editor/textResourceEditorModel.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { Schemas } from '../../../../base/common/network.js';
import { ITextModelService, isResolvedTextEditorModel } from '../../../../editor/common/services/resolverService.js';
import { TextFileEditorModel } from '../../textfile/common/textFileEditorModel.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { ModelUndoRedoParticipant } from '../../../../editor/common/services/modelUndoRedoParticipant.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { UntitledTextEditorModel } from '../../untitled/common/untitledTextEditorModel.js';
let ResourceModelCollection = class ResourceModelCollection extends ReferenceCollection {
    constructor(instantiationService, textFileService, fileService, modelService) {
        super();
        this.instantiationService = instantiationService;
        this.textFileService = textFileService;
        this.fileService = fileService;
        this.modelService = modelService;
        this.providers = new Map();
        this.modelsToDispose = new Map();
    }
    createReferencedObject(key) {
        return this.doCreateReferencedObject(key);
    }
    async doCreateReferencedObject(key, skipActivateProvider) {
        const resource = URI.parse(key);
        // Untrack as being disposed
        const pendingModel = this.modelsToDispose.get(key);
        this.modelsToDispose.delete(key);
        // Untitled Schema: go through untitled text service
        if (resource.scheme === Schemas.untitled) {
            const model = await this.textFileService.untitled.resolve({ untitledResource: resource });
            if (this.ensureResolvedModel(model, key)) {
                return model;
            }
        }
        // File or remote file: go through text file service
        if (this.fileService.hasProvider(resource)) {
            const model = await this.textFileService.files.resolve(resource, { reason: 2 /* TextFileResolveReason.REFERENCE */ });
            if (this.ensureResolvedModel(model, key)) {
                return model;
            }
        }
        // In-Memory / Virtual documents
        if (resource.scheme === Schemas.inMemory || this.providers.has(resource.scheme)) {
            await this.ensureResolvedTextModelContent(resource); // throws if failing to resolve content
            let model = undefined;
            if (pendingModel) {
                try {
                    // if we have a pending model for this key, we try to await that and prevent
                    // creating a new model so that we are not leaking models. we only do this for
                    // in-memory or virtual documents where we create models here, the others are
                    // already shared by their respective services.
                    model = await pendingModel;
                }
                catch {
                    // ignore and re-create below
                }
            }
            if (!model) {
                model = this.instantiationService.createInstance(TextResourceEditorModel, resource);
            }
            if (this.ensureResolvedModel(model, key)) {
                return model;
            }
        }
        // Either unknown schema, or not yet registered, try to activate
        if (!skipActivateProvider) {
            await this.fileService.activateProvider(resource.scheme);
            return this.doCreateReferencedObject(key, true);
        }
        throw new Error(`Unable to resolve resource ${key}`);
    }
    ensureResolvedModel(model, key) {
        if (isResolvedTextEditorModel(model)) {
            return true;
        }
        throw new Error(`Unable to resolve resource ${key}`);
    }
    destroyReferencedObject(key, modelPromise) {
        // Track as being disposed before waiting for model to load
        // to handle the case that the reference is acquired again
        this.modelsToDispose.set(key, modelPromise);
        (async () => {
            try {
                const model = await modelPromise;
                if (!this.modelsToDispose.has(key)) {
                    // return if model has been acquired again meanwhile
                    return;
                }
                if (model instanceof TextFileEditorModel) {
                    // text file models have conditions that prevent them
                    // from dispose, so we have to wait until we can dispose
                    await this.textFileService.files.canDispose(model);
                }
                else if (model instanceof UntitledTextEditorModel) {
                    // untitled file models have conditions that prevent them
                    // from dispose, so we have to wait until we can dispose
                    await this.textFileService.untitled.canDispose(model);
                }
                if (!this.modelsToDispose.has(key)) {
                    // return if model has been acquired again meanwhile
                    return;
                }
                // Finally we can dispose the model
                model.dispose();
            }
            catch (error) {
                // ignore
            }
            finally {
                this.modelsToDispose.delete(key); // Untrack as being disposed
            }
        })();
    }
    registerTextModelContentProvider(scheme, provider) {
        let providers = this.providers.get(scheme);
        if (!providers) {
            providers = [];
            this.providers.set(scheme, providers);
        }
        providers.unshift(provider);
        return toDisposable(() => {
            const providersForScheme = this.providers.get(scheme);
            if (!providersForScheme) {
                return;
            }
            const index = providersForScheme.indexOf(provider);
            if (index === -1) {
                return;
            }
            providersForScheme.splice(index, 1);
            if (providersForScheme.length === 0) {
                this.providers.delete(scheme);
            }
        });
    }
    hasTextModelContentProvider(scheme) {
        return this.providers.get(scheme) !== undefined;
    }
    async ensureResolvedTextModelContent(resource) {
        // in-memory based
        if (resource.scheme === Schemas.inMemory) {
            if (this.modelService.getModel(resource)) {
                return;
            }
        }
        // provider based
        const providersForScheme = this.providers.get(resource.scheme) || [];
        for (const provider of providersForScheme) {
            if (await provider.provideTextContent(resource)) {
                return;
            }
        }
        throw new Error(`Unable to resolve text model content for resource ${resource.toString()}`);
    }
};
ResourceModelCollection = __decorate([
    __param(0, IInstantiationService),
    __param(1, ITextFileService),
    __param(2, IFileService),
    __param(3, IModelService)
], ResourceModelCollection);
let TextModelResolverService = class TextModelResolverService extends Disposable {
    get resourceModelCollection() {
        if (!this._resourceModelCollection) {
            this._resourceModelCollection = this.instantiationService.createInstance(ResourceModelCollection);
        }
        return this._resourceModelCollection;
    }
    get asyncModelCollection() {
        if (!this._asyncModelCollection) {
            this._asyncModelCollection = new AsyncReferenceCollection(this.resourceModelCollection);
        }
        return this._asyncModelCollection;
    }
    constructor(instantiationService, fileService, undoRedoService, modelService, uriIdentityService) {
        super();
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.undoRedoService = undoRedoService;
        this.modelService = modelService;
        this.uriIdentityService = uriIdentityService;
        this._resourceModelCollection = undefined;
        this._asyncModelCollection = undefined;
        this._register(new ModelUndoRedoParticipant(this.modelService, this, this.undoRedoService));
    }
    async createModelReference(resource) {
        // From this moment on, only operate on the canonical resource
        // to ensure we reduce the chance of resolving the same resource
        // with different resource forms (e.g. path casing on Windows)
        resource = this.uriIdentityService.asCanonicalUri(resource);
        return await this.asyncModelCollection.acquire(resource.toString());
    }
    registerTextModelContentProvider(scheme, provider) {
        return this.resourceModelCollection.registerTextModelContentProvider(scheme, provider);
    }
    canHandleResource(resource) {
        if (this.fileService.hasProvider(resource) || resource.scheme === Schemas.untitled || resource.scheme === Schemas.inMemory) {
            return true; // we handle file://, untitled:// and inMemory:// automatically
        }
        return this.resourceModelCollection.hasTextModelContentProvider(resource.scheme);
    }
};
TextModelResolverService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IFileService),
    __param(2, IUndoRedoService),
    __param(3, IModelService),
    __param(4, IUriIdentityService)
], TextModelResolverService);
export { TextModelResolverService };
registerSingleton(ITextModelService, TextModelResolverService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRtb2RlbFJlc29sdmVyL2NvbW1vbi90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBZSxZQUFZLEVBQWMsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEosT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBeUIsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGlCQUFpQixFQUF5RSx5QkFBeUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVMLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDMUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RB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