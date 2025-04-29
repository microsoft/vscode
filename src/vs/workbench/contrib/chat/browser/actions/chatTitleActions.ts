/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { marked } from '../../../../../base/common/marked/marked.js';
import { basename } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ResourceNotebookCellEdit } from '../../../bulkEdit/browser/bulkCellEdits.js';
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';
import { INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { CellEditType, CellKind, NOTEBOOK_EDITOR_ID } from '../../../notebook/common/notebookCommon.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../notebook/common/notebookContextKeys.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, isChatEditingActionContext } from '../../common/chatEditingService.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatService } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ChatMode } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

export const MarkUnhelpfulActionId = 'workbench.action.chat.markUnhelpful';
const enableFeedbackConfig = 'config.telemetry.feedback.enabled';

export function registerChatTitleActions() {
	registerAction2(class MarkHelpfulAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.markHelpful',
				title: localize2('interactive.helpful.label', "Helpful"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.thumbsup,
				toggled: ChatContextKeys.responseVote.isEqualTo('up'),
				menu: [{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate(), ContextKeyExpr.has(enableFeedbackConfig))
				}, {
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate(), ContextKeyExpr.has(enableFeedbackConfig))
				}]
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction({
				agentId: item.agent?.id,
				command: item.slashCommand?.name,
				sessionId: item.sessionId,
				requestId: item.requestId,
				result: item.result,
				action: {
					kind: 'vote',
					direction: ChatAgentVoteDirection.Up,
					reason: undefined
				}
			});
			item.setVote(ChatAgentVoteDirection.Up);
			item.setVoteDownReason(undefined);
		}
	});

	registerAction2(class MarkUnhelpfulAction extends Action2 {
		constructor() {
			super({
				id: MarkUnhelpfulActionId,
				title: localize2('interactive.unhelpful.label', "Unhelpful"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.thumbsdown,
				toggled: ChatContextKeys.responseVote.isEqualTo('down'),
				menu: [{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ContextKeyExpr.has(enableFeedbackConfig))
				}, {
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate(), ContextKeyExpr.has(enableFeedbackConfig))
				}]
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const reason = args[1];
			if (typeof reason !== 'string') {
				return;
			}

			item.setVote(ChatAgentVoteDirection.Down);
			item.setVoteDownReason(reason as ChatAgentVoteDownReason);

			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction({
				agentId: item.agent?.id,
				command: item.slashCommand?.name,
				sessionId: item.sessionId,
				requestId: item.requestId,
				result: item.result,
				action: {
					kind: 'vote',
					direction: ChatAgentVoteDirection.Down,
					reason: item.voteDownReason
				}
			});
		}
	});

	registerAction2(class ReportIssueForBugAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.reportIssueForBug',
				title: localize2('interactive.reportIssueForBug.label', "Report Issue"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.report,
				menu: [{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 3,
					when: ContextKeyExpr.and(ChatContextKeys.responseSupportsIssueReporting, ChatContextKeys.isResponse, ContextKeyExpr.has(enableFeedbackConfig))
				}, {
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					group: 'navigation',
					order: 3,
					when: ContextKeyExpr.and(ChatContextKeys.responseSupportsIssueReporting, ChatContextKeys.isResponse, ContextKeyExpr.has(enableFeedbackConfig))
				}]
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction({
				agentId: item.agent?.id,
				command: item.slashCommand?.name,
				sessionId: item.sessionId,
				requestId: item.requestId,
				result: item.result,
				action: {
					kind: 'bug'
				}
			});
		}
	});

	registerAction2(class RetryChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.retry',
				title: localize2('chat.retry.label', "Retry"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.refresh,
				menu: [
					{
						id: MenuId.ChatMessageFooter,
						group: 'navigation',
						when: ContextKeyExpr.and(
							ChatContextKeys.isResponse,
							ContextKeyExpr.in(ChatContextKeys.itemId.key, ChatContextKeys.lastItemId.key))
					},
					{
						id: MenuId.ChatEditingWidgetToolbar,
						group: 'navigation',
						when: applyingChatEditsFailedContextKey,
						order: 0
					}
				]
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const chatWidgetService = accessor.get(IChatWidgetService);

			let item = args[0];
			if (isChatEditingActionContext(item)) {
				// Resolve chat editing action context to the last response VM
				item = chatWidgetService.getWidgetBySessionId(item.sessionId)?.viewModel?.getItems().at(-1);
			}
			if (!isResponseVM(item)) {
				return;
			}

			const chatService = accessor.get(IChatService);
			const chatModel = chatService.getSession(item.sessionId);
			const chatRequests = chatModel?.getRequests();
			if (!chatRequests) {
				return;
			}
			const itemIndex = chatRequests?.findIndex(request => request.id === item.requestId);
			const widget = chatWidgetService.getWidgetBySessionId(item.sessionId);
			const mode = widget?.input.currentMode;
			if (chatModel && (mode === ChatMode.Edit || mode === ChatMode.Agent)) {
				const configurationService = accessor.get(IConfigurationService);
				const dialogService = accessor.get(IDialogService);
				const currentEditingSession = widget?.viewModel?.model.editingSession;
				if (!currentEditingSession) {
					return;
				}

				// Prompt if the last request modified the working set and the user hasn't already disabled the dialog
				const entriesModifiedInLastRequest = currentEditingSession.entries.get().filter((entry) => entry.lastModifyingRequestId === item.requestId);
				const shouldPrompt = entriesModifiedInLastRequest.length > 0 && configurationService.getValue('chat.editing.confirmEditRequestRetry') === true;
				const confirmation = shouldPrompt
					? await dialogService.confirm({
						title: localize('chat.retryLast.confirmation.title2', "Do you want to retry your last request?"),
						message: entriesModifiedInLastRequest.length === 1
							? localize('chat.retry.confirmation.message2', "This will undo edits made to {0} since this request.", basename(entriesModifiedInLastRequest[0].modifiedURI))
							: localize('chat.retryLast.confirmation.message2', "This will undo edits made to {0} files in your working set since this request. Do you want to proceed?", entriesModifiedInLastRequest.length),
						primaryButton: localize('chat.retry.confirmation.primaryButton', "Yes"),
						checkbox: { label: localize('chat.retry.confirmation.checkbox', "Don't ask again"), checked: false },
						type: 'info'
					})
					: { confirmed: true };

				if (!confirmation.confirmed) {
					return;
				}

				if (confirmation.checkboxChecked) {
					await configurationService.updateValue('chat.editing.confirmEditRequestRetry', false);
				}

				// Reset the snapshot to the first stop (undefined undo index)
				const snapshotRequest = chatRequests[itemIndex];
				if (snapshotRequest) {
					await currentEditingSession.restoreSnapshot(snapshotRequest.id, undefined);
				}
			}
			const request = chatModel?.getRequests().find(candidate => candidate.id === item.requestId);
			const languageModelId = widget?.input.currentLanguageModel;
			const userSelectedTools = widget?.input.currentMode === ChatMode.Agent ? widget.input.selectedToolsModel.tools.get().map(tool => tool.id) : undefined;
			chatService.resendRequest(request!, {
				userSelectedModelId: languageModelId,
				userSelectedTools,
				attempt: (request?.attempt ?? -1) + 1,
				mode: widget?.input.currentMode,
			});
		}
	});

	registerAction2(class InsertToNotebookAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.insertIntoNotebook',
				title: localize2('interactive.insertIntoNotebook.label', "Insert into Notebook"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.insert,
				menu: {
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					isHiddenByDefault: true,
					when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, ChatContextKeys.isResponse, ChatContextKeys.responseIsFiltered.negate())
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const editorService = accessor.get(IEditorService);

			if (editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
				const notebookEditor = editorService.activeEditorPane.getControl() as INotebookEditor;

				if (!notebookEditor.hasModel()) {
					return;
				}

				if (notebookEditor.isReadOnly) {
					return;
				}

				const value = item.response.toString();
				const splitContents = splitMarkdownAndCodeBlocks(value);

				const focusRange = notebookEditor.getFocus();
				const index = Math.max(focusRange.end, 0);
				const bulkEditService = accessor.get(IBulkEditService);

				await bulkEditService.apply(
					[
						new ResourceNotebookCellEdit(notebookEditor.textModel.uri,
							{
								editType: CellEditType.Replace,
								index: index,
								count: 0,
								cells: splitContents.map(content => {
									const kind = content.type === 'markdown' ? CellKind.Markup : CellKind.Code;
									const language = content.type === 'markdown' ? 'markdown' : content.language;
									const mime = content.type === 'markdown' ? 'text/markdown' : `text/x-${content.language}`;
									return {
										cellKind: kind,
										language,
										mime,
										source: content.content,
										outputs: [],
										metadata: {}
									};
								})
							}
						)
					],
					{ quotableLabel: 'Insert into Notebook' }
				);
			}
		}
	});
}

interface MarkdownContent {
	type: 'markdown';
	content: string;
}

interface CodeContent {
	type: 'code';
	language: string;
	content: string;
}

type Content = MarkdownContent | CodeContent;

function splitMarkdownAndCodeBlocks(markdown: string): Content[] {
	const lexer = new marked.Lexer();
	const tokens = lexer.lex(markdown);

	const splitContent: Content[] = [];

	let markdownPart = '';
	tokens.forEach((token) => {
		if (token.type === 'code') {
			if (markdownPart.trim()) {
				splitContent.push({ type: 'markdown', content: markdownPart });
				markdownPart = '';
			}
			splitContent.push({
				type: 'code',
				language: token.lang || '',
				content: token.text,
			});
		} else {
			markdownPart += token.raw;
		}
	});

	if (markdownPart.trim()) {
		splitContent.push({ type: 'markdown', content: markdownPart });
	}

	return splitContent;
}
