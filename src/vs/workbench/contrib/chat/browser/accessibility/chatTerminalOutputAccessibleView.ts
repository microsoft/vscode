/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../../base/common/actions.js';
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

		let closed = false;
		let openingFullOutput = false;
		let fullOutputOpened = false;
		const restoreOutputFocus = () => {
			if (closed && !openingFullOutput && !fullOutputOpened) {
				part.focusOutput();
			}
		};
		const partFullOutputAction = part.fullOutputAction;
		const fullOutputAction = partFullOutputAction
			? toAction({
				id: partFullOutputAction.id,
				label: partFullOutputAction.label,
				tooltip: partFullOutputAction.tooltip,
				class: partFullOutputAction.class,
				enabled: partFullOutputAction.enabled,
				run: async () => {
					openingFullOutput = true;
					fullOutputOpened = false;
					try {
						const editor = await partFullOutputAction.run();
						fullOutputOpened = !!editor;
						return editor;
					} finally {
						openingFullOutput = false;
						restoreOutputFocus();
					}
				},
			})
			: undefined;
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatTerminalOutput,
			{ type: AccessibleViewType.View, id: AccessibleViewProviderId.ChatTerminalOutput, language: 'text' },
			() => content,
			() => {
				closed = true;
				restoreOutputFocus();
			},
			AccessibilityVerbositySettingId.TerminalChatOutput,
			undefined,
			fullOutputAction ? [fullOutputAction] : undefined,
		);
	}
}
