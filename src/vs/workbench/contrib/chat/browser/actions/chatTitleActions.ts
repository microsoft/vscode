/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { marked } from 'vs/base/common/marked/marked';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatService, IChatUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { isRequestVM, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellEditType, CellKind, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export function registerChatTitleActions() {
	registerAction2(class MarkHelpfulAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.markHelpful',
				title: {
					value: localize('interactive.helpful.label', "Helpful"),
					original: 'Helpful'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.thumbsup,
				toggled: CONTEXT_RESPONSE_VOTE.isEqualTo('up'),
				menu: {
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 1,
					when: CONTEXT_RESPONSE
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction(<IChatUserActionEvent>{
				providerId: item.providerId,
				action: {
					kind: 'vote',
					direction: InteractiveSessionVoteDirection.Up,
					responseId: item.providerResponseId
				}
			});
			item.setVote(InteractiveSessionVoteDirection.Up);
		}
	});

	registerAction2(class MarkUnhelpfulAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.markUnhelpful',
				title: {
					value: localize('interactive.unhelpful.label', "Unhelpful"),
					original: 'Unhelpful'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.thumbsdown,
				toggled: CONTEXT_RESPONSE_VOTE.isEqualTo('down'),
				menu: {
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: CONTEXT_RESPONSE
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction(<IChatUserActionEvent>{
				providerId: item.providerId,
				action: {
					kind: 'vote',
					direction: InteractiveSessionVoteDirection.Down,
					responseId: item.providerResponseId
				}
			});
			item.setVote(InteractiveSessionVoteDirection.Down);
		}
	});

	registerAction2(class InsertToNotebookAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.insertIntoNotebook',
				title: {
					value: localize('interactive.insertIntoNotebook.label', "Insert into Notebook"),
					original: 'Insert into Notebook'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.insert,
				menu: {
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					isHiddenByDefault: true,
					when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CONTEXT_RESPONSE)
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

				const value = item.response.asString();
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
				title: {
					value: localize('chat.remove.label', "Remove Request and Response"),
					original: 'Remove Request and Response'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.x,
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace,
					},
					when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate()),
					weight: KeybindingWeight.WorkbenchContrib,
				},
				menu: {
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: CONTEXT_REQUEST
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			let item = args[0];
			if (!isRequestVM(item)) {
				const chatWidgetService = accessor.get(IChatWidgetService);
				const widget = chatWidgetService.lastFocusedWidget;
				item = widget?.getFocus();
			}

			const providerRequestId = isRequestVM(item) ? item.providerRequestId :
				isResponseVM(item) ? item.providerResponseId : undefined;

			if (providerRequestId) {
				const chatService = accessor.get(IChatService);
				chatService.removeRequest(item.sessionId, providerRequestId);
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
