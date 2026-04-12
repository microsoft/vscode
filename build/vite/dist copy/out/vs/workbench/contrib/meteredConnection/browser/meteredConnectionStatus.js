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
var MeteredConnectionStatusContribution_1;
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IMeteredConnectionService } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
let MeteredConnectionStatusContribution = class MeteredConnectionStatusContribution extends Disposable {
    static { MeteredConnectionStatusContribution_1 = this; }
    static { this.ID = 'workbench.contrib.meteredConnectionStatus'; }
    constructor(meteredConnectionService, statusbarService) {
        super();
        this.meteredConnectionService = meteredConnectionService;
        this.statusbarService = statusbarService;
        this.statusBarEntry = this._register(new MutableDisposable());
        this.updateStatusBarEntry(this.meteredConnectionService.isConnectionMetered);
        this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(isMetered => {
            this.updateStatusBarEntry(isMetered);
        }));
    }
    updateStatusBarEntry(isMetered) {
        if (isMetered) {
            if (!this.statusBarEntry.value) {
                this.statusBarEntry.value = this.statusbarService.addEntry(this.getStatusBarEntry(), MeteredConnectionStatusContribution_1.ID, 1 /* StatusbarAlignment.RIGHT */, -Number.MAX_VALUE // Show at the far right
                );
            }
        }
        else {
            this.statusBarEntry.clear();
        }
    }
    getStatusBarEntry() {
        return {
            name: localize('status.meteredConnection', "Metered Connection"),
            text: '$(radio-tower)',
            ariaLabel: localize('status.meteredConnection.ariaLabel', "Metered Connection Enabled"),
            tooltip: localize('status.meteredConnection.tooltip', "Metered connection enabled. Some automatic features like extension updates, Settings Sync, and automatic Git operations are paused to reduce data usage."),
            command: {
                id: 'workbench.action.configureMeteredConnection',
                title: localize('status.meteredConnection.configure', "Configure")
            },
            showInAllWindows: true
        };
    }
};
MeteredConnectionStatusContribution = MeteredConnectionStatusContribution_1 = __decorate([
    __param(0, IMeteredConnectionService),
    __param(1, IStatusbarService)
], MeteredConnectionStatusContribution);
export { MeteredConnectionStatusContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb25TdGF0dXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXRlcmVkQ29ubmVjdGlvbi9icm93c2VyL21ldGVyZWRDb25uZWN0aW9uU3RhdHVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQy9HLE9BQU8sRUFBNEMsaUJBQWlCLEVBQXNCLE1BQU0sa0RBQWtELENBQUM7QUFHNUksSUFBTSxtQ0FBbUMsR0FBekMsTUFBTSxtQ0FBb0MsU0FBUSxVQUFVOzthQUVsRCxPQUFFLEdBQUcsMkNBQTJDLEFBQTlDLENBQStDO0lBSWpFLFlBQzRCLHdCQUFvRSxFQUM1RSxnQkFBb0Q7UUFFdkUsS0FBSyxFQUFFLENBQUM7UUFIb0MsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEyQjtRQUMzRCxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBSnZELG1CQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUEyQixDQUFDLENBQUM7UUFRbEcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRTdFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLDhCQUE4QixDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ3ZGLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFNBQWtCO1FBQzlDLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FDekQsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQ3hCLHFDQUFtQyxDQUFDLEVBQUUsb0NBRXRDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBd0I7aUJBQzFDLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0lBRU8saUJBQWlCO1FBQ3hCLE9BQU87WUFDTixJQUFJLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLG9CQUFvQixDQUFDO1lBQ2hFLElBQUksRUFBRSxnQkFBZ0I7WUFDdEIsU0FBUyxFQUFFLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSw0QkFBNEIsQ0FBQztZQUN2RixPQUFPLEVBQUUsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLDBKQUEwSixDQUFDO1lBQ2pOLE9BQU8sRUFBRTtnQkFDUixFQUFFLEVBQUUsNkNBQTZDO2dCQUNqRCxLQUFLLEVBQUUsUUFBUSxDQUFDLG9DQUFvQyxFQUFFLFdBQVcsQ0FBQzthQUNsRTtZQUNELGdCQUFnQixFQUFFLElBQUk7U0FDdEIsQ0FBQztJQUNILENBQUM7O0FBOUNXLG1DQUFtQztJQU83QyxXQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFdBQUEsaUJBQWlCLENBQUE7R0FSUCxtQ0FBbUMsQ0ErQy9DIn0=