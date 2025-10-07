/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContextKey } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_RESPONSE_TYPE, CTX_INLINE_CHAT_VISIBLE, InlineChatResponseType, MENU_INLINE_CHAT_WIDGET_STATUS } from '../../../../inlineChat/common/inlineChat.js';
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from './notebookChatContext.js';
import { INotebookActionContext, NotebookAction, getContextFromActiveEditor, getEditorFromArgsOrActivePane } from '../coreActions.js';
import { insertNewCell } from '../insertCellActions.js';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon.js';
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from '../../../common/notebookContextKeys.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../../chat/common/chatContextKeys.js';
import { InlineChatController } from '../../../../inlineChat/browser/inlineChatController.js';
import { EditorAction2 } from '../../../../../../editor/browser/editorExtensions.js';

interface IInsertCellWithChatArgs extends INotebookActionContext {
	input?: string;
	autoSend?: boolean;
	source?: string;
}

async function startChat(accessor: ServicesAccessor, context: INotebookActionContext, index: number, input?: string, autoSend?: boolean, source?: string) {
	const configurationService = accessor.get(IConfigurationService);
	const commandService = accessor.get(ICommandService);

	if (configurationService.getValue<boolean>(NotebookSetting.cellGenerate) || configurationService.getValue<boolean>(NotebookSetting.cellChat)) {
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
						CTX_NOTEBOOK_CHAT_HAS_AGENT,
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
							CTX_NOTEBOOK_CHAT_HAS_AGENT,
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
							CTX_NOTEBOOK_CHAT_HAS_AGENT,
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
		CTX_NOTEBOOK_CHAT_HAS_AGENT,
		ContextKeyExpr.or(
			ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
			ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
		)
	)
});

export class AcceptChangesAndRun extends EditorAction2 {

	constructor() {
		super({
			id: 'notebook.inlineChat.acceptChangesAndRun',
			title: localize2('notebook.apply1', "Accept and Run"),
			shortTitle: localize('notebook.apply2', 'Accept & Run'),
			tooltip: localize('notebook.apply3', 'Accept the changes and run the cell'),
			icon: Codicon.check,
			f1: true,
			precondition: ContextKeyExpr.and(
				NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
				CTX_INLINE_CHAT_VISIBLE,
			),
			keybinding: undefined,
			menu: [{
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 2,
				when: ContextKeyExpr.and(
					NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
					ChatContextKeys.inputHasText.toNegated(),
					CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
					CTX_INLINE_CHAT_RESPONSE_TYPE.isEqualTo(InlineChatResponseType.MessagesAndEdits)
				)
			}]
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, codeEditor: ICodeEditor) {
		const editor = getContextFromActiveEditor(accessor.get(IEditorService));
		const ctrl = InlineChatController.get(codeEditor);

		if (!editor || !ctrl) {
			return;
		}

		const matchedCell = editor.notebookEditor.codeEditors.find(e => e[1] === codeEditor);
		const cell = matchedCell?.[0];

		if (!cell) {
			return;
		}

		ctrl.acceptSession();
		return editor.notebookEditor.executeNotebookCells(Iterable.single(cell));
	}
}
registerAction2(AcceptChangesAndRun);
