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
var TerminalFindContribution_1;
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { findInFilesCommand } from '../../../search/browser/searchActionsFind.js';
import { ITerminalService, isDetachedTerminalInstance } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction, registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import './media/terminalFind.css';
import { TerminalFindWidget } from './terminalFindWidget.js';
// #region Terminal Contributions
let TerminalFindContribution = class TerminalFindContribution extends Disposable {
    static { TerminalFindContribution_1 = this; }
    static { this.ID = 'terminal.find'; }
    static get(instance) {
        return instance.getContribution(TerminalFindContribution_1.ID);
    }
    get findWidget() { return this._findWidget.value; }
    constructor(ctx, instantiationService, terminalService) {
        super();
        this._findWidget = new Lazy(() => {
            const findWidget = instantiationService.createInstance(TerminalFindWidget, ctx.instance);
            // Track focus and set state so we can force the scroll bar to be visible
            findWidget.focusTracker.onDidFocus(() => {
                TerminalFindContribution_1.activeFindWidget = this;
                ctx.instance.forceScrollbarVisibility();
                if (!isDetachedTerminalInstance(ctx.instance)) {
                    terminalService.setActiveInstance(ctx.instance);
                }
            });
            findWidget.focusTracker.onDidBlur(() => {
                TerminalFindContribution_1.activeFindWidget = undefined;
                ctx.instance.resetScrollbarVisibility();
            });
            if (!ctx.instance.domElement) {
                throw new Error('FindWidget expected terminal DOM to be initialized');
            }
            ctx.instance.domElement?.appendChild(findWidget.getDomNode());
            if (this._lastLayoutDimensions) {
                findWidget.layout(this._lastLayoutDimensions.width);
            }
            return findWidget;
        });
    }
    layout(_xterm, dimension) {
        this._lastLayoutDimensions = dimension;
        this._findWidget.rawValue?.layout(dimension.width);
    }
    xtermReady(xterm) {
        this._register(xterm.onDidChangeFindResults(() => this._findWidget.rawValue?.updateResultCount()));
    }
    dispose() {
        if (TerminalFindContribution_1.activeFindWidget === this) {
            TerminalFindContribution_1.activeFindWidget = undefined;
        }
        super.dispose();
        this._findWidget.rawValue?.dispose();
    }
};
TerminalFindContribution = TerminalFindContribution_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITerminalService)
], TerminalFindContribution);
registerTerminalContribution(TerminalFindContribution.ID, TerminalFindContribution, true);
// #endregion
// #region Actions
registerActiveXtermAction({
    id: "workbench.action.terminal.focusFind" /* TerminalFindCommandId.FindFocus */,
    title: localize2('workbench.action.terminal.focusFind', 'Focus Find'),
    keybinding: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */,
        when: ContextKeyExpr.or(TerminalContextKeys.findFocus, TerminalContextKeys.focusInAny),
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        contr?.findWidget.reveal();
    }
});
registerActiveXtermAction({
    id: "workbench.action.terminal.hideFind" /* TerminalFindCommandId.FindHide */,
    title: localize2('workbench.action.terminal.hideFind', 'Hide Find'),
    keybinding: {
        primary: 9 /* KeyCode.Escape */,
        secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
        when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.findVisible),
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        contr?.findWidget.hide();
    }
});
registerActiveXtermAction({
    id: "workbench.action.terminal.toggleFindRegex" /* TerminalFindCommandId.ToggleFindRegex */,
    title: localize2('workbench.action.terminal.toggleFindRegex', 'Toggle Find Using Regex'),
    keybinding: {
        primary: 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */,
        mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */ },
        when: TerminalContextKeys.findVisible,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        const state = contr?.findWidget.state;
        state?.change({ isRegex: !state.isRegex }, false);
    }
});
registerActiveXtermAction({
    id: "workbench.action.terminal.toggleFindWholeWord" /* TerminalFindCommandId.ToggleFindWholeWord */,
    title: localize2('workbench.action.terminal.toggleFindWholeWord', 'Toggle Find Using Whole Word'),
    keybinding: {
        primary: 512 /* KeyMod.Alt */ | 53 /* KeyCode.KeyW */,
        mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 53 /* KeyCode.KeyW */ },
        when: TerminalContextKeys.findVisible,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        const state = contr?.findWidget.state;
        state?.change({ wholeWord: !state.wholeWord }, false);
    }
});
registerActiveXtermAction({
    id: "workbench.action.terminal.toggleFindCaseSensitive" /* TerminalFindCommandId.ToggleFindCaseSensitive */,
    title: localize2('workbench.action.terminal.toggleFindCaseSensitive', 'Toggle Find Using Case Sensitive'),
    keybinding: {
        primary: 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */,
        mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */ },
        when: TerminalContextKeys.findVisible,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */
    },
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        const state = contr?.findWidget.state;
        state?.change({ matchCase: !state.matchCase }, false);
    }
});
registerActiveXtermAction({
    id: "workbench.action.terminal.findNext" /* TerminalFindCommandId.FindNext */,
    title: localize2('workbench.action.terminal.findNext', 'Find Next'),
    keybinding: [
        {
            primary: 61 /* KeyCode.F3 */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */, secondary: [61 /* KeyCode.F3 */] },
            when: ContextKeyExpr.or(TerminalContextKeys.focusInAny, TerminalContextKeys.findFocus),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */
        },
        {
            primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
            when: TerminalContextKeys.findInputFocus,
            weight: 200 /* KeybindingWeight.WorkbenchContrib */
        }
    ],
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        const widget = contr?.findWidget;
        if (widget) {
            widget.show();
            widget.find(false);
        }
    }
});
registerActiveXtermAction({
    id: "workbench.action.terminal.findPrevious" /* TerminalFindCommandId.FindPrevious */,
    title: localize2('workbench.action.terminal.findPrevious', 'Find Previous'),
    keybinding: [
        {
            primary: 1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */, secondary: [1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */] },
            when: ContextKeyExpr.or(TerminalContextKeys.focusInAny, TerminalContextKeys.findFocus),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */
        },
        {
            primary: 3 /* KeyCode.Enter */,
            when: TerminalContextKeys.findInputFocus,
            weight: 200 /* KeybindingWeight.WorkbenchContrib */
        }
    ],
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (_xterm, _accessor, activeInstance) => {
        const contr = TerminalFindContribution.activeFindWidget || TerminalFindContribution.get(activeInstance);
        const widget = contr?.findWidget;
        if (widget) {
            widget.show();
            widget.find(true);
        }
    }
});
// Global workspace file search
registerActiveInstanceAction({
    id: "workbench.action.terminal.searchWorkspace" /* TerminalFindCommandId.SearchWorkspace */,
    title: localize2('workbench.action.terminal.searchWorkspace', 'Search Workspace'),
    keybinding: [
        {
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 36 /* KeyCode.KeyF */,
            when: ContextKeyExpr.and(TerminalContextKeys.processSupported, TerminalContextKeys.focus, TerminalContextKeys.textSelected),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50
        }
    ],
    run: (activeInstance, c, accessor) => findInFilesCommand(accessor, { query: activeInstance.selection })
});
// #endregion
// #region Accessibility Help
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { TerminalFindAccessibilityHelp } from './terminalFindAccessibilityHelp.js';
AccessibleViewRegistry.register(new TerminalFindAccessibilityHelp());
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuZmluZC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvZmluZC9icm93c2VyL3Rlcm1pbmFsLmZpbmQuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUtoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUF1RSxnQkFBZ0IsRUFBa0IsMEJBQTBCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxTCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN2SCxPQUFPLEVBQUUsNEJBQTRCLEVBQTBGLE1BQU0saURBQWlELENBQUM7QUFDdkwsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFckYsT0FBTywwQkFBMEIsQ0FBQztBQUNsQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUU3RCxpQ0FBaUM7QUFFakMsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVOzthQUNoQyxPQUFFLEdBQUcsZUFBZSxBQUFsQixDQUFtQjtJQVFyQyxNQUFNLENBQUMsR0FBRyxD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