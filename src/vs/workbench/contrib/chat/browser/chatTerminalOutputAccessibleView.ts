/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { getFocusedTerminalToolProgressPart } from './chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';

export class ChatTerminalOutputAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'chatTerminalOutput';
	readonly type = AccessibleViewType.View;
	readonly when = ChatContextKeys.inChatTerminalToolOutput;

	getProvider(_accessor: ServicesAccessor) {
		const part = getFocusedTerminalToolProgressPart();
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
