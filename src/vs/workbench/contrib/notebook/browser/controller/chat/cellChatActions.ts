/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize, localize2 } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST, CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION, CTX_NOTEBOOK_CHAT_USER_DID_EDIT, MENU_CELL_CHAT_INPUT, MENU_CELL_CHAT_WIDGET, MENU_CELL_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatContext';
import { NotebookChatController } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatController';
import { CELL_TITLE_CELL_GROUP_ID, INotebookActionContext, INotebookCellActionContext, NotebookAction, NotebookCellAction, getEditorFromArgsOrActivePane } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { insertNewCell } from 'vs/workbench/contrib/notebook/browser/controller/insertCellActions';
import { CellEditState } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_CELL_GENERATED_BY_CHAT, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';


registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.accept',
				title: localize2('notebook.cell.chat.accept', "Make Request"),
				icon: Codicon.send,
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED.negate()),
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyCode.Enter
				},
				menu: {
					id: MENU_CELL_CHAT_INPUT,
					group: 'navigation',
					order: 1,
					when: CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.negate()
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.acceptInput();
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
						NOTEBOOK_CELL_EDITOR_FOCUSED.negate(),
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()
					),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow
				},
				f1: false
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

registerAction2(class extends NotebookAction {
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
						NOTEBOOK_CELL_EDITOR_FOCUSED.negate(),
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()
					),
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		await NotebookChatController.get(context.notebookEditor)?.focusNext();
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
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const index = context.notebookEditor.getCellIndex(context.cell);
		await NotebookChatController.get(context.notebookEditor)?.focusNearestWidget(index, 'above');
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
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const index = context.notebookEditor.getCellIndex(context.cell);
		await NotebookChatController.get(context.notebookEditor)?.focusNearestWidget(index, 'below');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.stop',
				title: localize2('notebook.cell.chat.stop', "Stop Request"),
				icon: Codicon.debugStop,
				menu: {
					id: MENU_CELL_CHAT_INPUT,
					group: 'navigation',
					order: 1,
					when: CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.cancelCurrentRequest(false);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.close',
				title: localize2('notebook.cell.chat.close', "Close Chat"),
				icon: Codicon.close,
				menu: {
					id: MENU_CELL_CHAT_WIDGET,
					group: 'navigation',
					order: 2
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.dismiss(false);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.acceptChanges',
				title: localize2('apply1', "Accept Changes"),
				shortTitle: localize('apply2', 'Accept'),
				icon: Codicon.check,
				tooltip: localize('apply3', 'Accept Changes'),
				keybinding: [
					{
						when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED.negate()),
						weight: KeybindingWeight.EditorContrib + 10,
						primary: KeyMod.CtrlCmd | KeyCode.Enter,
					},
					{
						when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_USER_DID_EDIT, NOTEBOOK_CELL_EDITOR_FOCUSED.negate()),
						weight: KeybindingWeight.EditorCore + 10,
						primary: KeyCode.Escape
					},
					{
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_FOCUSED,
							ContextKeyExpr.not(InputFocusedContextKey),
							NOTEBOOK_CELL_EDITOR_FOCUSED.negate(),
							CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION.isEqualTo('below')
						),
						primary: KeyMod.CtrlCmd | KeyCode.Enter,
						weight: KeybindingWeight.WorkbenchContrib
					}
				],
				menu: [
					{
						id: MENU_CELL_CHAT_WIDGET_STATUS,
						group: 'inline',
						order: 0,
						when: CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages),
					}
				],
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.acceptSession();
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.discard',
				title: localize('discard', 'Discard'),
				icon: Codicon.discard,
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_USER_DID_EDIT.negate(), NOTEBOOK_CELL_EDITOR_FOCUSED.negate()),
					weight: KeybindingWeight.EditorContrib,
					primary: KeyCode.Escape
				},
				menu: {
					id: MENU_CELL_CHAT_WIDGET_STATUS,
					group: 'main',
					order: 1
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.discard();
	}
});

interface IInsertCellWithChatArgs extends INotebookActionContext {
	input?: string;
	autoSend?: boolean;
	source?: string;
}

async function startChat(accessor: ServicesAccessor, context: INotebookActionContext, index: number, input?: string, autoSend?: boolean, source?: string) {
	const configurationService = accessor.get(IConfigurationService);
	const commandService = accessor.get(ICommandService);

	if (configurationService.getValue<boolean>(NotebookSetting.cellChat)) {
		context.notebookEditor.focusContainer();
		NotebookChatController.get(context.notebookEditor)?.run(index, input, autoSend);
	} else if (configurationService.getValue<boolean>(NotebookSetting.cellGenerate)) {
		const activeCell = context.notebookEditor.getActiveCell();
		const targetCell = activeCell?.getTextLength() === 0 && source !== 'insertToolbar' ? activeCell : (await insertNewCell(accessor, context, CellKind.Code, 'below', true));

		if (targetCell) {
			targetCell.enableAutoLanguageDetection();
			await context.notebookEditor.revealFirstLineIfOutsideViewport(targetCell);
			const codeEditor = context.notebookEditor.codeEditors.find(ce => ce[0] === targetCell)?.[1];
			if (codeEditor) {
				codeEditor.focus();
				commandService.executeCommand('inlineChat.start');
			}
		}
	}
}

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.start',
				title: {
					value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
					original: '$(sparkle) Generate',
				},
				tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Start Chat to Generate Code"),
				metadata: {
					description: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Start Chat to Generate Code"),
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
				f1: false,
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
						ContextKeyExpr.not(InputFocusedContextKey),
						CTX_INLINE_CHAT_HAS_AGENT,
						ContextKeyExpr.or(
							ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
							ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
						)
					),
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyI,
					secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI)],
				},
				menu: [
					{
						id: MenuId.NotebookCellBetween,
						group: 'inline',
						order: -1,
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
							CTX_INLINE_CHAT_HAS_AGENT,
							ContextKeyExpr.or(
								ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
								ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
							)
						)
					}
				]
			});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, ...args: any[]): IInsertCellWithChatArgs | undefined {
		const [firstArg] = args;
		if (!firstArg) {
			const notebookEditor = getEditorFromArgsOrActivePane(accessor);
			if (!notebookEditor) {
				return undefined;
			}

			const activeCell = notebookEditor.getActiveCell();
			if (!activeCell) {
				return undefined;
			}

			return {
				cell: activeCell,
				notebookEditor,
				input: undefined,
				autoSend: undefined
			};
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
		const index = Math.max(0, context.cell ? context.notebookEditor.getCellIndex(context.cell) + 1 : 0);
		await startChat(accessor, context, index, context.input, context.autoSend, context.source);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.startAtTop',
				title: {
					value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
					original: '$(sparkle) Generate',
				},
				tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Start Chat to Generate Code"),
				f1: false,
				menu: [
					{
						id: MenuId.NotebookCellListTop,
						group: 'inline',
						order: -1,
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
							CTX_INLINE_CHAT_HAS_AGENT,
							ContextKeyExpr.or(
								ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
								ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
							)
						)
					},
				]
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		await startChat(accessor, context, 0, '', false);
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: 'notebook.cell.chat.start',
		icon: Codicon.sparkle,
		title: localize('notebookActions.menu.insertCode.ontoolbar', "Generate"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Start Chat to Generate Code")
	},
	order: -10,
	group: 'navigation/add',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden'),
		CTX_INLINE_CHAT_HAS_AGENT,
		ContextKeyExpr.or(
			ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
			ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
		)
	)
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.cell.chat.focus',
			title: localize('focusNotebookChat', 'Focus Chat'),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.not(InputFocusedContextKey),
						CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION.isEqualTo('above')
					),
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib
				},
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.not(InputFocusedContextKey),
						CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION.isEqualTo('below')
					),
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					weight: KeybindingWeight.WorkbenchContrib
				}
			],
			f1: false
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		NotebookChatController.get(context.notebookEditor)?.focus();
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.cell.chat.focusNextCell',
			title: localize('focusNextCell', 'Focus Next Cell'),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						CTX_NOTEBOOK_CELL_CHAT_FOCUSED,
						CTX_INLINE_CHAT_FOCUSED,
					),
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib
				}
			],
			f1: false
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		NotebookChatController.get(context.notebookEditor)?.focusNext();
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.cell.chat.focusPreviousCell',
			title: localize('focusPreviousCell', 'Focus Previous Cell'),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						CTX_NOTEBOOK_CELL_CHAT_FOCUSED,
						CTX_INLINE_CHAT_FOCUSED,
					),
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					weight: KeybindingWeight.WorkbenchContrib
				}
			],
			f1: false
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		NotebookChatController.get(context.notebookEditor)?.focusAbove();
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.previousFromHistory',
				title: localize2('notebook.cell.chat.previousFromHistory', "Previous From History"),
				precondition: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED),
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED),
					weight: KeybindingWeight.EditorCore + 10,
					primary: KeyCode.UpArrow,
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.populateHistory(true);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.nextFromHistory',
				title: localize2('notebook.cell.chat.nextFromHistory', "Next From History"),
				precondition: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED),
				keybinding: {
					when: ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED),
					weight: KeybindingWeight.EditorCore + 10,
					primary: KeyCode.DownArrow
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		NotebookChatController.get(context.notebookEditor)?.populateHistory(false);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.restore',
				title: localize2('notebookActions.restoreCellprompt', "Generate"),
				icon: Codicon.sparkle,
				menu: {
					id: MenuId.NotebookCellTitle,
					group: CELL_TITLE_CELL_GROUP_ID,
					order: 0,
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
						CTX_INLINE_CHAT_HAS_AGENT,
						NOTEBOOK_CELL_GENERATED_BY_CHAT,
						ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true)
					)
				},
				f1: false
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const cell = context.cell;

		if (!cell) {
			return;
		}

		const notebookEditor = context.notebookEditor;
		const controller = NotebookChatController.get(notebookEditor);

		if (!controller) {
			return;
		}

		const prompt = controller.getPromptFromCache(cell);

		if (prompt) {
			controller.restore(cell, prompt);
		}
	}
});
