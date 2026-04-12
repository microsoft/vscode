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
import { localize } from '../../../../nls.js';
import { asCssVariable, asCssVariableName, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IDebugService } from '../common/debug.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { STATUS_BAR_FOREGROUND, STATUS_BAR_BORDER, COMMAND_CENTER_BACKGROUND } from '../../../common/theme.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
// colors for theming
export const STATUS_BAR_DEBUGGING_BACKGROUND = registerColor('statusBar.debuggingBackground', {
    dark: '#CC6633',
    light: '#CC6633',
    hcDark: '#BA592C',
    hcLight: '#B5200D'
}, localize('statusBarDebuggingBackground', "Status bar background color when a program is being debugged. The status bar is shown in the bottom of the window"));
export const STATUS_BAR_DEBUGGING_FOREGROUND = registerColor('statusBar.debuggingForeground', {
    dark: STATUS_BAR_FOREGROUND,
    light: STATUS_BAR_FOREGROUND,
    hcDark: STATUS_BAR_FOREGROUND,
    hcLight: '#FFFFFF'
}, localize('statusBarDebuggingForeground', "Status bar foreground color when a program is being debugged. The status bar is shown in the bottom of the window"));
export const STATUS_BAR_DEBUGGING_BORDER = registerColor('statusBar.debuggingBorder', STATUS_BAR_BORDER, localize('statusBarDebuggingBorder', "Status bar border color separating to the sidebar and editor when a program is being debugged. The status bar is shown in the bottom of the window"));
export const COMMAND_CENTER_DEBUGGING_BACKGROUND = registerColor('commandCenter.debuggingBackground', transparent(STATUS_BAR_DEBUGGING_BACKGROUND, 0.258), localize('commandCenter-activeBackground', "Command center background color when a program is being debugged"), true);
let StatusBarColorProvider = class StatusBarColorProvider {
    set enabled(enabled) {
        if (enabled === !!this.disposable) {
            return;
        }
        if (enabled) {
            this.disposable = this.statusbarService.overrideStyle({
                priority: 10,
                foreground: STATUS_BAR_DEBUGGING_FOREGROUND,
                background: STATUS_BAR_DEBUGGING_BACKGROUND,
                border: STATUS_BAR_DEBUGGING_BORDER,
            });
        }
        else {
            this.disposable.dispose();
            this.disposable = undefined;
        }
    }
    constructor(debugService, contextService, statusbarService, configurationService) {
        this.debugService = debugService;
        this.contextService = contextService;
        this.statusbarService = statusbarService;
        this.configurationService = configurationService;
        this.disposables = new DisposableStore();
        this.styleSheet = createStyleSheet();
        this.debugService.onDidChangeState(this.update, this, this.disposables);
        this.contextService.onDidChangeWorkbenchState(this.update, this, this.disposables);
        this.configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('debug.enableStatusBarColor') || e.affectsConfiguration('debug.toolBarLocation')) {
                this.update();
            }
        }, undefined, this.disposables);
        this.update();
    }
    update() {
        const debugConfig = this.configurationService.getValue('debug');
        const isInDebugMode = isStatusbarInDebugMode(this.debugService.state, this.debugService.getModel().getSessions());
        if (!debugConfig.enableStatusBarColor) {
            this.enabled = false;
        }
        else {
            this.enabled = isInDebugMode;
        }
        const isInCommandCenter = debugConfig.toolBarLocation === 'commandCenter';
        this.styleSheet.textContent = isInCommandCenter && isInDebugMode ? `
			.monaco-workbench {
				${asCssVariableName(COMMAND_CENTER_BACKGROUND)}: ${asCssVariable(COMMAND_CENTER_DEBUGGING_BACKGROUND)};
			}
		` : '';
    }
    dispose() {
        this.disposable?.dispose();
        this.disposables.dispose();
    }
};
StatusBarColorProvider = __decorate([
    __param(0, IDebugService),
    __param(1, IWorkspaceContextService),
    __param(2, IStatusbarService),
    __param(3, IConfigurationService)
], StatusBarColorProvider);
export { StatusBarColorProvider };
export function isStatusbarInDebugMode(state, sessions) {
    if (state === 0 /* State.Inactive */ || state === 1 /* State.Initializing */ || sessions.every(s => s.suppressDebugStatusbar || s.configuration?.noDebug)) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzYmFyQ29sb3JQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvc3RhdHVzYmFyQ29sb3JQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFbEksT0FBTyxFQUFFLGFBQWEsRUFBNkMsTUFBTSxvQkFBb0IsQ0FBQztBQUM5RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHOUUscUJBQXFCO0FBRXJCLE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLGFBQWEsQ0FBQywrQkFBK0IsRUFBRTtJQUM3RixJQUFJLEVBQUUsU0FBUztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLE9BQU8sRUFBRSxTQUFTO0NBQ2xCLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLG1IQUFtSCxDQUFDLENBQUMsQ0FBQztBQUVsSyxNQUFNLENBQUMs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