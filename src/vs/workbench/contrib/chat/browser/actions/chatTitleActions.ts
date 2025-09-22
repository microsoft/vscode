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
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { ResourceNotebookCellEdit } from '../../../bulkEdit/browser/bulkCellEdits.js';
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';
import { INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { CellEditType, CellKind, NOTEBOOK_EDITOR_ID } from '../../../notebook/common/notebookCommon.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../notebook/common/notebookContextKeys.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, isChatEditingActionContext } from '../../common/chatEditingService.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatService } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ChatModeKind, ChatAgentLocation } from '../../common/constants.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { IChatEditorOptions } from '../chatEditor.js';
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
					order: 2,
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
					order: 3,
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
					order: 4,
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
			const mode = widget?.input.currentModeKind;
			if (chatModel && (mode === ChatModeKind.Edit || mode === ChatModeKind.Agent)) {
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

			chatService.resendRequest(request!, {
				userSelectedModelId: languageModelId,
				attempt: (request?.attempt ?? -1) + 1,
				...widget?.getModeRequestOptions(),
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

	// Branch Conversation action: create a new session containing all content up to the selected message
	registerAction2(class BranchChatAtMessageAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.branchAtMessage',
				title: localize2('chat.branchAtMessage', "Branch Here"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.gitBranch,
				menu: [{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 15,
					when: ContextKeyExpr.and(
						ChatContextKeys.extensionParticipantRegistered,
						ContextKeyExpr.or(
							ChatContextKeys.isRequest,
							ContextKeyExpr.and(
								ChatContextKeys.isResponse,
								ChatContextKeys.responseHasError.negate(),
								ChatContextKeys.responseIsFiltered.negate()
							)
						)
					)
				}]
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!item) {
				return;
			}

			const chatService = accessor.get(IChatService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const editorService = accessor.get(IEditorService);

			const sessionId: string | undefined = item.sessionId;
			if (!sessionId) {
				return;
			}
			const model = chatService.getSession(sessionId);
			if (!model) {
				return;
			}

			// Determine the originating request id and whether this is a response item
			const isResponse = isResponseVM(item);
			const targetRequestId: string | undefined = isResponse ? item.requestId : (item.requestId ?? item.id);
			if (!targetRequestId) {
				return;
			}

			const fullSerializable = model.toJSON();
			const serializedRequests = fullSerializable.requests;
			const targetIndex = serializedRequests.findIndex(r => r.requestId === targetRequestId);
			if (targetIndex === -1) {
				return;
			}

			// Include all requests up to and including the target request.
			// Deep-ish clone to avoid mutating the original serialized data (responses may be arrays of objects).
			const subset = serializedRequests.slice(0, targetIndex + 1).map(r => ({
				...r,
				// Keep message as-is (string or parsed object) to avoid type issues
				message: r.message,
				response: Array.isArray(r.response) ? r.response.map(piece => {
					if (typeof piece === 'string') {
						return piece; // plain markdown string
					}
					// Shallow copy object response pieces to detach from original array
					return { ...piece };
				}) : r.response,
				followups: Array.isArray(r.followups) ? r.followups.map(f => ({ ...f })) : r.followups
			}));
			const last = subset[subset.length - 1];
			// If branching on a request (not its response) and the request already has a response, strip it to stop exactly at the request.
			if (!isResponse) {
				if (last && Array.isArray(last.response) && last.response.length > 0) {
					last.response = [];
					// Also clear followups if present to avoid implying future context.
					if (Array.isArray((last as any).followups)) {
						(last as any).followups = [];
					}
				}
			} else {
				// Branching on a response. If the shown response was filtered (e.g. safety / policy filtering),
				// avoid carrying its (possibly redacted) content forward as model context; start a branch
				// that contains the request but with an empty response so the next turn can regenerate.
				const responseWasFiltered: boolean | undefined = item.errorDetails?.responseIsFiltered;
				if (responseWasFiltered && last) {
					if (Array.isArray(last.response) && last.response.length > 0) {
						last.response = [];
					}
					if (Array.isArray((last as any).followups)) {
						(last as any).followups = [];
					}
					(last as any).result = undefined;
				}
			}

			// Recompute lastMessageDate from subset
			let lastMessageDate: number;
			if (subset.length === 0) {
				lastMessageDate = Date.now();
			} else {
				const timestamps = subset
					.map(r => r.timestamp)
					.filter((t): t is number => typeof t === 'number');
				lastMessageDate = timestamps.length ? Math.max(...timestamps) : Date.now();
			}

			const now = Date.now();
			const newSessionData = {
				...fullSerializable,
				sessionId: generateUuid(),
				isImported: false,
				creationDate: now,
				lastMessageDate,
				requests: subset,
				initialLocation: ChatAgentLocation.Chat,
				// _branchedFrom: sessionId // potential provenance field (not persisted today)
			};

			const newSession = chatService.loadSessionFromContent(newSessionData);
			if (!newSession) {
				return;
			}

			const editorOptions: IChatEditorOptions = { pinned: true, target: { sessionId: newSession.sessionId } };
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: editorOptions }, ACTIVE_GROUP);

			// Wait briefly for widget registration if needed
			let widget = chatWidgetService.getWidgetBySessionId(newSession.sessionId);
			if (!widget) {
				await new Promise<void>(resolve => {
					const disposable = chatWidgetService.onDidAddWidget(w => {
						if (w.viewModel?.sessionId === newSession.sessionId) {
							disposable.dispose();
							resolve();
						}
					});
					setTimeout(() => { disposable.dispose(); resolve(); }, 2000);
				});
				widget = chatWidgetService.getWidgetBySessionId(newSession.sessionId);
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
