/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize2 } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BrowserEditor, CONTEXT_BROWSER_CAN_GO_BACK, CONTEXT_BROWSER_CAN_GO_FORWARD, CONTEXT_BROWSER_FOCUSED, CONTEXT_BROWSER_HAS_URL } from './browserEditor.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
// Context key expression to check if browser editor is active
export const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditorInput.EDITOR_ID);
export const BrowserActionCategory = localize2('browserCategory', "Browser");
export var BrowserActionGroup;
(function (BrowserActionGroup) {
    BrowserActionGroup["Tabs"] = "1_tabs";
    BrowserActionGroup["Zoom"] = "2_zoom";
    BrowserActionGroup["Page"] = "3_page";
    BrowserActionGroup["Settings"] = "4_settings";
})(BrowserActionGroup || (BrowserActionGroup = {}));
class GoBackAction extends Action2 {
    static { this.ID = BrowserViewCommandId.GoBack; }
    constructor() {
        super({
            id: GoBackAction.ID,
            title: localize2('browser.goBackAction', 'Go Back'),
            category: BrowserActionCategory,
            icon: Codicon.arrowLeft,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
            menu: {
                id: MenuId.BrowserNavigationToolbar,
                group: 'navigation',
                order: 1,
            },
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50, // Priority over editor navigation
                primary: 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */,
                secondary: [122 /* KeyCode.BrowserBack */],
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 92 /* KeyCode.BracketLeft */, secondary: [122 /* KeyCode.BrowserBack */, 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */] }
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.goBack();
        }
    }
}
class GoForwardAction extends Action2 {
    static { this.ID = BrowserViewCommandId.GoForward; }
    constructor() {
        super({
            id: GoForwardAction.ID,
            title: localize2('browser.goForwardAction', 'Go Forward'),
            category: BrowserActionCategory,
            icon: Codicon.arrowRight,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
            menu: {
                id: MenuId.BrowserNavigationToolbar,
                group: 'navigation',
                order: 2,
            },
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50, // Priority over editor navigation
                primary: 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */,
                secondary: [123 /* KeyCode.BrowserForward */],
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */, secondary: [123 /* KeyCode.BrowserForward */, 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */] }
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.goForward();
        }
    }
}
class ReloadAction extends Action2 {
    static { this.ID = BrowserViewCommandId.Reload; }
    constructor() {
        super({
            id: ReloadAction.ID,
            title: localize2('browser.reloadAction', 'Reload'),
            category: BrowserActionCategory,
            icon: Codicon.refresh,
            f1: true,
            precondition: BROWSER_EDITOR_ACTIVE,
            menu: {
                id: MenuId.BrowserNavigationToolbar,
                group: 'navigation',
                order: 3,
                alt: {
                    id: HardReloadAction.ID,
                    title: localize2('browser.hardReloadAction', 'Hard Reload'),
                    icon: Codicon.refresh,
                }
            },
            keybinding: {
                when: CONTEXT_BROWSER_FOCUSED,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 75, // Priority over debug and reload workbench
                primary: 2048 /* KeyMod.CtrlCmd */ | 48 /* KeyCode.KeyR */,
                secondary: [63 /* KeyCode.F5 */],
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 48 /* KeyCode.KeyR */, secondary: [] }
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.reload();
        }
    }
}
class HardReloadAction extends Action2 {
    static { this.ID = BrowserViewCommandId.HardReload; }
    constructor() {
        super({
            id: HardReloadAction.ID,
            title: localize2('browser.hardReloadAction', 'Hard Reload'),
            category: BrowserActionCategory,
            icon: Codicon.refresh,
            f1: true,
            precondition: BROWSER_EDITOR_ACTIVE,
            keybinding: {
                when: CONTEXT_BROWSER_FOCUSED,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 75, // Priority over debug and reload workbench
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 63 /* KeyCode.F5 */],
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */, secondary: [] }
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.reload(true);
        }
    }
}
class FocusUrlInputAction extends Action2 {
    static { this.ID = BrowserViewCommandId.FocusUrlInput; }
    constructor() {
        super({
            id: FocusUrlInputAction.ID,
            title: localize2('browser.focusUrlInputAction', 'Focus URL Input'),
            category: BrowserActionCategory,
            f1: true,
            precondition: BROWSER_EDITOR_ACTIVE,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 42 /* KeyCode.KeyL */,
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.focusUrlInput();
        }
    }
}
class OpenInExternalBrowserAction extends Action2 {
    static { this.ID = BrowserViewCommandId.OpenExternal; }
    constructor() {
        super({
            id: OpenInExternalBrowserAction.ID,
            title: localize2('browser.openExternalAction', 'Open in External Browser'),
            category: BrowserActionCategory,
            icon: Codicon.linkExternal,
            f1: true,
            // Note: We do allow opening in an external browser even if there is an error page shown
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Page,
                order: 10
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            const url = browserEditor.getUrl();
            if (url) {
                const openerService = accessor.get(IOpenerService);
                await openerService.open(url, {
                    // ensures that VS Code itself doesn't try to open the URL, even for non-"http(s):" scheme URLs.
                    openExternal: true,
                    // ensures that the link isn't opened in Integrated Browser or other contributed external openers. False is the default, but just being explicit here.
                    allowContributedOpeners: false
                });
            }
        }
    }
}
class OpenBrowserSettingsAction extends Action2 {
    static { this.ID = BrowserViewCommandId.OpenSettings; }
    constructor() {
        super({
            id: OpenBrowserSettingsAction.ID,
            title: localize2('browser.openSettingsAction', 'Open Browser Settings'),
            category: BrowserActionCategory,
            icon: Codicon.settingsGear,
            f1: false,
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Settings,
                order: 2
            }
        });
    }
    async run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        await preferencesService.openSettings({ query: '@id:workbench.browser.*,chat.sendElementsToChat.*' });
    }
}
// Register actions
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(OpenBrowserSettingsAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9icm93c2VyVmlld0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUlsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsMkJBQTJCLEVBQUUsOEJBQThCLEVBQUUsdUJBQXVCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNsSyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFckUsOERBQThEO0FBQzlELE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBRXpHLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUM3RSxNQUFNLENBQU4sSUFBWSxrQkFLWDtBQUxELFdBQVksa0JBQWtCO0lBQzdCLHFDQUFlLENBQUE7SUFDZixxQ0FBZSxDQUFBO0lBQ2YscUNBQWUsQ0FBQTtJQUNmLDZDQUF1QixDQUFBO0FBQ3hCLENBQUMsRUFMVyxrQkFBa0IsS0FBbEIsa0JBQWtCLFFBSzdCO0FBRUQsTUFBTSxZQUFhLFNBQVEsT0FBTzthQUNqQixPQUFFLEdBQUcsb0JBQW9CLENBQUMsTUFBTSxDQUFDO0lBRWpEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLFlBQVksQ0FBQyxFQUFFO1lBQ25CLEtBQUssRUFBRSxTQUFTLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxDQUFDO1lBQ25ELFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQ3ZCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsMkJBQTJCLENBQUM7WUFDcEYsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsd0JBQXdCO2dCQUNuQyxLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELFVBQVUsRUFBRTtnQkFDWCxNQUFNLEVBQUUsOENBQW9DLEVBQUUsRUFBRSxrQ0FBa0M7Z0JBQ2xGLE9BQU8sRUFBRSxpREFBOEI7Z0JBQ3ZDLFNBQVMsRUFBRSwrQkFBcUI7Z0JBQ2hDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSx3REFBb0MsRUFBRSxTQUFTLEVBQUUsZ0NBQXNCLHNEQUFrQyxDQUFDLEVBQUU7YUFDNUg7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGdCQUFnQjtRQUNsRyxJQUFJLGFBQWEsWUFBWSxhQUFhLEVBQUUsQ0FBQztZQUM1QyxNQUFNLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQzs7QUFHRixNQUFNLGVBQWdCLFNBQVEsT0FBTzthQUNwQixPQUFFLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDO0lBRXBEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLGVBQWUsQ0FBQyxFQUFFO1lBQ3RCLEtBQUssRUFBRSxTQUFTLENBQUMseUJBQXlCLEVBQUUsWUFBWSxDQUFDO1lBQ3pELFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxVQUFVO1lBQ3hCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsOEJBQThCLENBQUM7WUFDdkYsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsd0JBQXdCO2dCQUNuQyxLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELFVBQVUsRUFBRTtnQkFDWCxNQUFNLEVBQUUsOENBQW9DLEVBQUUsRUFBRSxrQ0FBa0M7Z0JBQ2xGLE9BQU8sRUFBRSxrREFBK0I7Z0JBQ3hDLFNBQVMsRUFBRSxrQ0FBd0I7Z0JBQ25DLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSx5REFBcUMsRUFBRSxTQUFTLEVBQUUsbUNBQXlCLHVEQUFtQyxDQUFDLEVBQUU7YUFDakk7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGdCQUFnQjtRQUNsRyxJQUFJLGFBQWEsWUFBWSxhQUFhLEVBQUUsQ0FBQztZQUM1QyxNQUFNLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNqQyxDQUFDO0lBQ0YsQ0FBQzs7QUFHRixNQUFNLFlBQWEsU0FBUSxPQUFPO2FBQ2pCLE9BQUUsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUM7SUFFakQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsWUFBWSxDQUFDLEVBQUU7WUFDbkIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxzQkFBc0IsRUFBRSxRQUFRLENBQUM7WUFDbEQsUUFBUSxFQUFFLHFCQUFxQjtZQUMvQixJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU87WUFDckIsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUscUJBQXFCO1lBQ25DLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLHdCQUF3QjtnQkFDbkMsS0FBSyxFQUFFLFlBQVk7Z0JBQ25CLEtBQUssRUFBRSxDQUFDO2dCQUNSLEdBQUcsRUFBRTtvQkFDSixFQUFFLEVBQUUsZ0JBQWdCLENBQUMsRUFBRTtvQkFDdkIsS0FBSyxFQUFFLFNBQVMsQ0FBQywwQkFBMEIsRUFBRSxhQUFhLENBQUM7b0JBQzNELElBQUksRUFBRSxPQUFPLENBQUMsT0FBTztpQkFDckI7YUFDRDtZQUNELFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsdUJBQXVCO2dCQUM3QixNQUFNLEVBQUUsOENBQW9DLEVBQUUsRUFBRSwyQ0FBMkM7Z0JBQzNGLE9BQU8sRUFBRSxpREFBNkI7Z0JBQ3RDLFNBQVMsRUFBRSxxQkFBWTtnQkFDdkIsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGlEQUE2QixFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7YUFDOUQ7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGdCQUFnQjtRQUNsRyxJQUFJLGFBQWEsWUFBWSxhQUFhLEVBQUUsQ0FBQztZQUM1QyxNQUFNLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQzs7QUFHRixNQUFNLGdCQUFpQixTQUFRLE9BQU87YUFDckIsT0FBRSxHQUFHLG9CQUFvQixDQUFDLFVBQVUsQ0FBQztJQUVyRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFO1lBQ3ZCLEtBQUssRUFBRSxTQUFTLENBQUMsMEJBQTBCLEVBQUUsYUFBYSxDQUFDO1lBQzNELFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPO1lBQ3JCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLHFCQUFxQjtZQUNuQyxVQUFVLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLHVCQUF1QjtnQkFDN0IsTUFBTSxFQUFFLDhDQUFvQyxFQUFFLEVBQUUsMkNBQTJDO2dCQUMzRixPQUFPLEVBQUUsbURBQTZCLHdCQUFlO2dCQUNyRCxTQUFTLEVBQUUsQ0FBQywrQ0FBMkIsQ0FBQztnQkFDeEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLG1EQUE2Qix3QkFBZSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7YUFDN0U7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGdCQUFnQjtRQUNsRyxJQUFJLGFBQWEsWUFBWSxhQUFhLEVBQUUsQ0FBQztZQUM1QyxNQUFNLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEMsQ0FBQztJQUNGLENBQUM7O0FBR0YsTUFBTSxtQkFBb0IsU0FBUSxPQUFPO2FBQ3hCLE9BQUUsR0FBRyxvQkFBb0IsQ0FBQyxhQUFhLENBQUM7SUFFeEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsbUJBQW1CLENBQUMsRUFBRTtZQUMxQixLQUFLLEVBQUUsU0FBUyxDQUFDLDZCQUE2QixFQUFFLGlCQUFpQixDQUFDO1lBQ2xFLFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUscUJBQXFCO1lBQ25DLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsT0FBTyxFQUFFLGlEQUE2QjthQUN0QztTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsZ0JBQWdCO1FBQ2xHLElBQUksYUFBYSxZQUFZLGFBQWEsRUFBRSxDQUFDO1lBQzVDLE1BQU0sYUFBYSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JDLENBQUM7SUFDRixDQUFDOztBQUdGLE1BQU0sMkJBQTRCLFNBQVEsT0FBTzthQUNoQyxPQUFFLEdBQUcsb0JBQW9CLENBQUMsWUFBWSxDQUFDO0lBRXZEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDJCQUEyQixDQUFDLEVBQUU7WUFDbEMsS0FBSyxFQUFFLFNBQVMsQ0FBQyw0QkFBNEIsRUFBRSwwQkFBMEIsQ0FBQztZQUMxRSxRQUFRLEVBQUUscUJBQXFCO1lBQy9CLElBQUksRUFBRSxPQUFPLENBQUMsWUFBWTtZQUMxQixFQUFFLEVBQUUsSUFBSTtZQUNSLHdGQUF3RjtZQUN4RixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSx1QkFBdUIsQ0FBQztZQUNoRixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxxQkFBcUI7Z0JBQ2hDLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxJQUFJO2dCQUM5QixLQUFLLEVBQUUsRUFBRTthQUNUO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxnQkFBZ0I7UUFDbEcsSUFBSSxhQUFhLFlBQVksYUFBYSxFQUFFLENBQUM7WUFDNUMsTUFBTSxHQUFHLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25DLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQ1QsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDN0IsZ0dBQWdHO29CQUNoRyxZQUFZLEVBQUUsSUFBSTtvQkFDbEIsc0pBQXNKO29CQUN0Six1QkFBdUIsRUFBRSxLQUFLO2lCQUM5QixDQUFDLENBQUM7WUFDSixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7O0FBR0YsTUFBTSx5QkFBMEIsU0FBUSxPQUFPO2FBQzlCLE9BQUUsR0FBRyxvQkFBb0IsQ0FBQyxZQUFZLENBQUM7SUFFdkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUseUJBQXlCLENBQUMsRUFBRTtZQUNoQyxLQUFLLEVBQUUsU0FBUyxDQUFDLDRCQUE0QixFQUFFLHVCQUF1QixDQUFDO1lBQ3ZFLFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxZQUFZO1lBQzFCLEVBQUUsRUFBRSxLQUFLO1lBQ1QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsa0JBQWtCLENBQUMsUUFBUTtnQkFDbEMsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQzdELE1BQU0sa0JBQWtCLENBQUMsWUFBWSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1EQUFtRCxFQUFFLENBQUMsQ0FBQztJQUN2RyxDQUFDOztBQUdGLG1CQUFtQjtBQUNuQixlQUFlLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDOUIsZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ2pDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM5QixlQUFlLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUVsQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNyQyxlQUFlLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUM3QyxlQUFlLENBQUMseUJBQXlCLENBQUMsQ0FBQyJ9