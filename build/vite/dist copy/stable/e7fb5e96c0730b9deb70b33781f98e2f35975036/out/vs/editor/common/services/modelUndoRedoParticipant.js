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
import { IModelService } from './model.js';
import { ITextModelService } from './resolverService.js';
import { Disposable, dispose } from '../../../base/common/lifecycle.js';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo.js';
import { MultiModelEditStackElement } from '../model/editStack.js';
let ModelUndoRedoParticipant = class ModelUndoRedoParticipant extends Disposable {
    constructor(_modelService, _textModelService, _undoRedoService) {
        super();
        this._modelService = _modelService;
        this._textModelService = _textModelService;
        this._undoRedoService = _undoRedoService;
        this._register(this._modelService.onModelRemoved((model) => {
            // a model will get disposed, so let's check if the undo redo stack is maintained
            const elements = this._undoRedoService.getElements(model.uri);
            if (elements.past.length === 0 && elements.future.length === 0) {
                return;
            }
            for (const element of elements.past) {
                if (element instanceof MultiModelEditStackElement) {
                    element.setDelegate(this);
                }
            }
            for (const element of elements.future) {
                if (element instanceof MultiModelEditStackElement) {
                    element.setDelegate(this);
                }
            }
        }));
    }
    prepareUndoRedo(element) {
        // Load all the needed text models
        const missingModels = element.getMissingModels();
        if (missingModels.length === 0) {
            // All models are available!
            return Disposable.None;
        }
        const disposablesPromises = missingModels.map(async (uri) => {
            try {
                const reference = await this._textModelService.createModelReference(uri);
                return reference;
            }
            catch (err) {
                // This model could not be loaded, maybe it was deleted in the meantime?
                return Disposable.None;
            }
        });
        return Promise.all(disposablesPromises).then(disposables => {
            return {
                dispose: () => dispose(disposables)
            };
        });
    }
};
ModelUndoRedoParticipant = __decorate([
    __param(0, IModelService),
    __param(1, ITextModelService),
    __param(2, IUndoRedoService)
], ModelUndoRedoParticipant);
export { ModelUndoRedoParticipant };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxVbmRvUmVkb1BhcnRpY2lwYW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFVuZG9SZWRvUGFydGljaXBhbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMzQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pGLE9BQU8sRUFBcUIsMEJBQTBCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUUvRSxJQUFNLHdCQUF3QixHQUE5QixNQUFNLHdCQUF5QixTQUFRLFVBQVU7SUFDdkQsWUFDaUMsYUFBNEIsRUFDeEIsaUJBQW9DLEVBQ3JDLGdCQUFrQztRQUVyRSxLQUFLLEVBQUUsQ0FBQztRQUp3QixrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUN4QixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBQ3JDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFHckUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQzFELGlGQUFpRjtZQUNqRixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM5RCxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDaEUsT0FBTztZQUNSLENBQUM7WUFDRCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxPQUFPLFlBQVksMEJBQTBCLEVBQUUsQ0FBQztvQkFDbkQsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDM0IsQ0FBQztZQUNGLENBQUM7WUFDRCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDdkMsSUFBSSxPQUFPLFlBQVksMEJBQTBCLEVBQUUsQ0FBQztvQkFDbkQsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDM0IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVNLGVBQWUsQ0FBQyxPQUFtQztRQUN6RCxrQ0FBa0M7UUFDbEMsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDakQsSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2hDLDRCQUE0QjtZQUM1QixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDeEIsQ0FBQztRQUVELE1BQU0sbUJBQW1CLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUU7WUFDM0QsSUFBSSxDQUFDO2dCQUNKLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN6RSxPQUFvQixTQUFTLENBQUM7WUFDL0IsQ0FBQztZQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBQ2Qsd0VBQXdFO2dCQUN4RSxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQzFELE9BQU87Z0JBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkMsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUFsRFksd0JBQXdCO0lBRWxDLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGdCQUFnQixDQUFBO0dBSk4sd0JBQXdCLENBa0RwQyJ9