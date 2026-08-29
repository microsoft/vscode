/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ITerminalChatService } from '../../../terminal/browser/terminal.js';

export class ChatTerminalOutputAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'chatTerminalOutput';
	readonly type = AccessibleViewType.View;
	readonly when = ChatContextKeys.inChatTerminalToolOutput;

	getProvider(accessor: ServicesAccessor) {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getFocusedProgressPart();
		if (!part) {
			return;
		}

		const content = part.getCommandAndOutputAsText();
		if (!content) {
			return;
		}

		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatTerminalOutput,
			{ type: AccessibleViewType.View, id: AccessibleViewProviderId.ChatTerminalOutput, language: 'text' },
			() => content,
			() => part.focusOutput(),
			AccessibilityVerbositySettingId.TerminalChatOutput
		);
	}
}
