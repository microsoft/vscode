/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleViewProviderId, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { alertAccessibleViewFocusChange, IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IChatWidgetService, IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_IN_CHAT_SESSION } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatWelcomeMessageModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

export class ChatResponseAccessibleView implements IAccessibleViewImplentation {
	readonly priority = 100;
	readonly name = 'panelChat';
	readonly type = AccessibleViewType.View;
	readonly when = CONTEXT_IN_CHAT_SESSION;
	getProvider(accessor: ServicesAccessor) {
		const widgetService = accessor.get(IChatWidgetService);
		const codeEditorService = accessor.get(ICodeEditorService);
		return resolveProvider(widgetService, codeEditorService, true);
		function resolveProvider(widgetService: IChatWidgetService, codeEditorService: ICodeEditorService, initialRender?: boolean) {
			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}
			const chatInputFocused = initialRender && !!codeEditorService.getFocusedCodeEditor();
			if (initialRender && chatInputFocused) {
				widget.focusLastMessage();
			}

			if (!widget) {
				return;
			}

			const verifiedWidget: IChatWidget = widget;
			const focusedItem = verifiedWidget.getFocus();

			if (!focusedItem) {
				return;
			}

			widget.focus(focusedItem);
			const isWelcome = focusedItem instanceof ChatWelcomeMessageModel;
			let responseContent = isResponseVM(focusedItem) ? focusedItem.response.asString() : undefined;
			if (isWelcome) {
				const welcomeReplyContents = [];
				for (const content of focusedItem.content) {
					if (Array.isArray(content)) {
						welcomeReplyContents.push(...content.map(m => m.message));
					} else {
						welcomeReplyContents.push((content as IMarkdownString).value);
					}
				}
				responseContent = welcomeReplyContents.join('\n');
			}
			if (!responseContent && 'errorDetails' in focusedItem && focusedItem.errorDetails) {
				responseContent = focusedItem.errorDetails.message;
			}
			if (!responseContent) {
				return;
			}
			const responses = verifiedWidget.viewModel?.getItems().filter(i => isResponseVM(i));
			const length = responses?.length;
			const responseIndex = responses?.findIndex(i => i === focusedItem);

			return {
				id: AccessibleViewProviderId.Chat,
				verbositySettingKey: AccessibilityVerbositySettingId.Chat,
				provideContent(): string { return renderMarkdownAsPlaintext(new MarkdownString(responseContent), true); },
				onClose() {
					verifiedWidget.reveal(focusedItem);
					if (chatInputFocused) {
						verifiedWidget.focusInput();
					} else {
						verifiedWidget.focus(focusedItem);
					}
				},
				next() {
					verifiedWidget.moveFocus(focusedItem, 'next');
					alertAccessibleViewFocusChange(responseIndex, length, 'next');
					resolveProvider(widgetService, codeEditorService);
				},
				previous() {
					verifiedWidget.moveFocus(focusedItem, 'previous');
					alertAccessibleViewFocusChange(responseIndex, length, 'previous');
					resolveProvider(widgetService, codeEditorService);
				},
				options: { type: AccessibleViewType.View }
			};
		}
	}
	dispose() { }
}
