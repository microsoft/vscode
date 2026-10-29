/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatWidgetService } from '../chat.js';
import { getFocusedBackgroundShellOutputView } from '../sessionBackgroundShellOutputView.js';

/** Shows the focused background shell's command, status, and output as text. */
export class ChatBackgroundShellOutputAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'chatBackgroundShellOutput';
	readonly type = AccessibleViewType.View;
	readonly when = ChatContextKeys.inChatBackgroundShellOutput;

	getProvider(accessor: ServicesAccessor) {
		const view = getFocusedBackgroundShellOutputView();
		if (!view) {
			return;
		}
		const chatWidgetService = accessor.get(IChatWidgetService);
		// Opening the accessible view closes the picker that shows the output, so read it now.
		const content = view.getAccessibleContent();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatBackgroundShellOutput,
			{ type: AccessibleViewType.View, id: AccessibleViewProviderId.ChatBackgroundShellOutput, language: 'text' },
			() => content,
			() => {
				if (!view.focusOutput()) {
					chatWidgetService.lastFocusedWidget?.focusInput();
				}
			},
			AccessibilityVerbositySettingId.TerminalChatOutput,
		);
	}
}
