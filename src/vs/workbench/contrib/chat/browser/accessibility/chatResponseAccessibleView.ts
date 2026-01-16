/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatToolInvocation } from '../../common/chatService/chatService.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, toolContentToA11yString, ToolInvocationPresentation } from '../../common/tools/languageModelToolsService.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../chat.js';

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
	private _focusedItem!: ChatTreeItem;
	private readonly _focusedItemDisposables = this._register(new DisposableStore());
	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	constructor(
		private readonly _widget: IChatWidget,
		item: ChatTreeItem,
		private readonly _wasOpenedFromInput: boolean
	) {
		super();
		this._setFocusedItem(item);
	}

	readonly id = AccessibleViewProviderId.PanelChat;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Chat;
	readonly options = { type: AccessibleViewType.View };

	provideContent(): string {
		return this._getContent(this._focusedItem);
	}

	private _setFocusedItem(item: ChatTreeItem): void {
		this._focusedItem = item;
		this._focusedItemDisposables.clear();
		if (isResponseVM(item)) {
			this._focusedItemDisposables.add(item.model.onDidChange(() => this._onDidChangeContent.fire()));
		}
	}

	private _getContent(item: ChatTreeItem): string {
		let responseContent = isResponseVM(item) ? item.response.toString() : '';
		if (!responseContent && 'errorDetails' in item && item.errorDetails) {
			responseContent = item.errorDetails.message;
		}
		if (isResponseVM(item)) {
			item.response.value.filter(item => item.kind === 'elicitation2' || item.kind === 'elicitationSerialized').forEach(elicitation => {
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
				// Skip hidden tool invocations
				if (toolInvocation.presentation === ToolInvocationPresentation.Hidden) {
					continue;
				}

				const state = toolInvocation.state.get();

				// Skip completed tool invocations since they're already included via response.toString()
				if (IChatToolInvocation.isComplete(toolInvocation)) {
					continue;
				}

				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title) {
					const title = typeof state.confirmationMessages.title === 'string' ? state.confirmationMessages.title : state.confirmationMessages.title.value;
					const message = typeof state.confirmationMessages.message === 'string' ? state.confirmationMessages.message : stripIcons(renderAsPlaintext(state.confirmationMessages.message!));
					let input = '';
					if (toolInvocation.toolSpecificData) {
						if (toolInvocation.toolSpecificData?.kind === 'terminal') {
							const terminalData = migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData);
							input = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
						} else if (toolInvocation.toolSpecificData?.kind === 'subagent') {
							input = toolInvocation.toolSpecificData.description ?? '';
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
					const postApprovalDetails = isToolResultInputOutputDetails(state.resultDetails)
						? state.resultDetails.input
						: isToolResultOutputDetails(state.resultDetails)
							? undefined
							: toolContentToA11yString(state.contentForModel);
					responseContent += localize('toolPostApprovalA11yView', "Approve results of {0}? Result: ", toolInvocation.toolId) + (postApprovalDetails ?? '') + '\n';
				}
			}

			// Note: Completed/serialized tool invocations are already included via response.toString()
			// so we don't need to process them again here
		}
		const plainText = renderAsPlaintext(new MarkdownString(responseContent), { includeCodeBlocksFences: true });
		return this._normalizeWhitespace(plainText);
	}

	private _normalizeWhitespace(content: string): string {
		const lines = content.split(/\r?\n/);
		const normalized: string[] = [];
		for (const line of lines) {
			if (line.trim().length === 0) {
				continue;
			}
			normalized.push(line);
		}
		return normalized.join('\n');
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
			this._setFocusedItem(next);
			return this._getContent(next);
		}
		return;
	}

	providePreviousContent(): string | undefined {
		const previous = this._widget.getSibling(this._focusedItem, 'previous');
		if (previous) {
			this._setFocusedItem(previous);
			return this._getContent(previous);
		}
		return;
	}
}
