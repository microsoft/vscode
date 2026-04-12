var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { PickerQuickAccessProvider } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, SELECT_AND_START_ID } from './debugCommands.js';
import { IDebugService, REPL_VIEW_ID } from '../common/debug.js';
let DebugConsoleQuickAccess = class DebugConsoleQuickAccess extends PickerQuickAccessProvider {
    constructor(_debugService, _viewsService, _commandService) {
        super(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });
        this._debugService = _debugService;
        this._viewsService = _viewsService;
        this._commandService = _commandService;
    }
    _getPicks(filter, disposables, token) {
        const debugConsolePicks = [];
        this._debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl()).forEach((session, index) => {
            const pick = this._createPick(session, index, filter);
            if (pick) {
                debugConsolePicks.push(pick);
            }
        });
        if (debugConsolePicks.length > 0) {
            debugConsolePicks.push({ type: 'separator' });
        }
        const createTerminalLabel = localize("workbench.action.debug.startDebug", "Start a New Debug Session");
        debugConsolePicks.push({
            label: `$(plus) ${createTerminalLabel}`,
            ariaLabel: createTerminalLabel,
            accept: () => this._commandService.executeCommand(SELECT_AND_START_ID)
        });
        return debugConsolePicks;
    }
    _createPick(session, sessionIndex, filter) {
        const label = session.name;
        const highlights = matchesFuzzy(filter, label, true);
        if (highlights) {
            return {
                label,
                highlights: { label: highlights },
                accept: (keyMod, event) => {
                    this._debugService.focusStackFrame(undefined, undefined, session, { explicit: true });
                    if (!this._viewsService.isViewVisible(REPL_VIEW_ID)) {
                        this._viewsService.openView(REPL_VIEW_ID, true);
                    }
                }
            };
        }
        return undefined;
    }
};
DebugConsoleQuickAccess = __decorate([
    __param(0, IDebugService),
    __param(1, IViewsService),
    __param(2, ICommandService)
], DebugConsoleQuickAccess);
export { DebugConsoleQuickAccess };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdDb25zb2xlUXVpY2tBY2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnQ29uc29sZVF1aWNrQWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUtBLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBNEMseUJBQXlCLEVBQVMsTUFBTSw4REFBOEQsQ0FBQztBQUUxSixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDNUYsT0FBTyxFQUFFLGFBQWEsRUFBaUIsWUFBWSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFekUsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSx5QkFBaUQ7SUFFN0YsWUFDaUMsYUFBNEIsRUFDNUIsYUFBNEIsRUFDMUIsZUFBZ0M7UUFFbEUsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUoxQyxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUM1QixrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUMxQixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7SUFHbkUsQ0FBQztJQUVTLFNBQVMsQ0FBQyxNQUFjLEVBQUUsV0FBNEIsRUFBRSxLQUF3QjtRQUN6RixNQUFNLGlCQUFpQixHQUF3RCxFQUFFLENBQUM7UUFFbEYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQzNHLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUN0RCxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUNWLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM5QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFHSCxJQUFJLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNsQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUMvQyxDQUFDO1FBRUQsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUN2RyxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7WUFDdEIsS0FBSyxFQUFFLFdBQVcsbUJBQW1CLEVBQUU7WUFDdkMsU0FBUyxFQUFFLG1CQUFtQjtZQUM5QixNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUM7U0FDdEUsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxpQkFBaUIsQ0FBQztJQUMxQixDQUFDO0lBRU8sV0FBVyxDQUFDLE9BQXNCLEVBQUUsWUFBb0IsRUFBRSxNQUFjO1FBQy9FLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFFM0IsTUFBTSxVQUFVLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixPQUFPO2dCQUNOLEtBQUs7Z0JBQ0wsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtnQkFDakMsTUFBTSxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO29CQUN6QixJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN0RixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQzt3QkFDckQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNqRCxDQUFDO2dCQUNGLENBQUM7YUFDRCxDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRCxDQUFBO0FBcERZLHVCQUF1QjtJQUdqQyxXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxlQUFlLENBQUE7R0FMTCx1QkFBdUIsQ0FvRG5DIn0=