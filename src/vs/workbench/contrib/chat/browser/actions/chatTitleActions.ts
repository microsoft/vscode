/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { marked } from '../../../../../base/common/marked/marked.js';
import { observableFromEvent, waitForState } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ResourceNotebookCellEdit } from '../../../bulkEdit/browser/bulkCellEdits.js';
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';
import { INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { CellEditType, CellKind, NOTEBOOK_EDITOR_ID } from '../../../notebook/common/notebookCommon.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../notebook/common/notebookContextKeys.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, ChatEditingSessionState, IChatEditingService, isChatEditingActionContext } from '../../common/chatEditingService.js';
import { IChatRequestModel } from '../../common/chatModel.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatService } from '../../common/chatService.js';
import { isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { ChatTreeItem, EditsViewId, IChatWidgetService } from '../chat.js';
import { ChatViewPane } from '../chatViewPane.js';
import { CHAT_CATEGORY } from './chatActions.js';

export const MarkUnhelpfulActionId = 'workbench.action.chat.markUnhelpful';

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
					when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate())
				}, {
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate())
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
					when: ContextKeyExpr.and(ChatContextKeys.isResponse)
				}, {
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate())
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
					when: ContextKeyExpr.and(ChatContextKeys.responseSupportsIssueReporting, ChatContextKeys.isResponse)
				}, {
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					group: 'navigation',
					order: 3,
					when: ContextKeyExpr.and(ChatContextKeys.responseSupportsIssueReporting, ChatContextKeys.isResponse)
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
			if (chatModel?.initialLocation === ChatAgentLocation.EditingSession) {
				const configurationService = accessor.get(IConfigurationService);
				const dialogService = accessor.get(IDialogService);
				const chatEditingService = accessor.get(IChatEditingService);
				const currentEditingSession = chatEditingService.getEditingSession(chatModel.sessionId);
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
			const languageModelId = chatWidgetService.getWidgetBySessionId(item.sessionId)?.input.currentLanguageModel;
			chatService.resendRequest(request!, { userSelectedModelId: languageModelId });
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


	registerAction2(class RemoveAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.remove',
				title: localize2('chat.removeRequest.label', "Remove Request"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.x,
				precondition: ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession),
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace,
					},
					when: ContextKeyExpr.and(ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession), ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()),
					weight: KeybindingWeight.WorkbenchContrib,
				},
				menu: {
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession), ChatContextKeys.isRequest)
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			let item: ChatTreeItem | undefined = args[0];
			if (!isRequestVM(item)) {
				const chatWidgetService = accessor.get(IChatWidgetService);
				const widget = chatWidgetService.lastFocusedWidget;
				item = widget?.getFocus();
			}

			if (!item) {
				return;
			}

			const chatService = accessor.get(IChatService);
			const chatModel = chatService.getSession(item.sessionId);
			if (chatModel?.initialLocation === ChatAgentLocation.EditingSession) {
				return;
			}

			const requestId = isRequestVM(item) ? item.id :
				isResponseVM(item) ? item.requestId : undefined;

			if (requestId) {
				const chatService = accessor.get(IChatService);
				chatService.removeRequest(item.sessionId, requestId);
			}
		}
	});

	registerAction2(class ContinueEditingAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.startEditing',
				title: localize2('chat.startEditing.label2', "Edit with Copilot"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.goToEditingSession,
				precondition: ContextKeyExpr.and(ChatContextKeys.editingParticipantRegistered, ChatContextKeys.requestInProgress.toNegated(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel)),
				menu: {
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.isResponse, ChatContextKeys.editingParticipantRegistered, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel))
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {

			const logService = accessor.get(ILogService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const chatService = accessor.get(IChatService);
			const chatAgentService = accessor.get(IChatAgentService);
			const viewsService = accessor.get(IViewsService);
			const chatEditingService = accessor.get(IChatEditingService);
			const quickPickService = accessor.get(IQuickInputService);

			const editAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession);
			if (!editAgent) {
				logService.trace('[CHAT_MOVE] No edit agent found');
				return;
			}

			const sourceWidget = chatWidgetService.lastFocusedWidget;
			if (!sourceWidget || !sourceWidget.viewModel) {
				logService.trace('[CHAT_MOVE] NO source model');
				return;
			}

			const sourceModel = sourceWidget.viewModel.model;
			let sourceRequests = sourceModel.getRequests().slice();

			// when a response is passed (clicked on) ignore all item after it
			const [first] = args;
			if (isResponseVM(first)) {
				const idx = sourceRequests.findIndex(candidate => candidate.id === first.requestId);
				if (idx >= 0) {
					sourceRequests.length = idx + 1;
				}
			}

			// when having multiple turns, let the user pick
			if (sourceRequests.length > 1) {
				sourceRequests = await this._pickTurns(quickPickService, sourceRequests);
			}

			if (sourceRequests.length === 0) {
				logService.trace('[CHAT_MOVE] NO requests to move');
				return;
			}

			const editsView = await viewsService.openView(EditsViewId);

			if (!(editsView instanceof ChatViewPane)) {
				return;
			}

			const viewModelObs = observableFromEvent(this, editsView.widget.onDidChangeViewModel, () => editsView.widget.viewModel);
			const chatSessionId = (await waitForState(viewModelObs)).sessionId;
			const editingSession = chatEditingService.getEditingSession(chatSessionId);

			if (!editingSession) {
				return;
			}

			const state = editingSession.state.get();
			if (state === ChatEditingSessionState.Disposed) {
				return;
			}

			// adopt request items and collect new working set entries
			const workingSetAdditions = new ResourceSet();
			for (const request of sourceRequests) {
				await chatService.adoptRequest(editingSession.chatSessionId, request);
				this._collectWorkingSetAdditions(request, workingSetAdditions);
			}
			workingSetAdditions.forEach(uri => editingSession.addFileToWorkingSet(uri));

			// make request
			await chatService.sendRequest(editingSession.chatSessionId, '', {
				agentId: editAgent.id,
				acceptedConfirmationData: [{ _type: 'toEditTransfer', transferredTurnResults: sourceRequests.map(v => v.response?.result) }], // TODO@jrieken HACKY
				confirmation: typeof this.desc.title === 'string' ? this.desc.title : this.desc.title.value
			});
		}

		private _collectWorkingSetAdditions(request: IChatRequestModel, bucket: ResourceSet) {
			for (const item of request.response?.response.value ?? []) {
				if (item.kind === 'inlineReference') {
					bucket.add(isLocation(item.inlineReference)
						? item.inlineReference.uri
						: URI.isUri(item.inlineReference)
							? item.inlineReference
							: item.inlineReference.location.uri
					);
				}
			}
		}

		private async _pickTurns(quickPickService: IQuickInputService, requests: IChatRequestModel[]): Promise<IChatRequestModel[]> {

			const timeThreshold = 2 * 60000; // 2 minutes
			const lastRequestTimestamp = requests[requests.length - 1].timestamp;
			const relatedRequests = requests.filter(request => request.timestamp >= 0 && lastRequestTimestamp - request.timestamp <= timeThreshold);

			const lastPick: IQuickPickItem = {
				label: localize('chat.startEditing.last', "The last {0} requests", relatedRequests.length),
				detail: relatedRequests.map(req => req.message.text).join(', ')
			};

			const allPick: IQuickPickItem = {
				label: localize('chat.startEditing.pickAll', "All requests from the conversation")
			};

			const customPick: IQuickPickItem = {
				label: localize('chat.startEditing.pickCustom', "Manually select requests...")
			};

			const picks: IQuickPickItem[] = relatedRequests.length !== 0
				? [lastPick, allPick, customPick]
				: [allPick, customPick];

			const firstPick = await quickPickService.pick(picks, {
				placeHolder: localize('chat.startEditing.pickRequest', "Select requests that you want to use for editing")
			});

			if (!firstPick) {
				return [];
			} else if (firstPick === allPick) {
				return requests;
			} else if (firstPick === lastPick) {
				return relatedRequests;
			}

			// custom pick
			type PickType = (IQuickPickItem & { request: IChatRequestModel });
			const customPicks: (IQuickPickItem & { request: IChatRequestModel })[] = requests.map(request => ({

				picked: false,
				request: request,
				label: request.message.text,
				detail: request.response?.response.toString(),
			}));


			return await new Promise<IChatRequestModel[]>(_resolve => {

				const resolve = (value: IChatRequestModel[]) => {
					store.dispose();
					_resolve(value);
					qp.hide();
				};

				const store = new DisposableStore();

				const qp = quickPickService.createQuickPick<PickType>();
				qp.placeholder = localize('chat.startEditing.pickRequest', "Select requests that you want to use for editing");
				qp.canSelectMany = true;
				qp.items = customPicks;

				let ignore = false;
				store.add(qp.onDidChangeSelection(e => {
					if (ignore) {
						return;
					}
					ignore = true;
					try {
						const [first] = e;

						const selected: typeof customPicks = [];
						let disabled = false;

						for (let i = 0; i < customPicks.length; i++) {
							const oldItem = customPicks[i];
							customPicks[i] = {
								...oldItem,
								disabled,
							};

							disabled = disabled || oldItem === first;

							if (disabled) {
								selected.push(customPicks[i]);
							}
						}
						qp.items = customPicks;
						qp.selectedItems = selected;

					} finally {
						ignore = false;
					}
				}));

				store.add(qp.onDidAccept(_e => resolve(qp.selectedItems.map(i => i.request))));
				store.add(qp.onDidHide(_ => resolve([])));
				store.add(qp);
				qp.show();
			});
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
