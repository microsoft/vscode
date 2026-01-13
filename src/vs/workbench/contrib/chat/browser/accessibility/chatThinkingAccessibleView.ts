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
import { IChatResponseViewModel, isResponseVM } from '../../common/model/chatViewModel.js';
import { localize } from '../../../../../nls.js';

export class ChatThinkingAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'chatThinking';
	readonly type = AccessibleViewType.View;
	readonly when = ChatContextKeys.inChatSession;

	getProvider(accessor: ServicesAccessor) {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const viewModel = widget.viewModel;
		if (!viewModel) {
			return;
		}

		// Get the latest response from the chat
		const items = viewModel.getItems();
		const latestResponse = [...items].reverse().find(item => isResponseVM(item));
		if (!latestResponse || !isResponseVM(latestResponse)) {
			return;
		}

		// Extract thinking content from the response
		const thinkingContent = this._extractThinkingContent(latestResponse);
		if (!thinkingContent) {
			return;
		}

		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatThinking,
			{ type: AccessibleViewType.View, id: AccessibleViewProviderId.ChatThinking, language: 'markdown' },
			() => thinkingContent,
			() => widget.focusInput(),
			AccessibilityVerbositySettingId.Chat
		);
	}

	private _extractThinkingContent(response: IChatResponseViewModel): string | undefined {
		const thinkingParts: string[] = [];
		for (const part of response.response.value) {
			if (part.kind === 'thinking') {
				const value = Array.isArray(part.value) ? part.value.join('') : (part.value || '');
				const trimmed = value.trim();
				if (trimmed) {
					thinkingParts.push(trimmed);
				}
			}
		}

		if (thinkingParts.length === 0) {
			return undefined;
		}

		const header = localize('chat.thinking.accessibleView.header', 'Thinking content from the latest response:');
		return `${header}\n\n${thinkingParts.join('\n\n')}`;
	}
}
