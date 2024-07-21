/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IChatWidgetService, IChatWidget, ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_IN_CHAT_SESSION } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatWelcomeMessageModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { Disposable } from 'vs/base/common/lifecycle';

export class ChatResponseAccessibleView implements IAccessibleViewImplentation {
	readonly priority = 100;
	readonly name = 'panelChat';
	readonly type = AccessibleViewType.View;
	readonly when = CONTEXT_IN_CHAT_SESSION;
	private _initialRender = true;
	getProvider(accessor: ServicesAccessor) {
		const widgetService = accessor.get(IChatWidgetService);
		const codeEditorService = accessor.get(ICodeEditorService);

		const widget = widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		const chatInputFocused = this._initialRender && !!codeEditorService.getFocusedCodeEditor() || false;
		if (this._initialRender && chatInputFocused) {
			widget.focusLastMessage();
			this._initialRender = false;
		}

		if (!widget) {
			return;
		}

		const verifiedWidget: IChatWidget = widget;
		const focusedItem = verifiedWidget.getFocus();

		if (!focusedItem) {
			return;
		}

		return new ChatResponseAccessibleProvider(verifiedWidget, focusedItem, chatInputFocused);
	}
}

class ChatResponseAccessibleProvider extends Disposable implements IAccessibleViewContentProvider {
	private _focusedItem: ChatTreeItem;
	constructor(
		private readonly _widget: IChatWidget,
		item: ChatTreeItem,
		private readonly _chatInputFocused: boolean
	) {
		super();
		this._focusedItem = item;
	}

	readonly id = AccessibleViewProviderId.Chat;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Chat;
	readonly options = { type: AccessibleViewType.View };

	provideContent(): string {
		return this._getContent(this._focusedItem);
	}

	private _getContent(item: ChatTreeItem): string {
		const isWelcome = item instanceof ChatWelcomeMessageModel;
		let responseContent = isResponseVM(item) ? item.response.toString() : '';
		if (isWelcome) {
			const welcomeReplyContents = [];
			for (const content of item.content) {
				if (Array.isArray(content)) {
					welcomeReplyContents.push(...content.map(m => m.message));
				} else {
					welcomeReplyContents.push((content as IMarkdownString).value);
				}
			}
			responseContent = welcomeReplyContents.join('\n');
		}
		if (!responseContent && 'errorDetails' in item && item.errorDetails) {
			responseContent = item.errorDetails.message;
		}
		return renderMarkdownAsPlaintext(new MarkdownString(responseContent), true);
	}

	onClose(): void {
		this._widget.reveal(this._focusedItem);
		if (this._chatInputFocused) {
			this._widget.focusInput();
		} else {
			this._widget.focus(this._focusedItem);
		}
	}

	provideNextContent(): string | undefined {
		const next = this._widget.getSibling(this._focusedItem, 'next');
		if (next) {
			this._focusedItem = next;
			return this._getContent(next);
		}
		return;
	}

	providePreviousContent(): string | undefined {
		const previous = this._widget.getSibling(this._focusedItem, 'previous');
		if (previous) {
			this._focusedItem = previous;
			return this._getContent(previous);
		}
		return;
	}
}

