/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { marked } from 'vs/base/common/marked/marked';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionService, IInteractiveSessionUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellEditType, CellKind, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export function registerInteractiveSessionTitleActions() {
	registerAction2(class VoteUpAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.voteUp',
				title: {
					value: localize('interactive.voteUp.label', "Vote Up"),
					original: 'Vote Up'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.thumbsup,
				toggled: CONTEXT_RESPONSE_VOTE.isEqualTo('up'),
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
					order: 1
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
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

	registerAction2(class VoteDownAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.voteDown',
				title: {
					value: localize('interactive.voteDown.label', "Vote Down"),
					original: 'Vote Down'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.thumbsdown,
				toggled: CONTEXT_RESPONSE_VOTE.isEqualTo('down'),
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
					order: 2
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
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
				id: 'workbench.action.interactiveSession.insertIntoNotebook',
				title: {
					value: localize('interactive.insertIntoNotebook.label', "Insert into Notebook"),
					original: 'Insert into Notebook'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.insert,
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
					isHiddenByDefault: true,
					when: NOTEBOOK_IS_ACTIVE_EDITOR
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

				const value = item.response.value;
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
