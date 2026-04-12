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
var TerminalHistoryContribution_1;
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { localize2 } from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { registerActiveInstanceAction, registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TERMINAL_VIEW_ID } from '../../../terminal/common/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { clearShellFileHistory, getCommandHistory, getDirectoryHistory } from '../common/history.js';
import { showRunRecentQuickPick } from './terminalRunRecentQuickPick.js';
// #region Terminal Contributions
let TerminalHistoryContribution = class TerminalHistoryContribution extends Disposable {
    static { TerminalHistoryContribution_1 = this; }
    static { this.ID = 'terminal.history'; }
    static get(instance) {
        return instance.getContribution(TerminalHistoryContribution_1.ID);
    }
    constructor(_ctx, contextKeyService, _instantiationService) {
        super();
        this._ctx = _ctx;
        this._instantiationService = _instantiationService;
        this._terminalInRunCommandPicker = TerminalContextKeys.inTerminalRunCommandPicker.bindTo(contextKeyService);
        // Track listeners per capability to avoid leaking disposables
        const capabilityListeners = this._register(new DisposableMap());
        this._register(_ctx.instance.capabilities.onDidAddCapability(e => {
            // Dispose any existing listener for this capability before adding new one
            capabilityListeners.deleteAndDispose(e.id);
            switch (e.id) {
                case 0 /* TerminalCapability.CwdDetection */: {
                    const store = new DisposableStore();
                    store.add(e.capability.onDidChangeCwd(e => {
                        this._instantiationService.invokeFunction(getDirectoryHistory)?.add(e, { remoteAuthority: _ctx.instance.remoteAuthority });
                    }));
                    capabilityListeners.set(e.id, store);
                    break;
                }
                case 2 /* TerminalCapability.CommandDetection */: {
                    const store = new DisposableStore();
                    store.add(e.capability.onCommandFinished(e => {
                        if (e.command.trim().length > 0) {
                            this._instantiationService.invokeFunction(getCommandHistory)?.add(e.command, { shellType: _ctx.instance.shellType });
                        }
                    }));
                    capabilityListeners.set(e.id, store);
                    break;
                }
            }
        }));
        this._register(_ctx.instance.capabilities.onDidRemoveCapability(e => {
            capabilityListeners.deleteAndDispose(e.id);
        }));
    }
    /**
     * Triggers a quick pick that displays recent commands or cwds. Selecting one will
     * rerun it in the active terminal.
     */
    async runRecent(type, filterMode, value) {
        return this._instantiationService.invokeFunction(showRunRecentQuickPick, this._ctx.instance, this._terminalInRunCommandPicker, type, filterMode, value);
    }
};
TerminalHistoryContribution = TerminalHistoryContribution_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, IInstantiationService)
], TerminalHistoryContribution);
registerTerminalContribution(TerminalHistoryContribution.ID, TerminalHistoryContribution);
// #endregion
// #region Actions
const precondition = ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated);
registerTerminalAction({
    id: "workbench.action.terminal.clearPreviousSessionHistory" /* TerminalHistoryCommandId.ClearPreviousSessionHistory */,
    title: localize2('workbench.action.terminal.clearPreviousSessionHistory', 'Clear Previous Session History'),
    precondition,
    run: async (c, accessor) => {
        getCommandHistory(accessor).clear();
        clearShellFileHistory();
    }
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.goToRecentDirectory" /* TerminalHistoryCommandId.GoToRecentDirectory */,
    title: localize2('workbench.action.terminal.goToRecentDirectory', 'Go to Recent Directory...'),
    metadata: {
        description: localize2('goToRecentDirectory.metadata', 'Goes to a recent folder'),
    },
    precondition,
    keybinding: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */,
        when: TerminalContextKeys.focus,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    menu: [
        {
            id: MenuId.ViewTitle,
            group: 'shellIntegration',
            order: 0,
            when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
            isHiddenByDefault: true
        },
        ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
            id,
            group: '1_shellIntegration',
            order: 0,
            when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
            isHiddenByDefault: true
        })),
    ],
    run: async (activeInstance, c) => {
        const history = TerminalHistoryContribution.get(activeInstance);
        if (!history) {
            return;
        }
        await history.runRecent('cwd');
        if (activeInstance?.target === TerminalLocation.Editor) {
            await c.editorService.revealActiveEditor();
        }
        else {
            await c.groupService.showPanel(false);
        }
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.runRecentCommand" /* TerminalHistoryCommandId.RunRecentCommand */,
    title: localize2('workbench.action.terminal.runRecentCommand', 'Run Recent Command...'),
    precondition,
    keybinding: [
        {
            primary: 2048 /* KeyMod.CtrlCmd */ | 48 /* KeyCode.KeyR */,
            when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(TerminalContextKeys.focus, ContextKeyExpr.and(accessibleViewIsShown, accessibleViewCurrentProviderId.isEqualTo("terminal" /* AccessibleViewProviderId.Terminal */)))),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */
        },
        {
            primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */ },
            when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */
        }
    ],
    menu: [
        {
            id: MenuId.ViewTitle,
            group: 'shellIntegration',
            order: 1,
            when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
            isHiddenByDefault: true
        },
        ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
            id,
            group: '1_shellIntegration',
            order: 1,
            when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
            isHiddenByDefault: true
        })),
    ],
    run: async (c, accessor) => {
        let activeInstance = c.service.activeInstance;
        // If an instanec doesn't exist, create one and wait for shell type to be set
        if (!activeInstance) {
            const newInstance = activeInstance = await c.service.getActiveOrCreateInstance();
            await c.service.revealActiveTerminal();
            const store = new DisposableStore();
            const wasDisposedPrematurely = await new Promise(r => {
                store.add(newInstance.onDidChangeShellType(() => r(false)));
                store.add(newInstance.onDisposed(() => r(true)));
            });
            store.dispose();
            if (wasDisposedPrematurely) {
                return;
            }
        }
        const history = TerminalHistoryContribution.get(activeInstance);
        if (!history) {
            return;
        }
        await history.runRecent('command');
        if (activeInstance?.target === TerminalLocation.Editor) {
            await c.editorService.revealActiveEditor();
        }
        else {
            await c.groupService.showPanel(false);
        }
    }
});
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuaGlzdG9yeS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvaGlzdG9yeS9icm93c2VyL3Rlcm1pbmFsLmhpc3RvcnkuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWxELE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFvQixNQUFNLHlEQUF5RCxDQUFDO0FBQy9ILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBR3RHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXRJLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3BILE9BQU8sRUFBRSw0QkFBNEIsRUFBcUMsTUFBTSxpREFBaUQsQ0FBQztBQUNsSSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RSxPQUFP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