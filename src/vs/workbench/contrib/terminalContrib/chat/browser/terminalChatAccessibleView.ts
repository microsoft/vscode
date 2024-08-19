/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { TerminalChatContextKeys } from 'vs/workbench/contrib/terminal/browser/terminalContribExports';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class TerminalInlineChatAccessibleView implements IAccessibleViewImplentation {
	readonly priority = 105;
	readonly name = 'terminalInlineChat';
	readonly type = AccessibleViewType.View;
	readonly when = TerminalChatContextKeys.focused;
	getProvider(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
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
		);
	}
}
