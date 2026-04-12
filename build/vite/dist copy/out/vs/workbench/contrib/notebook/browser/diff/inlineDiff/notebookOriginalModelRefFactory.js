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
import { AsyncReferenceCollection, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { INotebookService } from '../../../common/notebookService.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
export const INotebookOriginalModelReferenceFactory = createDecorator('INotebookOriginalModelReferenceFactory');
let OriginalNotebookModelReferenceCollection = class OriginalNotebookModelReferenceCollection extends ReferenceCollection {
    constructor(notebookService, modelService) {
        super();
        this.notebookService = notebookService;
        this.modelService = modelService;
        this.modelsToDispose = new Set();
    }
    async createReferencedObject(key, fileEntry, viewType) {
        this.modelsToDispose.delete(key);
        const uri = fileEntry.originalURI;
        const model = this.notebookService.getNotebookTextModel(uri);
        if (model) {
            return model;
        }
        const modelRef = await this.modelService.createModelReference(uri);
        const bytes = VSBuffer.fromString(modelRef.object.textEditorModel.getValue());
        const stream = bufferToStream(bytes);
        modelRef.dispose();
        return this.notebookService.createNotebookTextModel(viewType, uri, stream);
    }
    destroyReferencedObject(key, modelPromise) {
        this.modelsToDispose.add(key);
        (async () => {
            try {
                const model = await modelPromise;
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
};
OriginalNotebookModelReferenceCollection = __decorate([
    __param(0, INotebookService),
    __param(1, ITextModelService)
], OriginalNotebookModelReferenceCollection);
export { OriginalNotebookModelReferenceCollection };
let NotebookOriginalModelReferenceFactory = class NotebookOriginalModelReferenceFactory {
    get resourceModelCollection() {
        if (!this._resourceModelCollection) {
            this._resourceModelCollection = this.instantiationService.createInstance(OriginalNotebookModelReferenceCollection);
        }
        return this._resourceModelCollection;
    }
    get asyncModelCollection() {
        if (!this._asyncModelCollection) {
            this._asyncModelCollection = new AsyncReferenceCollection(this.resourceModelCollection);
        }
        return this._asyncModelCollection;
    }
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
        this._resourceModelCollection = undefined;
        this._asyncModelCollection = undefined;
    }
    getOrCreate(fileEntry, viewType) {
        return this.asyncModelCollection.acquire(fileEntry.originalURI.toString(), fileEntry, viewType);
    }
};
NotebookOriginalModelReferenceFactory = __decorate([
    __param(0, IInstantiationService)
], NotebookOriginalModelReferenceFactory);
export { NotebookOriginalModelReferenceFactory };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPcmlnaW5hbE1vZGVsUmVmRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rT3JpZ2luYWxNb2RlbFJlZkZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFjLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFdkgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVuRixPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDMUgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFHaEcsTUFBTSxDQUFDLE1BQU0sc0NBQXNDLEdBQUcsZUFBZSxDQUF5Qyx3Q0FBd0MsQ0FBQyxDQUFDO0FBUWpKLElBQU0sd0NBQXdDLEdBQTlDLE1BQU0sd0NBQXlDLFNBQVEsbUJBQStDO0lBRTVHLFlBQThCLGVBQWtELEVBQzVELFlBQWdEO1FBRW5FLEtBQUssRUFBRSxDQUFDO1FBSHNDLG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtRQUMzQyxpQkFBWSxHQUFaLFlBQVksQ0FBbUI7UUFGbkQsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBS3JELENBQUM7SUFFa0IsS0FBSyxDQUFDLHNCQUFzQixDQUFDLEdBQVcsRUFBRSxTQUE2QixFQUFFLFFBQWdCO1FBQzNHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sR0FB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