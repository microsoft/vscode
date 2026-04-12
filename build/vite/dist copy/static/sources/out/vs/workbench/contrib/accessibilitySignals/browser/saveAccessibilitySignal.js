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
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
let SaveAccessibilitySignalContribution = class SaveAccessibilitySignalContribution extends Disposable {
    static { this.ID = 'workbench.contrib.saveAccessibilitySignal'; }
    constructor(_accessibilitySignalService, _workingCopyService) {
        super();
        this._accessibilitySignalService = _accessibilitySignalService;
        this._workingCopyService = _workingCopyService;
        this._register(this._workingCopyService.onDidSave(e => this._accessibilitySignalService.playSignal(AccessibilitySignal.save, { userGesture: e.reason === 1 /* SaveReason.EXPLICIT */ })));
    }
};
SaveAccessibilitySignalContribution = __decorate([
    __param(0, IAccessibilitySignalService),
    __param(1, IWorkingCopyService)
], SaveAccessibilitySignalContribution);
export { SaveAccessibilitySignalContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2F2ZUFjY2Vzc2liaWxpdHlTaWduYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5U2lnbmFscy9icm93c2VyL3NhdmVBY2Nlc3NpYmlsaXR5U2lnbmFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxnRkFBZ0YsQ0FBQztBQUdsSixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUUxRixJQUFNLG1DQUFtQyxHQUF6QyxNQUFNLG1DQUFvQyxTQUFRLFVBQVU7YUFFbEQsT0FBRSxHQUFHLDJDQUEyQyxBQUE5QyxDQUErQztJQUVqRSxZQUMrQywyQkFBd0QsRUFDaEUsbUJBQXdDO1FBRTlFLEtBQUssRUFBRSxDQUFDO1FBSHNDLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBNkI7UUFDaEUsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUc5RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsTUFBTSxnQ0FBd0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25MLENBQUM7O0FBVlcsbUNBQW1DO0lBSzdDLFdBQUEsMkJBQTJCLENBQUE7SUFDM0IsV0FBQSxtQkFBbUIsQ0FBQTtHQU5ULG1DQUFtQyxDQVcvQyJ9