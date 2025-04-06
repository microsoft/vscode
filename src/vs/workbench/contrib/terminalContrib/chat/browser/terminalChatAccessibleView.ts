/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TerminalChatController } from './terminalChatController.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatContextKeys } from './terminalChat.js';
import { IAction } from '../../../../../base/common/actions.js';

export class TerminalInlineChatAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'terminalInlineChat';
	readonly type = AccessibleViewType.View;
	readonly when = TerminalChatContextKeys.focused;

	getProvider(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
		const menuService = accessor.get(IMenuService);
		const actions: IAction[] = [];
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

		const controller: TerminalChatController | undefined = terminalService.activeInstance?.getContribution(TerminalChatController.ID) ?? undefined;
		if (!controller?.lastResponseContent) {
			return;
		}
		const responseContent = controller.lastResponseContent;
		return new AccessibleContentProvider(
			AccessibleViewProviderId.TerminalChat,
			{ type: AccessibleViewType.View },
			() => { return responseContent; },
			() => {
				controller.focus();
			},
			AccessibilityVerbositySettingId.InlineChat,
			undefined,
			actions
		);
	}
}
