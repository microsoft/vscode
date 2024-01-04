/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_PROVIDER, CTX_INLINE_CHAT_LAST_RESPONSE_TYPE, CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseFeedbackKind, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { INotebookCellActionContext, NotebookAction, NotebookCellAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { insertNewCell } from 'vs/workbench/contrib/notebook/browser/controller/insertCellActions';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST, MENU_CELL_CHAT_WIDGET, MENU_CELL_CHAT_WIDGET_FEEDBACK, MENU_CELL_CHAT_WIDGET_STATUS, MENU_CELL_CHAT_WIDGET_TOOLBAR, NotebookCellChatController } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatController';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_EDITABLE } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';


registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.accept',
				title: {
					value: localize('notebook.cell.chat.accept', "Make Request"),
					original: 'Make Request'
				},
				icon: Codicon.send,
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyCode.Enter
				},
				menu: {
					id: MENU_CELL_CHAT_WIDGET,
					group: 'main',
					order: 1,
					when: CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.negate()
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.acceptInput();
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.stop',
				title: {
					value: localize('notebook.cell.chat.stop', "Stop Request"),
					original: 'Make Request'
				},
				icon: Codicon.debugStop,
				menu: {
					id: MENU_CELL_CHAT_WIDGET,
					group: 'main',
					order: 1,
					when: CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.cancelCurrentRequest(false);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.close',
				title: {
					value: localize('notebook.cell.chat.close', "Close Chat"),
					original: 'Close Chat'
				},
				icon: Codicon.close,
				menu: {
					id: MENU_CELL_CHAT_WIDGET_TOOLBAR,
					group: 'main',
					order: 2
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.dismiss(false);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.acceptChanges',
				title: { value: localize('apply1', 'Accept Changes'), original: 'Accept Changes' },
				shortTitle: localize('apply2', 'Accept'),
				icon: Codicon.check,
				tooltip: localize('apply1', 'Accept Changes'),
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED),
					weight: KeybindingWeight.EditorContrib + 10,
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
				},
				menu: [
					{
						id: MENU_CELL_CHAT_WIDGET_STATUS,
						group: 'inline',
						order: 0,
						when: CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages),
					}
				]
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.acceptSession();
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.discard',
				title: localize('discard', 'Discard'),
				icon: Codicon.discard,
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED, NOTEBOOK_CELL_LIST_FOCUSED),
					weight: KeybindingWeight.EditorContrib,
					primary: KeyCode.Escape
				},
				menu: {
					id: MENU_CELL_CHAT_WIDGET_STATUS,
					group: 'main',
					order: 1
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		// todo discard
		ctrl.dismiss(true);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: 'notebook.cell.feedbackHelpful',
			title: localize('feedback.helpful', 'Helpful'),
			icon: Codicon.thumbsup,
			menu: {
				id: MENU_CELL_CHAT_WIDGET_FEEDBACK,
				group: 'inline',
				order: 1,
				when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.feedbackLast(InlineChatResponseFeedbackKind.Helpful);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: 'notebook.cell.feedbackUnhelpful',
			title: localize('feedback.unhelpful', 'Unhelpful'),
			icon: Codicon.thumbsdown,
			menu: {
				id: MENU_CELL_CHAT_WIDGET_FEEDBACK,
				group: 'inline',
				order: 2,
				when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.feedbackLast(InlineChatResponseFeedbackKind.Unhelpful);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: 'notebook.cell.reportIssueForBug',
			title: localize('feedback.reportIssueForBug', 'Report Issue'),
			icon: Codicon.report,
			menu: {
				id: MENU_CELL_CHAT_WIDGET_FEEDBACK,
				group: 'inline',
				order: 3,
				when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.feedbackLast(InlineChatResponseFeedbackKind.Bug);
	}
});


registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.insertCodeCellWithChat',
				title: {
					value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
					original: '$(sparkle) Generate',
				},
				tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Generate Code Cell with Chat"),
				menu: [
					{
						id: MenuId.NotebookCellBetween,
						group: 'inline',
						order: -1,
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
							CTX_INLINE_CHAT_HAS_PROVIDER,
							ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true)
						)
					},
					{
						id: MenuId.NotebookCellListTop,
						group: 'inline',
						order: -1,
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
							CTX_INLINE_CHAT_HAS_PROVIDER,
							ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true)
						)
					},
				]
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const newCell = await insertNewCell(accessor, context, CellKind.Code, 'below', true);

		if (!newCell) {
			return;
		}
		await context.notebookEditor.focusNotebookCell(newCell, 'container');
		const ctrl = NotebookCellChatController.get(newCell);
		if (!ctrl) {
			return;
		}

		context.notebookEditor.getCellsInRange().forEach(cell => {
			const cellCtrl = NotebookCellChatController.get(cell);
			if (cellCtrl) {
				cellCtrl.dismiss(false);
			}
		});

		ctrl.show();
	}
});
