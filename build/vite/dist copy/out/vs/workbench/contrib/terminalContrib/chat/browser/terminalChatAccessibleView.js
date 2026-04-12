/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TerminalChatController } from './terminalChatController.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatContextKeys } from './terminalChat.js';
export class TerminalInlineChatAccessibleView {
    constructor() {
        this.priority = 105;
        this.name = 'terminalInlineChat';
        this.type = "view" /* AccessibleViewType.View */;
        this.when = TerminalChatContextKeys.focused;
    }
    getProvider(accessor) {
        const terminalService = accessor.get(ITerminalService);
        const menuService = accessor.get(IMenuService);
        const actions = [];
        const contextKeyService = TerminalChatController.activeChatController?.scopedContextKeyService;
        if (contextKeyService) {
            const menuActions = menuService.getMenuActions(MENU_TERMINAL_CHAT_WIDGET_STATUS, contextKeyService);
            for (const action of menuActions) {
                for (const a of action[1]) {
                    if (a instanceof MenuItemAction) {
                        actions.push(a);
                    }
                }
            }
        }
        const controller = terminalService.activeInstance?.getContribution(TerminalChatController.ID) ?? undefined;
        if (!controller?.lastResponseContent) {
            return;
        }
        const responseContent = controller.lastResponseContent;
        return new AccessibleContentProvider("terminal-chat" /* AccessibleViewProviderId.TerminalChat */, { type: "view" /* AccessibleViewType.View */ }, () => { return responseContent; }, () => {
            controller.focus();
        }, "accessibility.verbosity.inlineChat" /* AccessibilityVerbositySettingId.InlineChat */, undefined, actions);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDaGF0QWNjZXNzaWJsZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdC9icm93c2VyL3Rlcm1pbmFsQ2hhdEFjY2Vzc2libGVWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBZ0QseUJBQXlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUUxSixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUdyRSxPQUFPLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRzlGLE1BQU0sT0FBTyxnQ0FBZ0M7SUFBN0M7UUFDVSxhQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ2YsU0FBSSxHQUFHLG9CQUFvQixDQUFDO1FBQzVCLFNBQUksd0NBQTJCO1FBQy9CLFNBQUksR0FBRyx1QkFBdUIsQ0FBQyxPQUFPLENBQUM7SUFtQ2pELENBQUM7SUFqQ0EsV0FBVyxDQUFDLFFBQTBCO1FBQ3JDLE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN2RCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQy9DLE1BQU0sT0FBTyxHQUFjLEVBQUUsQ0FBQztRQUM5QixNQUFNLGlCQUFpQixHQUFHLHNCQUFzQixDQUFDLG9CQUFvQixFQUFFLHVCQUF1QixDQUFDO1FBQy9GLElBQUksaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsY0FBYyxDQUFDLGdDQUFnQyxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFDcEcsS0FBSyxNQUFNLE1BQU0sSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDbEMsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDM0IsSUFBSSxDQUFDLFlBQVksY0FBYyxFQUFFLENBQUM7d0JBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2pCLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQXVDLGVBQWUsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQyxJQUFJLFNBQVMsQ0FBQztRQUMvSSxJQUFJLENBQUMsVUFBVSxFQUFFLG1CQUFtQixFQUFFLENBQUM7WUFDdEMsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsbUJBQW1CLENBQUM7UUFDdkQsT0FBTyxJQUFJLHlCQUF5Qiw4REFFbkMsRUFBRSxJQUFJLHNDQUF5QixFQUFFLEVBQ2pDLEdBQUcsRUFBRSxHQUFHLE9BQU8sZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUNqQyxHQUFHLEVBQUU7WUFDSixVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDcEIsQ0FBQyx5RkFFRCxTQUFTLEVBQ1QsT0FBTyxDQUNQLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==