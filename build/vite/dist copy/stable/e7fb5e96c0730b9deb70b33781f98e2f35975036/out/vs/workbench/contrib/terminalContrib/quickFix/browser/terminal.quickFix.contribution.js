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
var TerminalQuickFixContribution_1;
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import './media/terminalQuickFix.css';
import { ITerminalQuickFixService } from './quickFix.js';
import { TerminalQuickFixAddon } from './quickFixAddon.js';
import { freePort, gitCreatePr, gitFastForwardPull, gitPushSetUpstream, gitSimilar, gitTwoDashes, pwshGeneralError, pwshUnixCommandNotFoundError } from './terminalQuickFixBuiltinActions.js';
import { TerminalQuickFixService } from './terminalQuickFixService.js';
// #region Services
registerSingleton(ITerminalQuickFixService, TerminalQuickFixService, 1 /* InstantiationType.Delayed */);
// #endregion
// #region Contributions
let TerminalQuickFixContribution = class TerminalQuickFixContribution extends DisposableStore {
    static { TerminalQuickFixContribution_1 = this; }
    static { this.ID = 'quickFix'; }
    static get(instance) {
        return instance.getContribution(TerminalQuickFixContribution_1.ID);
    }
    get addon() { return this._addon; }
    constructor(_ctx, _instantiationService) {
        super();
        this._ctx = _ctx;
        this._instantiationService = _instantiationService;
        this._quickFixMenuItems = this.add(new MutableDisposable());
    }
    xtermReady(xterm) {
        // Create addon
        this._addon = this._instantiationService.createInstance(TerminalQuickFixAddon, this._ctx.instance.sessionId, undefined, this._ctx.instance.capabilities);
        xterm.raw.loadAddon(this._addon);
        // Hook up listeners
        this.add(this._addon.onDidRequestRerunCommand((e) => this._ctx.instance.runCommand(e.command, e.shouldExecute || false)));
        this.add(this._addon.onDidUpdateQuickFixes(e => {
            // Only track the latest command's quick fixes
            this._quickFixMenuItems.value = e.actions ? xterm.decorationAddon.registerMenuItems(e.command, e.actions) : undefined;
        }));
        // Register quick fixes
        for (const actionOption of [
            gitTwoDashes(),
            gitFastForwardPull(),
            freePort((port, command) => this._ctx.instance.freePortKillProcess(port, command)),
            gitSimilar(),
            gitPushSetUpstream(),
            gitCreatePr(),
            pwshUnixCommandNotFoundError(),
            pwshGeneralError()
        ]) {
            this._addon.registerCommandFinishedListener(actionOption);
        }
    }
};
TerminalQuickFixContribution = TerminalQuickFixContribution_1 = __decorate([
    __param(1, IInstantiationService)
], TerminalQuickFixContribution);
registerTerminalContribution(TerminalQuickFixContribution.ID, TerminalQuickFixContribution);
// #endregion
// #region Actions
var TerminalQuickFixCommandId;
(function (TerminalQuickFixCommandId) {
    TerminalQuickFixCommandId["ShowQuickFixes"] = "workbench.action.terminal.showQuickFixes";
})(TerminalQuickFixCommandId || (TerminalQuickFixCommandId = {}));
registerActiveInstanceAction({
    id: "workbench.action.terminal.showQuickFixes" /* TerminalQuickFixCommandId.ShowQuickFixes */,
    title: localize2('workbench.action.terminal.showQuickFixes', 'Show Terminal Quick Fixes'),
    precondition: TerminalContextKeys.focus,
    keybinding: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    run: (activeInstance) => TerminalQuickFixContribution.get(activeInstance)?.addon?.showMenu()
});
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwucXVpY2tGaXguY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3F1aWNrRml4L2Jyb3dzZXIvdGVybWluYWwucXVpY2tGaXguY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2xELE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUd0RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RixPQUFPLEVBQUUsNEJBQTRCLEVBQXFDLE1BQU0saURBQWlELENBQUM7QUFDbEksT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDckYsT0FBTyw4QkFBOEIsQ0FBQztBQUN0QyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlMLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXZFLG1CQUFtQjtBQUVuQixpQkFBaUIsQ0FBQyx3QkFBd0Is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