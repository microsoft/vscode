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
import { IMarkerDecorationsService } from '../../common/services/markerDecorations.js';
let MarkerDecorationsContribution = class MarkerDecorationsContribution {
    static { this.ID = 'editor.contrib.markerDecorations'; }
    constructor(_editor, _markerDecorationsService) {
        // Doesn't do anything, just requires `IMarkerDecorationsService` to make sure it gets instantiated
    }
    dispose() {
    }
};
MarkerDecorationsContribution = __decorate([
    __param(1, IMarkerDecorationsService)
], MarkerDecorationsContribution);
export { MarkerDecorationsContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2VyRGVjb3JhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9tYXJrZXJEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUloRixJQUFNLDZCQUE2QixHQUFuQyxNQUFNLDZCQUE2QjthQUVsQixPQUFFLEdBQVcsa0NBQWtDLEFBQTdDLENBQThDO0lBRXZFLFlBQ0MsT0FBb0IsRUFDTyx5QkFBb0Q7UUFFL0UsbUdBQW1HO0lBQ3BHLENBQUM7SUFFRCxPQUFPO0lBQ1AsQ0FBQzs7QUFaVyw2QkFBNkI7SUFNdkMsV0FBQSx5QkFBeUIsQ0FBQTtHQU5mLDZCQUE2QixDQWF6QyJ9