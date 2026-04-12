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
import { IDebugService } from '../common/debug.js';
import { dispose } from '../../../../base/common/lifecycle.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITitleService } from '../../../services/title/browser/titleService.js';
let DebugTitleContribution = class DebugTitleContribution {
    constructor(debugService, hostService, titleService) {
        this.toDispose = [];
        const updateTitle = () => {
            if (debugService.state === 2 /* State.Stopped */ && !hostService.hasFocus) {
                titleService.updateProperties({ prefix: '🔴' });
            }
            else {
                titleService.updateProperties({ prefix: '' });
            }
        };
        this.toDispose.push(debugService.onDidChangeState(updateTitle));
        this.toDispose.push(hostService.onDidChangeFocus(updateTitle));
    }
    dispose() {
        dispose(this.toDispose);
    }
};
DebugTitleContribution = __decorate([
    __param(0, IDebugService),
    __param(1, IHostService),
    __param(2, ITitleService)
], DebugTitleContribution);
export { DebugTitleContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdUaXRsZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdUaXRsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFTLE1BQU0sb0JBQW9CLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFekUsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBc0I7SUFJbEMsWUFDZ0IsWUFBMkIsRUFDNUIsV0FBeUIsRUFDeEIsWUFBMkI7UUFMbkMsY0FBUyxHQUFrQixFQUFFLENBQUM7UUFPckMsTUFBTSxXQUFXLEdBQUcsR0FBRyxFQUFFO1lBQ3hCLElBQUksWUFBWSxDQUFDLEtBQUssMEJBQWtCLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ25FLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxZQUFZLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMvQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDaEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELE9BQU87UUFDTixPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FDRCxDQUFBO0FBdkJZLHNCQUFzQjtJQUtoQyxXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxhQUFhLENBQUE7R0FQSCxzQkFBc0IsQ0F1QmxDIn0=