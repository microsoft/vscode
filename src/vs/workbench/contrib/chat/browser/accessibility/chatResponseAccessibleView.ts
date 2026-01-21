/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatExtensionsContent, IChatPullRequestContent, IChatSubagentToolInvocationData, IChatTerminalToolInvocationData, IChatTodoListContent, IChatToolInputInvocationData, IChatToolInvocation, ILegacyChatTerminalToolInvocationData, IToolResultOutputDetailsSerialized, isLegacyChatTerminalToolInvocationData } from '../../common/chatService/chatService.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { IToolResultInputOutputDetails, IToolResultOutputDetails, isToolResultInputOutputDetails, isToolResultOutputDetails, toolContentToA11yString } from '../../common/tools/languageModelToolsService.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../chat.js';
import { Location } from '../../../../../editor/common/languages.js';

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

type ToolSpecificData = IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatPullRequestContent | IChatTodoListContent | IChatSubagentToolInvocationData;
type ResultDetails = Array<URI | Location> | IToolResultInputOutputDetails | IToolResultOutputDetails | IToolResultOutputDetailsSerialized;

function isOutputDetailsSerialized(obj: unknown): obj is IToolResultOutputDetailsSerialized {
	return typeof obj === 'object' && obj !== null && 'output' in obj &&
		typeof (obj as IToolResultOutputDetailsSerialized).output === 'object' &&
		(obj as IToolResultOutputDetailsSerialized).output?.type === 'data' &&
		typeof (obj as IToolResultOutputDetailsSerialized).output?.base64Data === 'string';
}

export function getToolSpecificDataDescription(toolSpecificData: ToolSpecificData | undefined): string {
	if (!toolSpecificData) {
		return '';
	}

	if (isLegacyChatTerminalToolInvocationData(toolSpecificData) || toolSpecificData.kind === 'terminal') {
		const terminalData = migrateLegacyTerminalToolSpecificData(toolSpecificData);
		return terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
	}

	switch (toolSpecificData.kind) {
		case 'subagent': {
			const parts: string[] = [];
			if (toolSpecificData.agentName) {
				parts.push(localize('subagentName', "Agent: {0}", toolSpecificData.agentName));
			}
			if (toolSpecificData.description) {
				parts.push(toolSpecificData.description);
			}
			if (toolSpecificData.prompt) {
				parts.push(localize('subagentPrompt', "Task: {0}", toolSpecificData.prompt));
			}
			return parts.join('. ') || '';
		}
		case 'extensions':
			return toolSpecificData.extensions.length > 0
				? localize('extensionsList', "Extensions: {0}", toolSpecificData.extensions.join(', '))
				: '';
		case 'todoList': {
			const todos = toolSpecificData.todoList;
			if (todos.length === 0) {
				return '';
			}
			const todoDescriptions = todos.map(t =>
				localize('todoItem', "{0} ({1})", t.title, t.status)
			);
			return localize('todoListCount', "{0} items: {1}", todos.length, todoDescriptions.join('; '));
		}
		case 'pullRequest':
			return localize('pullRequestInfo', "PR: {0} by {1}", toolSpecificData.title, toolSpecificData.author);
		case 'input':
			return typeof toolSpecificData.rawInput === 'string'
				? toolSpecificData.rawInput
				: JSON.stringify(toolSpecificData.rawInput);
		default:
			return '';
	}
}

export function getResultDetailsDescription(resultDetails: ResultDetails | undefined): { input?: string; files?: string[]; isError?: boolean } {
	if (!resultDetails) {
		return {};
	}

	if (Array.isArray(resultDetails)) {
		const files = resultDetails.map(ref => {
			if (URI.isUri(ref)) {
				return ref.fsPath || ref.path;
			}
			return ref.uri.fsPath || ref.uri.path;
		});
		return { files };
	}

	if (isToolResultInputOutputDetails(resultDetails)) {
		return {
			input: resultDetails.input,
			isError: resultDetails.isError
		};
	}

	if (isOutputDetailsSerialized(resultDetails)) {
		return {
			input: localize('binaryOutput', "{0} data", resultDetails.output.mimeType)
		};
	}

	if (isToolResultOutputDetails(resultDetails)) {
		return {
			input: localize('binaryOutput', "{0} data", resultDetails.output.mimeType)
		};
	}

	return {};
}

export function getToolInvocationA11yDescription(
	invocationMessage: string | undefined,
	pastTenseMessage: string | undefined,
	toolSpecificData: ToolSpecificData | undefined,
	resultDetails: ResultDetails | undefined,
	isComplete: boolean
): string {
	const parts: string[] = [];

	const message = isComplete && pastTenseMessage ? pastTenseMessage : invocationMessage;
	if (message) {
		parts.push(message);
	}

	const toolDataDesc = getToolSpecificDataDescription(toolSpecificData);
	if (toolDataDesc) {
		parts.push(toolDataDesc);
	}

	if (isComplete && resultDetails) {
		const details = getResultDetailsDescription(resultDetails);
		if (details.isError) {
			parts.unshift(localize('errored', "Errored"));
		}
		if (details.input && !toolDataDesc) {
			parts.push(localize('input', "Input: {0}", details.input));
		}
		if (details.files && details.files.length > 0) {
			parts.push(localize('files', "Files: {0}", details.files.join(', ')));
		}
	}

	return parts.join('. ');
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

	private _renderMessageAsPlaintext(message: string | IMarkdownString): string {
		return typeof message === 'string' ? message : stripIcons(renderAsPlaintext(message, { useLinkFormatter: true }));
	}

	private _getContent(item: ChatTreeItem): string {
		const contentParts: string[] = [];

		if (!isResponseVM(item)) {
			return '';
		}

		if ('errorDetails' in item && item.errorDetails) {
			contentParts.push(item.errorDetails.message);
		}

		// Process all parts in order to maintain the natural flow
		for (const part of item.response.value) {
			switch (part.kind) {
				case 'thinking': {
					const thinkingValue = Array.isArray(part.value) ? part.value.join('') : (part.value || '');
					const trimmed = thinkingValue.trim();
					if (trimmed) {
						contentParts.push(localize('thinkingContent', "Thinking: {0}", trimmed));
					}
					break;
				}
				case 'markdownContent': {
					const text = renderAsPlaintext(part.content, { includeCodeBlocksFences: true, useLinkFormatter: true });
					if (text.trim()) {
						contentParts.push(text);
					}
					break;
				}
				case 'elicitation2':
				case 'elicitationSerialized': {
					const title = part.title;
					let elicitationContent = '';
					if (typeof title === 'string') {
						elicitationContent += `${title}\n`;
					} else if (isMarkdownString(title)) {
						elicitationContent += renderAsPlaintext(title, { includeCodeBlocksFences: true }) + '\n';
					}
					const message = part.message;
					if (isMarkdownString(message)) {
						elicitationContent += renderAsPlaintext(message, { includeCodeBlocksFences: true });
					} else {
						elicitationContent += message;
					}
					if (elicitationContent.trim()) {
						contentParts.push(elicitationContent);
					}
					break;
				}
				case 'toolInvocation': {
					const state = part.state.get();
					if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title) {
						const title = this._renderMessageAsPlaintext(state.confirmationMessages.title);
						const message = state.confirmationMessages.message ? this._renderMessageAsPlaintext(state.confirmationMessages.message) : '';
						const toolDataDesc = getToolSpecificDataDescription(part.toolSpecificData);
						let toolContent = title;
						if (toolDataDesc) {
							toolContent += `: ${toolDataDesc}`;
						}
						if (message) {
							toolContent += `\n${message}`;
						}
						contentParts.push(toolContent);
					} else if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
						const postApprovalDetails = isToolResultInputOutputDetails(state.resultDetails)
							? state.resultDetails.input
							: isToolResultOutputDetails(state.resultDetails)
								? undefined
								: toolContentToA11yString(state.contentForModel);
						contentParts.push(localize('toolPostApprovalA11yView', "Approve results of {0}? Result: ", part.toolId) + (postApprovalDetails ?? ''));
					} else {
						const resultDetails = IChatToolInvocation.resultDetails(part);
						const isComplete = IChatToolInvocation.isComplete(part);
						const description = getToolInvocationA11yDescription(
							this._renderMessageAsPlaintext(part.invocationMessage),
							part.pastTenseMessage ? this._renderMessageAsPlaintext(part.pastTenseMessage) : undefined,
							part.toolSpecificData,
							resultDetails,
							isComplete
						);
						if (description) {
							contentParts.push(description);
						}
					}
					break;
				}
				case 'toolInvocationSerialized': {
					const description = getToolInvocationA11yDescription(
						this._renderMessageAsPlaintext(part.invocationMessage),
						part.pastTenseMessage ? this._renderMessageAsPlaintext(part.pastTenseMessage) : undefined,
						part.toolSpecificData,
						part.resultDetails,
						part.isComplete
					);
					if (description) {
						contentParts.push(description);
					}
					break;
				}
			}
		}

		return this._normalizeWhitespace(contentParts.join('\n'));
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
