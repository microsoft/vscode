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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX } from '../../../../platform/accessibility/common/accessibility.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export const IAccessibleViewInformationService = createDecorator('accessibleViewInformationService');
let AccessibleViewInformationService = class AccessibleViewInformationService extends Disposable {
    constructor(_storageService) {
        super();
        this._storageService = _storageService;
    }
    hasShownAccessibleView(viewId) {
        return this._storageService.getBoolean(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${viewId}`, -1 /* StorageScope.APPLICATION */, false) === true;
    }
};
AccessibleViewInformationService = __decorate([
    __param(0, IStorageService)
], AccessibleViewInformationService);
export { AccessibleViewInformationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLGdEQUFnRCxDQUFDO0FBTy9GLE1BQU0sQ0FBQyxNQUFNLGlDQUFpQyxHQUFHLGVBQWUsQ0FBb0Msa0NBQWtDLENBQUMsQ0FBQztBQUVqSSxJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFpQyxTQUFRLFVBQVU7SUFFL0QsWUFBOEMsZUFBZ0M7UUFDN0UsS0FBSyxFQUFFLENBQUM7UUFEcUMsb0JBQWUsR0FBZixlQUFlLENBQWlCO0lBRTlFLENBQUM7SUFDRCxzQkFBc0IsQ0FBQyxNQUFjO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsR0FBRyxvQ0FBb0MsR0FBRyxNQUFNLEVBQUUscUNBQTRCLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQztJQUN0SSxDQUFDO0NBQ0QsQ0FBQTtBQVJZLGdDQUFnQztJQUUvQixXQUFBLGVBQWUsQ0FBQTtHQUZoQixnQ0FBZ0MsQ0FRNUMifQ==