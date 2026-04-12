/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { MultiCommand } from '../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewHasAssignedKeybindings, accessibleViewHasUnassignedKeybindings, accessibleViewIsShown, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from './accessibilityConfiguration.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
const accessibleViewMenu = {
    id: MenuId.AccessibleView,
    group: 'navigation',
    when: accessibleViewIsShown
};
const commandPalette = {
    id: MenuId.CommandPalette,
    group: '',
    order: 1
};
class AccessibleViewNextAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewNext" /* AccessibilityCommandId.ShowNext */,
            precondition: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 94 /* KeyCode.BracketRight */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: [
                commandPalette,
                {
                    ...accessibleViewMenu,
                    when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
                }
            ],
            icon: Codicon.arrowDown,
            title: localize('editor.action.accessibleViewNext', "Show Next in Accessible View")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).next();
    }
}
registerAction2(AccessibleViewNextAction);
class AccessibleViewNextCodeBlockAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewNextCodeBlock" /* AccessibilityCommandId.NextCodeBlock */,
            precondition: ContextKeyExpr.and(accessibleViewContainsCodeBlocks, ContextKeyExpr.or(ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "panelChat" /* AccessibleViewProviderId.PanelChat */), ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "inlineChat" /* AccessibleViewProviderId.InlineChat */), ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "quickChat" /* AccessibleViewProviderId.QuickChat */))),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 12 /* KeyCode.PageDown */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 12 /* KeyCode.PageDown */, },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            icon: Codicon.arrowRight,
            menu: {
                ...accessibleViewMenu,
                when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewContainsCodeBlocks),
            },
            title: localize('editor.action.accessibleViewNextCodeBlock', "Accessible View: Next Code Block")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).navigateToCodeBlock('next');
    }
}
registerAction2(AccessibleViewNextCodeBlockAction);
class AccessibleViewPreviousCodeBlockAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewPreviousCodeBlock" /* AccessibilityCommandId.PreviousCodeBlock */,
            precondition: ContextKeyExpr.and(accessibleViewContainsCodeBlocks, ContextKeyExpr.or(ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "panelChat" /* AccessibleViewProviderId.PanelChat */), ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "inlineChat" /* AccessibleViewProviderId.InlineChat */), ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "quickChat" /* AccessibleViewProviderId.QuickChat */))),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 11 /* KeyCode.PageUp */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 11 /* KeyCode.PageUp */, },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            icon: Codicon.arrowLeft,
            menu: {
                ...accessibleViewMenu,
                when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewContainsCodeBlocks),
            },
            title: localize('editor.action.accessibleViewPreviousCodeBlock', "Accessible View: Previous Code Block")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).navigateToCodeBlock('previous');
    }
}
registerAction2(AccessibleViewPreviousCodeBlockAction);
class AccessibleViewPreviousAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewPrevious" /* AccessibilityCommandId.ShowPrevious */,
            precondition: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 92 /* KeyCode.BracketLeft */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            icon: Codicon.arrowUp,
            menu: [
                commandPalette,
                {
                    ...accessibleViewMenu,
                    when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
                }
            ],
            title: localize('editor.action.accessibleViewPrevious', "Show Previous in Accessible View")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).previous();
    }
}
registerAction2(AccessibleViewPreviousAction);
class AccessibleViewGoToSymbolAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewGoToSymbol" /* AccessibilityCommandId.GoToSymbol */,
            precondition: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewGoToSymbolSupported),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 45 /* KeyCode.KeyO */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 89 /* KeyCode.Period */],
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10
            },
            icon: Codicon.symbolMisc,
            menu: [
                commandPalette,
                {
                    ...accessibleViewMenu,
                    when: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewGoToSymbolSupported),
                }
            ],
            title: localize('editor.action.accessibleViewGoToSymbol', "Go To Symbol in Accessible View")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).goToSymbol();
    }
}
registerAction2(AccessibleViewGoToSymbolAction);
function registerCommand(command) {
    command.register();
    return command;
}
export const AccessibilityHelpAction = registerCommand(new MultiCommand({
    id: "editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */,
    precondition: undefined,
    kbOpts: {
        primary: 512 /* KeyMod.Alt */ | 59 /* KeyCode.F1 */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        linux: {
            primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 59 /* KeyCode.F1 */,
            secondary: [512 /* KeyMod.Alt */ | 59 /* KeyCode.F1 */]
        },
        kbExpr: accessibilityHelpIsShown.toNegated()
    },
    menuOpts: [{
            menuId: MenuId.CommandPalette,
            group: '',
            title: localize('editor.action.accessibilityHelp', "Open Accessibility Help"),
            order: 1
        }],
}));
export const AccessibleViewAction = registerCommand(new MultiCommand({
    id: "editor.action.accessibleView" /* AccessibilityCommandId.OpenAccessibleView */,
    precondition: undefined,
    kbOpts: {
        primary: 512 /* KeyMod.Alt */ | 60 /* KeyCode.F2 */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        linux: {
            primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 60 /* KeyCode.F2 */,
            secondary: [512 /* KeyMod.Alt */ | 60 /* KeyCode.F2 */]
        }
    },
    menuOpts: [{
            menuId: MenuId.CommandPalette,
            group: '',
            title: localize('editor.action.accessibleView', "Open Accessible View"),
            order: 1
        }],
}));
class AccessibleViewDisableHintAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewDisableHint" /* AccessibilityCommandId.DisableVerbosityHint */,
            precondition: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewVerbosityEnabled),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 64 /* KeyCode.F6 */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            icon: Codicon.bellSlash,
            menu: [
                commandPalette,
                {
                    id: MenuId.AccessibleView,
                    group: 'navigation',
                    when: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewVerbosityEnabled),
                }
            ],
            title: localize('editor.action.accessibleViewDisableHint', "Disable Accessible View Hint")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).disableHint();
    }
}
registerAction2(AccessibleViewDisableHintAction);
class AccessibilityHelpConfigureKeybindingsAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibilityHelpConfigureKeybindings" /* AccessibilityCommandId.AccessibilityHelpConfigureKeybindings */,
            precondition: ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewHasUnassignedKeybindings),
            icon: Codicon.recordKeys,
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 41 /* KeyCode.KeyK */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: [
                {
                    id: MenuId.AccessibleView,
                    group: 'navigation',
                    order: 3,
                    when: accessibleViewHasUnassignedKeybindings,
                }
            ],
            title: localize('editor.action.accessibilityHelpConfigureUnassignedKeybindings', "Accessibility Help Configure Unassigned Keybindings")
        });
    }
    async run(accessor) {
        await accessor.get(IAccessibleViewService).configureKeybindings(true);
    }
}
registerAction2(AccessibilityHelpConfigureKeybindingsAction);
class AccessibilityHelpConfigureAssignedKeybindingsAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibilityHelpConfigureAssignedKeybindings" /* AccessibilityCommandId.AccessibilityHelpConfigureAssignedKeybindings */,
            precondition: ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewHasAssignedKeybindings),
            icon: Codicon.recordKeys,
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: [
                {
                    id: MenuId.AccessibleView,
                    group: 'navigation',
                    order: 4,
                    when: accessibleViewHasAssignedKeybindings,
                }
            ],
            title: localize('editor.action.accessibilityHelpConfigureAssignedKeybindings', "Accessibility Help Configure Assigned Keybindings")
        });
    }
    async run(accessor) {
        await accessor.get(IAccessibleViewService).configureKeybindings(false);
    }
}
registerAction2(AccessibilityHelpConfigureAssignedKeybindingsAction);
class AccessibilityHelpOpenHelpLinkAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibilityHelpOpenHelpLink" /* AccessibilityCommandId.AccessibilityHelpOpenHelpLink */,
            precondition: ContextKeyExpr.and(accessibilityHelpIsShown),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 38 /* KeyCode.KeyH */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            title: localize('editor.action.accessibilityHelpOpenHelpLink', "Accessibility Help Open Help Link")
        });
    }
    run(accessor) {
        accessor.get(IAccessibleViewService).openHelpLink();
    }
}
registerAction2(AccessibilityHelpOpenHelpLinkAction);
class AccessibleViewAcceptInlineCompletionAction extends Action2 {
    constructor() {
        super({
            id: "editor.action.accessibleViewAcceptInlineCompletion" /* AccessibilityCommandId.AccessibleViewAcceptInlineCompletion */,
            precondition: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "inlineCompletions" /* AccessibleViewProviderId.InlineCompletions */)),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 90 /* KeyCode.Slash */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            icon: Codicon.check,
            menu: [
                commandPalette,
                {
                    id: MenuId.AccessibleView,
                    group: 'navigation',
                    order: 0,
                    when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "inlineCompletions" /* AccessibleViewProviderId.InlineCompletions */))
                }
            ],
            title: localize('editor.action.accessibleViewAcceptInlineCompletionAction', "Accept Inline Completion")
        });
    }
    async run(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
        if (!editor) {
            return;
        }
        const model = InlineCompletionsController.get(editor)?.model.get();
        const state = model?.state.get();
        if (!model || !state) {
            return;
        }
        await model.accept(editor);
        model.stop();
        editor.focus();
    }
}
registerAction2(AccessibleViewAcceptInlineCompletionAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJsZVZpZXdBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsT0FBTyxFQUFXLFlBQVksRUFBb0IsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3RGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxnQ0FBZ0MsRUFBRSwrQkFBK0IsRUFBRSxpQ0FBaUMsRUFBRSxvQ0FBb0MsRUFBRSxzQ0FBc0MsRUFBRSxxQkFBcUIsRUFBRSxnQ0FBZ0MsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hWLE9BQU8sRUFBNEIsc0JBQXNCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNoSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxnR0FBZ0csQ0FBQztBQUU3SSxNQUFNLGtCQUFrQixHQUFHO0lBQzFCLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztJQUN6QixLQUFLLEVBQUUsWUFBWTtJQUNuQixJQUFJLEVBQUUscUJBQXFCO0NBQzNCLENBQUM7QUFDRixNQUFNLGNBQWMsR0FBRztJQUN0QixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7SUFDekIs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