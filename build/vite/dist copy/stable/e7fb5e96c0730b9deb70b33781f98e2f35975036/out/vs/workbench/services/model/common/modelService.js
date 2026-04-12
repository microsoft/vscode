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
import { IModelService } from '../../../../editor/common/services/model.js';
import { ModelService } from '../../../../editor/common/services/modelService.js';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { IPathService } from '../../path/common/pathService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
let WorkbenchModelService = class WorkbenchModelService extends ModelService {
    constructor(configurationService, resourcePropertiesService, undoRedoService, _pathService, instantiationService) {
        super(configurationService, resourcePropertiesService, undoRedoService, instantiationService);
        this._pathService = _pathService;
    }
    _schemaShouldMaintainUndoRedoElements(resource) {
        return (super._schemaShouldMaintainUndoRedoElements(resource)
            || resource.scheme === this._pathService.defaultUriScheme);
    }
};
WorkbenchModelService = __decorate([
    __param(0, IConfigurationService),
    __param(1, ITextResourcePropertiesService),
    __param(2, IUndoRedoService),
    __param(3, IPathService),
    __param(4, IInstantiationService)
], WorkbenchModelService);
export { WorkbenchModelService };
registerSingleton(IModelService, WorkbenchModelService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL21vZGVsL2NvbW1vbi9tb2RlbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNqSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTVGLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsWUFBWTtJQUN0RCxZQUN3QixvQkFBMkMsRUFDbEMseUJBQXlELEVBQ3ZFLGVBQWlDLEVBQ3BCLFlBQTBCLEVBQ2xDLG9CQUEyQztRQUVsRSxLQUFLLENBQUMsb0JBQW9CLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFIL0QsaUJBQVksR0FBWixZQUFZLENBQWM7SUFJMUQsQ0FBQztJQUVrQixxQ0FBcUMsQ0FBQyxRQUFhO1FBQ3JFLE9BQU8sQ0FDTixLQUFLLENBQUMscUNBQXFDLENBQUMsUUFBUSxDQUFDO2VBQ2xELFFBQVEsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FDekQsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBakJZLHFCQUFxQjtJQUUvQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsOEJBQThCLENBQUE7SUFDOUIsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEscUJBQXFCLENBQUE7R0FOWCxxQkFBcUIsQ0FpQmpDOztBQUVELGlCQUFpQixDQUFDLGFBQWEsRUFBRSxxQkFBcUIsb0NBQTRCLENBQUMifQ==