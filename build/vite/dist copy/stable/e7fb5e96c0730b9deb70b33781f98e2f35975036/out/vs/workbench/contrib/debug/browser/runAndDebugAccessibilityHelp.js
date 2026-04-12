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
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityHelpNLS } from '../../../../editor/common/standaloneStrings.js';
import { FocusedViewContext, SidebarFocusContext } from '../../../common/contextkeys.js';
import { BREAKPOINTS_VIEW_ID, CALLSTACK_VIEW_ID, LOADED_SCRIPTS_VIEW_ID, VARIABLES_VIEW_ID, WATCH_VIEW_ID } from '../common/debug.js';
export class RunAndDebugAccessibilityHelp {
    constructor() {
        this.priority = 120;
        this.name = 'runAndDebugHelp';
        this.when = ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals('activeViewlet', 'workbench.view.debug'), SidebarFocusContext), ContextKeyExpr.equals(FocusedViewContext.key, VARIABLES_VIEW_ID), ContextKeyExpr.equals(FocusedViewContext.key, WATCH_VIEW_ID), ContextKeyExpr.equals(FocusedViewContext.key, CALLSTACK_VIEW_ID), ContextKeyExpr.equals(FocusedViewContext.key, LOADED_SCRIPTS_VIEW_ID), ContextKeyExpr.equals(FocusedViewContext.key, BREAKPOINTS_VIEW_ID));
        this.type = "help" /* AccessibleViewType.Help */;
    }
    getProvider(accessor) {
        return new RunAndDebugAccessibilityHelpProvider(accessor.get(ICommandService), accessor.get(IViewsService));
    }
}
let RunAndDebugAccessibilityHelpProvider = class RunAndDebugAccessibilityHelpProvider extends Disposable {
    constructor(_commandService, _viewsService) {
        super();
        this._commandService = _commandService;
        this._viewsService = _viewsService;
        this.id = "runAndDebug" /* AccessibleViewProviderId.RunAndDebug */;
        this.verbositySettingKey = "accessibility.verbosity.debug" /* AccessibilityVerbositySettingId.Debug */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
        this._focusedView = this._viewsService.getFocusedViewName();
    }
    onClose() {
        switch (this._focusedView) {
            case 'Watch':
                this._commandService.executeCommand('workbench.debug.action.focusWatchView');
                break;
            case 'Variables':
                this._commandService.executeCommand('workbench.debug.action.focusVariablesView');
                break;
            case 'Call Stack':
                this._commandService.executeCommand('workbench.debug.action.focusCallStackView');
                break;
            case 'Breakpoints':
                this._commandService.executeCommand('workbench.debug.action.focusBreakpointsView');
                break;
            default:
                this._commandService.executeCommand('workbench.view.debug');
        }
    }
    provideContent() {
        return [
            localize('debug.showRunAndDebug', "The Show Run and Debug view command{0} will open the current view.", '<keybinding:workbench.view.debug>'),
            localize('debug.startDebugging', "The Debug: Start Debugging command{0} will start a debug session.", '<keybinding:workbench.action.debug.start>'),
            localize('debug.help', "Access debug output and evaluate expressions in the debug console, which can be focused with{0}.", '<keybinding:workbench.panel.repl.view.focus>'),
            AccessibilityHelpNLS.setBreakpoint,
            AccessibilityHelpNLS.addToWatch,
            localize('onceDebugging', "Once debugging, the following commands will be available:"),
            localize('debug.restartDebugging', "- Debug: Restart Debugging command{0} will restart the current debug session.", '<keybinding:workbench.action.debug.restart>'),
            localize('debug.stopDebugging', "- Debug: Stop Debugging command{0} will stop the current debugging session.", '<keybinding:workbench.action.debug.stop>'),
            localize('debug.continue', "- Debug: Continue command{0} will continue execution until the next breakpoint.", '<keybinding:workbench.action.debug.continue>'),
            localize('debug.stepInto', "- Debug: Step Into command{0} will step into the next function call.", '<keybinding:workbench.action.debug.stepInto>'),
            localize('debug.stepOver', "- Debug: Step Over command{0} will step over the current function call.", '<keybinding:workbench.action.debug.stepOver>'),
            localize('debug.stepOut', "- Debug: Step Out command{0} will step out of the current function call.", '<keybinding:workbench.action.debug.stepOut>'),
            localize('debug.views', 'The debug viewlet is comprised of several views that can be focused with the following commands or navigated to via tab then arrow keys:'),
            localize('debug.focusBreakpoints', "- Debug: Focus Breakpoints View command{0} will focus the breakpoints view.", '<keybinding:workbench.debug.action.focusBreakpointsView>'),
            localize('debug.focusCallStack', "- Debug: Focus Call Stack View command{0} will focus the call stack view.", '<keybinding:workbench.debug.action.focusCallStackView>'),
            localize('debug.focusVariables', "- Debug: Focus Variables View command{0} will focus the variables view.", '<keybinding:workbench.debug.action.focusVariablesView>'),
            localize('debug.focusWatch', "- Debug: Focus Watch View command{0} will focus the watch view.", '<keybinding:workbench.debug.action.focusWatchView>'),
            localize('debug.watchSetting', "The setting {0} controls whether watch variable changes are announced.", 'accessibility.debugWatchVariableAnnouncements'),
        ].join('\n');
    }
};
RunAndDebugAccessibilityHelpProvider = __decorate([
    __param(0, ICommandService),
    __param(1, IViewsService)
], RunAndDebugAccessibilityHelpProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuQW5kRGVidWdBY2Nlc3NpYmlsaXR5SGVscC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcnVuQW5kRGVidWdBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQU1oRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxzQkFBc0IsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUV0SSxNQUFNLE9BQU8sNEJBQTRCO0lBQXpDO1FBQ0MsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxpQkFBaUIsQ0FBQztRQUN6QixTQUFJLEdBQUcsY0FBYyxDQUFDLEVBQUUsQ0FDdkIsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxzQkFBc0IsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLEVBQ3ZHLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLGlCQUFpQixDQUFD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