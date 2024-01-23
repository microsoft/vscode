/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_PROVIDER, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_LAST_RESPONSE_TYPE, CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseFeedbackKind, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { insertCell } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { INotebookActionContext, INotebookCellActionContext, NotebookAction, NotebookCellAction, getEditorFromArgsOrActivePane } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { insertNewCell } from 'vs/workbench/contrib/notebook/browser/controller/insertCellActions';
import { CellEditState, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST, MENU_CELL_CHAT_INPUT, MENU_CELL_CHAT_WIDGET, MENU_CELL_CHAT_WIDGET_FEEDBACK, MENU_CELL_CHAT_WIDGET_STATUS, NotebookCellChatController } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatController';
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';


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
					id: MENU_CELL_CHAT_INPUT,
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
				id: 'notebook.cell.chat.arrowOutUp',
				title: localize('arrowUp', 'Cursor Up'),
				keybinding: {
					when: ContextKeyExpr.and(
						CTX_NOTEBOOK_CELL_CHAT_FOCUSED,
						CTX_INLINE_CHAT_FOCUSED,
						CTX_INLINE_CHAT_INNER_CURSOR_FIRST,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()
					),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const editor = context.notebookEditor;
		const activeCell = context.cell;

		const idx = editor.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		if (idx < 1 || editor.getLength() === 0) {
			// we don't do loop
			return;
		}

		const newCell = editor.cellAt(idx - 1);
		const newFocusMode = newCell.cellKind === CellKind.Markup && newCell.getEditState() === CellEditState.Preview ? 'container' : 'editor';
		const focusEditorLine = newCell.textBuffer.getLineCount();
		await editor.focusNotebookCell(newCell, newFocusMode, { focusEditorLine: focusEditorLine });
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.arrowOutDown',
				title: localize('arrowDown', 'Cursor Down'),
				keybinding: {
					when: ContextKeyExpr.and(
						CTX_NOTEBOOK_CELL_CHAT_FOCUSED,
						CTX_INLINE_CHAT_FOCUSED,
						CTX_INLINE_CHAT_INNER_CURSOR_LAST,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()
					),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		await editor.focusNotebookCell(activeCell, 'editor');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.focusChatWidget',
				title: localize('focusChatWidget', 'Focus Chat Widget'),
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.and(
							ContextKeyExpr.has(InputFocusedContextKey),
							EditorContextKeys.editorTextFocus,
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('bottom'),
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none'),
						),
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const activeCell = context.cell;
		// Navigate to cell chat widget if it exists
		const controller = NotebookCellChatController.get(activeCell);
		if (controller && controller.isWidgetVisible()) {
			controller.focusWidget();
			return;
		}

	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.focusNextChatWidget',
				title: localize('focusNextChatWidget', 'Focus Next Cell Chat Widget'),
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.and(
							ContextKeyExpr.has(InputFocusedContextKey),
							EditorContextKeys.editorTextFocus,
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'),
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none'),
						),
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const editor = context.notebookEditor;
		const activeCell = context.cell;

		const idx = editor.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		if (idx >= editor.getLength() - 1) {
			// last one
			return;
		}

		const targetCell = editor.cellAt(idx + 1);

		if (targetCell) {
			// Navigate to cell chat widget if it exists
			const controller = NotebookCellChatController.get(targetCell);
			if (controller && controller.isWidgetVisible()) {
				controller.focusWidget();
				return;
			}
		}
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
					id: MENU_CELL_CHAT_INPUT,
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
					id: MENU_CELL_CHAT_WIDGET,
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
		// focus on the cell editor container
		context.notebookEditor.focusNotebookCell(context.cell, 'container');
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

interface IInsertCellWithChatArgs extends INotebookActionContext {
	input?: string;
	autoSend?: boolean;
}

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.insertCodeCellWithChat',
				title: {
					value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
					original: '$(sparkle) Generate',
				},
				tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Generate Code Cell with Chat"),
				metadata: {
					description: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Generate Code Cell with Chat"),
					args: [
						{
							name: 'args',
							schema: {
								type: 'object',
								required: ['index'],
								properties: {
									'index': {
										type: 'number'
									},
									'input': {
										type: 'string'
									},
									'autoSend': {
										type: 'boolean'
									}
								}
							}
						}
					]
				},
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
					}
				]
			});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, ...args: any[]): IInsertCellWithChatArgs | undefined {
		const [firstArg] = args;
		if (!firstArg) {
			return undefined;
		}

		if (typeof firstArg !== 'object' || typeof firstArg.index !== 'number') {
			return undefined;
		}

		const notebookEditor = getEditorFromArgsOrActivePane(accessor);
		if (!notebookEditor) {
			return undefined;
		}

		const cell = firstArg.index <= 0 ? undefined : notebookEditor.cellAt(firstArg.index - 1);

		return {
			cell,
			notebookEditor,
			input: firstArg.input,
			autoSend: firstArg.autoSend
		};
	}

	async runWithContext(accessor: ServicesAccessor, context: IInsertCellWithChatArgs) {
		let newCell: ICellViewModel | null = null;
		if (!context.cell) {
			// insert at the top
			const languageService = accessor.get(ILanguageService);
			newCell = insertCell(languageService, context.notebookEditor, 0, CellKind.Code, 'above', undefined, true);
		} else {
			newCell = insertNewCell(accessor, context, CellKind.Code, 'below', true);
		}

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

		ctrl.show(context.input, context.autoSend);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.insertCodeCellWithChatAtTop',
				title: {
					value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
					original: '$(sparkle) Generate',
				},
				tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Generate Code Cell with Chat"),
				menu: [
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
		const languageService = accessor.get(ILanguageService);
		const newCell = insertCell(languageService, context.notebookEditor, 0, CellKind.Code, 'above', undefined, true);

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

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: 'notebook.cell.insertCodeCellWithChat',
		icon: Codicon.sparkle,
		title: localize('notebookActions.menu.insertCode.ontoolbar', "Generate"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Generate Code Cell with Chat")
	},
	order: -10,
	group: 'navigation/add',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden'),
		CTX_INLINE_CHAT_HAS_PROVIDER,
		ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true)
	)
});
