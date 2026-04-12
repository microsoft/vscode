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
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDebugService } from './debug.js';
let ReplAccessibilityAnnouncer = class ReplAccessibilityAnnouncer extends Disposable {
    static { this.ID = 'debug.replAccessibilityAnnouncer'; }
    constructor(debugService, accessibilityService, logService) {
        super();
        const viewModel = debugService.getViewModel();
        const mutableDispoable = this._register(new MutableDisposable());
        this._register(viewModel.onDidFocusSession((session) => {
            mutableDispoable.clear();
            if (!session) {
                return;
            }
            mutableDispoable.value = session.onDidChangeReplElements((element) => {
                if (!element || !('originalExpression' in element)) {
                    // element was removed or hasn't been resolved yet
                    return;
                }
                const value = element.toString();
                accessibilityService.status(value);
                logService.trace('ReplAccessibilityAnnouncer#onDidChangeReplElements', element.originalExpression + ': ' + value);
            });
        }));
    }
};
ReplAccessibilityAnnouncer = __decorate([
    __param(0, IDebugService),
    __param(1, IAccessibilityService),
    __param(2, ILogService)
], ReplAccessibilityAnnouncer);
export { ReplAccessibilityAnnouncer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEFjY2Vzc2liaWxpdHlBbm5vdW5jZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vcmVwbEFjY2Vzc2liaWxpdHlBbm5vdW5jZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXBDLElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsVUFBVTthQUNsRCxPQUFFLEdBQUcsa0NBQWtDLEFBQXJDLENBQXNDO0lBQy9DLFlBQ2dCLFlBQTJCLEVBQ25CLG9CQUEyQyxFQUNyRCxVQUF1QjtRQUVwQyxLQUFLLEVBQUUsQ0FBQztRQUNSLE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM5QyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUN0RCxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTztZQUNSLENBQUM7WUFDRCxnQkFBZ0IsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7Z0JBQ3BFLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLG9CQUFvQixJQUFJLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ3BELGtEQUFrRDtvQkFDbEQsT0FBTztnQkFDUixDQUFDO2dCQUNELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDakMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNuQyxVQUFVLENBQUMsS0FBSyxDQUFDLG9EQUFvRCxFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7WUFDbkgsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUF6QlcsMEJBQTBCO0lBR3BDLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLFdBQVcsQ0FBQTtHQUxELDBCQUEwQixDQTBCdEMifQ==