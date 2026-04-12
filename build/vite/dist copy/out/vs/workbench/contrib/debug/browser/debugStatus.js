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
import * as nls from '../../../../nls.js';
import { dispose } from '../../../../base/common/lifecycle.js';
import { IDebugService } from '../common/debug.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
let DebugStatusContribution = class DebugStatusContribution {
    constructor(statusBarService, debugService, configurationService) {
        this.statusBarService = statusBarService;
        this.debugService = debugService;
        this.toDispose = [];
        const addStatusBarEntry = () => {
            this.entryAccessor = this.statusBarService.addEntry(this.entry, 'status.debug', 0 /* StatusbarAlignment.LEFT */, 30 /* Low Priority */);
        };
        const setShowInStatusBar = () => {
            this.showInStatusBar = configurationService.getValue('debug').showInStatusBar;
            if (this.showInStatusBar === 'always' && !this.entryAccessor) {
                addStatusBarEntry();
            }
        };
        setShowInStatusBar();
        this.toDispose.push(this.debugService.onDidChangeState(state => {
            if (state !== 0 /* State.Inactive */ && this.showInStatusBar === 'onFirstSessionStart' && !this.entryAccessor) {
                addStatusBarEntry();
            }
        }));
        this.toDispose.push(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('debug.showInStatusBar')) {
                setShowInStatusBar();
                if (this.entryAccessor && this.showInStatusBar === 'never') {
                    this.entryAccessor.dispose();
                    this.entryAccessor = undefined;
                }
            }
        }));
        this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(e => {
            this.entryAccessor?.update(this.entry);
        }));
    }
    get entry() {
        let text = '';
        const manager = this.debugService.getConfigurationManager();
        const name = manager.selectedConfiguration.name || '';
        const nameAndLaunchPresent = name && manager.selectedConfiguration.launch;
        if (nameAndLaunchPresent) {
            text = (manager.getLaunches().length > 1 ? `${name} (${manager.selectedConfiguration.launch.name})` : name);
        }
        return {
            name: nls.localize('status.debug', "Debug"),
            text: '$(debug-alt-small) ' + text,
            ariaLabel: nls.localize('debugTarget', "Debug: {0}", text),
            tooltip: nls.localize('selectAndStartDebug', "Select and Start Debug Configuration"),
            command: 'workbench.action.debug.selectandstart'
        };
    }
    dispose() {
        this.entryAccessor?.dispose();
        dispose(this.toDispose);
    }
};
DebugStatusContribution = __decorate([
    __param(0, IStatusbarService),
    __param(1, IDebugService),
    __param(2, IConfigurationService)
], DebugStatusContribution);
export { DebugStatusContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTdGF0dXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnU3RhdHVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFlLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxhQUFhLEVBQThCLE1BQU0sb0JBQW9CLENBQUM7QUFDL0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFtQixpQkFBaUIsRUFBK0MsTUFBTSxrREFBa0QsQ0FBQztBQUc1SSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF1QjtJQU1uQyxZQUNvQixnQkFBb0QsRUFDeEQsWUFBNEMsRUFDcEMsb0JBQTJDO1FBRjlCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDdkMsaUJBQVksR0FBWixZQUFZLENBQWU7UUFMcEQsY0FBUyxHQUFrQixFQUFFLENBQUM7UUFTckMsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLEVBQUU7WUFDOUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsY0FBYyxtQ0FBMkIsRUFBRSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDakksQ0FBQyxDQUFDO1FBRUYsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLEVBQUU7WUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQXNCLE9BQU8sQ0FBQyxDQUFDLGVBQWUsQ0FBQztZQUNuRyxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUM5RCxpQkFBaUIsRUFBRSxDQUFDO1lBQ3JCLENBQUM7UUFDRixDQUFDLENBQUM7UUFDRixrQkFBa0IsRUFBRSxDQUFDO1FBRXJCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDOUQsSUFBSSxLQUFLLDJCQUFtQixJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUsscUJBQXFCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3ZHLGlCQUFpQixFQUFFLENBQUM7WUFDckIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNyRSxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JELGtCQUFrQixFQUFFLENBQUM7Z0JBQ3JCLElBQUksSUFBSSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsZUFBZSxLQUFLLE9BQU8sRUFBRSxDQUFDO29CQUM1RCxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQztnQkFDaEMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzVGLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELElBQVksS0FBSztRQUNoQixJQUFJLElBQUksR0FBRyxFQUFFLENBQUM7UUFDZCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDNUQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLElBQUksT0FBTyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQztRQUMxRSxJQUFJLG9CQUFvQixFQUFFLENBQUM7WUFDMUIsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxLQUFLLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxNQUFPLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlHLENBQUM7UUFFRCxPQUFPO1lBQ04sSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLE9BQU8sQ0FBQztZQUMzQyxJQUFJLEVBQUUscUJBQXFCLEdBQUcsSUFBSTtZQUNsQyxTQUFTLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQztZQUMxRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxzQ0FBc0MsQ0FBQztZQUNwRixPQUFPLEVBQUUsdUNBQXVDO1NBQ2hELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDOUIsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN6QixDQUFDO0NBQ0QsQ0FBQTtBQWpFWSx1QkFBdUI7SUFPakMsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEscUJBQXFCLENBQUE7R0FUWCx1QkFBdUIsQ0FpRW5DIn0=