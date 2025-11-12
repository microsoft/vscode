/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { isMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { migrateLegacyTerminalToolSpecificData } from '../common/chat.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatToolInvocation } from '../common/chatService.js';
import { isResponseVM } from '../common/chatViewModel.js';
import { toolContentToA11yString } from '../common/languageModelToolsService.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from './chat.js';

export class ChatResponseAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'panelChat';
	readonly type = AccessibleViewType.View;
	readonly when = ChatContextKeys.inChatSession;
	getProvider(accessor: ServicesAccessor) {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		const chatInputFocused = widget.hasInputFocus();
		if (chatInputFocused) {
			widget.focusResponseItem();
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
		private readonly _wasOpenedFromInput: boolean
	) {
		super();
		this._focusedItem = item;
	}

	readonly id = AccessibleViewProviderId.PanelChat;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Chat;
	readonly options = { type: AccessibleViewType.View };

	provideContent(): string {
		return this._getContent(this._focusedItem);
	}

	private _getContent(item: ChatTreeItem): string {
		let responseContent = isResponseVM(item) ? item.response.toString() : '';
		if (!responseContent && 'errorDetails' in item && item.errorDetails) {
			responseContent = item.errorDetails.message;
		}
		if (isResponseVM(item)) {
			item.response.value.filter(item => item.kind === 'elicitation').forEach(elicitation => {
				const title = elicitation.title;
				if (typeof title === 'string') {
					responseContent += `${title}\n`;
				} else if (isMarkdownString(title)) {
					responseContent += renderAsPlaintext(title, { includeCodeBlocksFences: true }) + '\n';
				}
				const message = elicitation.message;
				if (isMarkdownString(message)) {
					responseContent += renderAsPlaintext(message, { includeCodeBlocksFences: true });
				} else {
					responseContent += message;
				}
			});
			const toolInvocations = item.response.value.filter(item => item.kind === 'toolInvocation');
			for (const toolInvocation of toolInvocations) {
				const state = toolInvocation.state.get();
				if (toolInvocation.confirmationMessages?.title && state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
					const title = typeof toolInvocation.confirmationMessages.title === 'string' ? toolInvocation.confirmationMessages.title : toolInvocation.confirmationMessages.title.value;
					const message = typeof toolInvocation.confirmationMessages.message === 'string' ? toolInvocation.confirmationMessages.message : stripIcons(renderAsPlaintext(toolInvocation.confirmationMessages.message!));
					let input = '';
					if (toolInvocation.toolSpecificData) {
						if (toolInvocation.toolSpecificData?.kind === 'terminal') {
							const terminalData = migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData);
							input = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
						} else {
							input = toolInvocation.toolSpecificData?.kind === 'extensions'
								? JSON.stringify(toolInvocation.toolSpecificData.extensions)
								: toolInvocation.toolSpecificData?.kind === 'todoList'
									? JSON.stringify(toolInvocation.toolSpecificData.todoList)
									: toolInvocation.toolSpecificData?.kind === 'pullRequest'
										? JSON.stringify(toolInvocation.toolSpecificData)
										: JSON.stringify(toolInvocation.toolSpecificData.rawInput);
						}
					}
					responseContent += `${title}`;
					if (input) {
						responseContent += `: ${input}`;
					}
					responseContent += `\n${message}\n`;
				} else if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					responseContent += localize('toolPostApprovalA11yView', "Approve results of {0}? Result: ", toolInvocation.toolId) + toolContentToA11yString(state.contentForModel) + '\n';
				} else {
					const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);
					if (resultDetails && 'input' in resultDetails) {
						responseContent += '\n' + (resultDetails.isError ? 'Errored ' : 'Completed ');
						responseContent += `${`${typeof toolInvocation.invocationMessage === 'string' ? toolInvocation.invocationMessage : stripIcons(renderAsPlaintext(toolInvocation.invocationMessage))} with input: ${resultDetails.input}`}\n`;
					}
				}
			}

			const pastConfirmations = item.response.value.filter(item => item.kind === 'toolInvocationSerialized');
			for (const pastConfirmation of pastConfirmations) {
				if (pastConfirmation.isComplete && pastConfirmation.resultDetails && 'input' in pastConfirmation.resultDetails) {
					if (pastConfirmation.pastTenseMessage) {
						responseContent += `\n${`${typeof pastConfirmation.pastTenseMessage === 'string' ? pastConfirmation.pastTenseMessage : stripIcons(renderAsPlaintext(pastConfirmation.pastTenseMessage))} with input: ${pastConfirmation.resultDetails.input}`}\n`;
					}
				}
			}
		}
		return renderAsPlaintext(new MarkdownString(responseContent), { includeCodeBlocksFences: true });
	}

	onClose(): void {
		this._widget.reveal(this._focusedItem);
		if (this._wasOpenedFromInput) {
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
