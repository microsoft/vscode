/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isEqual } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { localize, localize2 } from 'vs/nls';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { insertCell } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatContext';
import { NotebookChatController } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatController';
import { CELL_TITLE_CELL_GROUP_ID, CellToolbarOrder, INotebookActionContext, INotebookCellActionContext, INotebookCellToolbarActionContext, INotebookCommandContext, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NotebookAction, NotebookCellAction, NotebookMultiCellAction, cellExecutionArgs, executeNotebookCondition, getContextFromActiveEditor, getContextFromUri, parseMultiCellExecutionArgs } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, IFocusNotebookCellOptions, ScrollToRevealBehavior } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CellKind, CellUri, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_MISSING_KERNEL_EXTENSION } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEL_NOTEBOOK_COMMAND_ID = 'notebook.cancelExecution';
const INTERRUPT_NOTEBOOK_COMMAND_ID = 'notebook.interruptExecution';
const CANCEL_CELL_COMMAND_ID = 'notebook.cell.cancelExecution';
const EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.executeAndFocusContainer';
const EXECUTE_CELL_SELECT_BELOW = 'notebook.cell.executeAndSelectBelow';
const EXECUTE_CELL_INSERT_BELOW = 'notebook.cell.executeAndInsertBelow';
const EXECUTE_CELL_AND_BELOW = 'notebook.cell.executeCellAndBelow';
const EXECUTE_CELLS_ABOVE = 'notebook.cell.executeCellsAbove';
const RENDER_ALL_MARKDOWN_CELLS = 'notebook.renderAllMarkdownCells';
const REVEAL_RUNNING_CELL = 'notebook.revealRunningCell';
const REVEAL_LAST_FAILED_CELL = 'notebook.revealLastFailedCell';

// If this changes, update getCodeCellExecutionContextKeyService to match
export const executeCondition = ContextKeyExpr.and(
	NOTEBOOK_CELL_TYPE.isEqualTo('code'),
	ContextKeyExpr.or(
		ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0),
		ContextKeyExpr.greater(NOTEBOOK_KERNEL_SOURCE_COUNT.key, 0),
		NOTEBOOK_MISSING_KERNEL_EXTENSION
	));

export const executeThisCellCondition = ContextKeyExpr.and(
	executeCondition,
	NOTEBOOK_CELL_EXECUTING.toNegated());

function renderAllMarkdownCells(context: INotebookActionContext): void {
	for (let i = 0; i < context.notebookEditor.getLength(); i++) {
		const cell = context.notebookEditor.cellAt(i);

		if (cell.cellKind === CellKind.Markup) {
			cell.updateEditState(CellEditState.Preview, 'renderAllMarkdownCells');
		}
	}
}

async function runCell(editorGroupsService: IEditorGroupsService, context: INotebookActionContext): Promise<void> {
	const group = editorGroupsService.activeGroup;

	if (group) {
		if (group.activeEditor) {
			group.pinEditor(group.activeEditor);
		}
	}

	if (context.ui && context.cell) {
		await context.notebookEditor.executeNotebookCells(Iterable.single(context.cell));
		if (context.autoReveal) {
			const cellIndex = context.notebookEditor.getCellIndex(context.cell);
			context.notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		}
	} else if (context.selectedCells?.length || context.cell) {
		const selectedCells = context.selectedCells?.length ? context.selectedCells : [context.cell!];
		await context.notebookEditor.executeNotebookCells(selectedCells);
		const firstCell = selectedCells[0];

		if (firstCell && context.autoReveal) {
			const cellIndex = context.notebookEditor.getCellIndex(firstCell);
			context.notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		}
	}

	let foundEditor: ICodeEditor | undefined = undefined;
	for (const [, codeEditor] of context.notebookEditor.codeEditors) {
		if (isEqual(codeEditor.getModel()?.uri, (context.cell ?? context.selectedCells?.[0])?.uri)) {
			foundEditor = codeEditor;
			break;
		}
	}

	if (!foundEditor) {
		return;
	}

	const controller = InlineChatController.get(foundEditor);
	if (!controller) {
		return;
	}

	controller.createSnapshot();
}

registerAction2(class RenderAllMarkdownCellsAction extends NotebookAction {
	constructor() {
		super({
			id: RENDER_ALL_MARKDOWN_CELLS,
			title: localize('notebookActions.renderMarkdown', "Render All Markdown Cells"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);
	}
});

registerAction2(class ExecuteNotebookAction extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.executeNotebook', "Run All"),
			icon: icons.executeAllIcon,
			metadata: {
				description: localize('notebookActions.executeNotebook', "Run All"),
				args: [
					{
						name: 'uri',
						description: 'The document uri'
					}
				]
			},
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						executeNotebookCondition,
						ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated()),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						executeNotebookCondition,
						ContextKeyExpr.or(
							NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(),
							NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated(),
						),
						ContextKeyExpr.and(NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated())?.negate(),
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				}
			]
		});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);

		const editorService = accessor.get(IEditorService);
		const editor = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(
			editor => editor.editor instanceof NotebookEditorInput && editor.editor.viewType === context.notebookEditor.textModel.viewType && editor.editor.resource.toString() === context.notebookEditor.textModel.uri.toString());
		const editorGroupService = accessor.get(IEditorGroupsService);

		if (editor) {
			const group = editorGroupService.getGroup(editor.groupId);
			group?.pinEditor(editor.editor);
		}

		return context.notebookEditor.executeNotebookCells();
	}
});

registerAction2(class ExecuteCell extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_COMMAND_ID,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.execute', "Execute Cell"),
			keybinding: {
				when: ContextKeyExpr.or(
					NOTEBOOK_CELL_LIST_FOCUSED,
					ContextKeyExpr.and(CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_INLINE_CHAT_FOCUSED)
				),
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
				},
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
			menu: {
				id: MenuId.NotebookCellExecutePrimary,
				when: executeThisCellCondition,
				group: 'inline'
			},
			metadata: {
				description: localize('notebookActions.execute', "Execute Cell"),
				args: cellExecutionArgs
			},
			icon: icons.executeIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);

		if (context.ui) {
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		}

		const chatController = NotebookChatController.get(context.notebookEditor);
		const editingCell = chatController?.getEditingCell();
		if (chatController?.hasFocus() && editingCell) {
			const group = editorGroupsService.activeGroup;

			if (group) {
				if (group.activeEditor) {
					group.pinEditor(group.activeEditor);
				}
			}

			await context.notebookEditor.executeNotebookCells([editingCell]);
			return;
		}

		await runCell(editorGroupsService, context);
	}
});

registerAction2(class ExecuteAboveCells extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELLS_ABOVE,
			precondition: executeCondition,
			title: localize('notebookActions.executeAbove', "Execute Above Cells"),
			menu: [
				{
					id: MenuId.NotebookCellExecute,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, true))
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.ExecuteAboveCells,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, false))
				}
			],
			icon: icons.executeAboveIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		let endCellIdx: number | undefined = undefined;
		if (context.ui) {
			endCellIdx = context.notebookEditor.getCellIndex(context.cell);
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		} else {
			endCellIdx = Math.min(...context.selectedCells.map(cell => context.notebookEditor.getCellIndex(cell)));
		}

		if (typeof endCellIdx === 'number') {
			const range = { start: 0, end: endCellIdx };
			const cells = context.notebookEditor.getCellsInRange(range);
			context.notebookEditor.executeNotebookCells(cells);
		}
	}
});

registerAction2(class ExecuteCellAndBelow extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_AND_BELOW,
			precondition: executeCondition,
			title: localize('notebookActions.executeBelow', "Execute Cell and Below"),
			menu: [
				{
					id: MenuId.NotebookCellExecute,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, true))
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.ExecuteCellAndBelow,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, false))
				}
			],
			icon: icons.executeBelowIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		let startCellIdx: number | undefined = undefined;
		if (context.ui) {
			startCellIdx = context.notebookEditor.getCellIndex(context.cell);
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		} else {
			startCellIdx = Math.min(...context.selectedCells.map(cell => context.notebookEditor.getCellIndex(cell)));
		}

		if (typeof startCellIdx === 'number') {
			const range = { start: startCellIdx, end: context.notebookEditor.getLength() };
			const cells = context.notebookEditor.getCellsInRange(range);
			context.notebookEditor.executeNotebookCells(cells);
		}
	}
});

registerAction2(class ExecuteCellFocusContainer extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
			metadata: {
				description: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
				args: cellExecutionArgs
			},
			icon: icons.executeIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);

		if (context.ui) {
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		} else {
			const firstCell = context.selectedCells[0];

			if (firstCell) {
				await context.notebookEditor.focusNotebookCell(firstCell, 'container', { skipReveal: true });
			}
		}

		await runCell(editorGroupsService, context);
	}
});

const cellCancelCondition = ContextKeyExpr.or(
	ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'executing'),
	ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'pending'),
);

registerAction2(class CancelExecuteCell extends NotebookMultiCellAction {
	constructor() {
		super({
			id: CANCEL_CELL_COMMAND_ID,
			precondition: cellCancelCondition,
			title: localize('notebookActions.cancel', "Stop Cell Execution"),
			icon: icons.stopIcon,
			menu: {
				id: MenuId.NotebookCellExecutePrimary,
				when: cellCancelCondition,
				group: 'inline'
			},
			metadata: {
				description: localize('notebookActions.cancel', "Stop Cell Execution"),
				args: [
					{
						name: 'options',
						description: 'The cell range options',
						schema: {
							'type': 'object',
							'required': ['ranges'],
							'properties': {
								'ranges': {
									'type': 'array',
									items: [
										{
											'type': 'object',
											'required': ['start', 'end'],
											'properties': {
												'start': {
													'type': 'number'
												},
												'end': {
													'type': 'number'
												}
											}
										}
									]
								},
								'document': {
									'type': 'object',
									'description': 'The document uri',
								}
							}
						}
					}
				]
			},
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		if (context.ui) {
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
			return context.notebookEditor.cancelNotebookCells(Iterable.single(context.cell));
		} else {
			return context.notebookEditor.cancelNotebookCells(context.selectedCells);
		}
	}
});

registerAction2(class ExecuteCellSelectBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_SELECT_BELOW,
			precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
			title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
			keybinding: {
				when: ContextKeyExpr.and(
					NOTEBOOK_CELL_LIST_FOCUSED,
					CTX_INLINE_CHAT_FOCUSED.negate()
				),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const idx = context.notebookEditor.getCellIndex(context.cell);
		if (typeof idx !== 'number') {
			return;
		}
		const languageService = accessor.get(ILanguageService);

		const config = accessor.get(IConfigurationService);
		const scrollBehavior = config.getValue(NotebookSetting.scrollToRevealCell);
		let focusOptions: IFocusNotebookCellOptions;
		if (scrollBehavior === 'none') {
			focusOptions = { skipReveal: true };
		} else {
			focusOptions = {
				revealBehavior: scrollBehavior === 'fullCell' ? ScrollToRevealBehavior.fullCell : ScrollToRevealBehavior.firstLine
			};
		}

		if (context.cell.cellKind === CellKind.Markup) {
			const nextCell = context.notebookEditor.cellAt(idx + 1);
			context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_SELECT_BELOW);
			if (nextCell) {
				await context.notebookEditor.focusNotebookCell(nextCell, 'container', focusOptions);
			} else {
				const newCell = insertCell(languageService, context.notebookEditor, idx, CellKind.Markup, 'below');

				if (newCell) {
					await context.notebookEditor.focusNotebookCell(newCell, 'editor', focusOptions);
				}
			}
			return;
		} else {
			const nextCell = context.notebookEditor.cellAt(idx + 1);
			if (nextCell) {
				await context.notebookEditor.focusNotebookCell(nextCell, 'container', focusOptions);
			} else {
				const newCell = insertCell(languageService, context.notebookEditor, idx, CellKind.Code, 'below');

				if (newCell) {
					await context.notebookEditor.focusNotebookCell(newCell, 'editor', focusOptions);
				}
			}

			return runCell(editorGroupsService, context);
		}
	}
});

registerAction2(class ExecuteCellInsertBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_INSERT_BELOW,
			precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
			title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const idx = context.notebookEditor.getCellIndex(context.cell);
		const languageService = accessor.get(ILanguageService);
		const newFocusMode = context.cell.focusMode === CellFocusMode.Editor ? 'editor' : 'container';

		const newCell = insertCell(languageService, context.notebookEditor, idx, context.cell.cellKind, 'below');
		if (newCell) {
			await context.notebookEditor.focusNotebookCell(newCell, newFocusMode);
		}

		if (context.cell.cellKind === CellKind.Markup) {
			context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_INSERT_BELOW);
		} else {
			runCell(editorGroupsService, context);
		}
	}
});

class CancelNotebook extends NotebookAction {
	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookCells();
	}
}

registerAction2(class CancelAllNotebook extends CancelNotebook {
	constructor() {
		super({
			id: CANCEL_NOTEBOOK_COMMAND_ID,
			title: localize2('notebookActions.cancelNotebook', "Stop Execution"),
			icon: icons.stopIcon,
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_HAS_SOMETHING_RUNNING,
						NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						NOTEBOOK_HAS_SOMETHING_RUNNING,
						NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(),
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				}
			]
		});
	}
});

registerAction2(class InterruptNotebook extends CancelNotebook {
	constructor() {
		super({
			id: INTERRUPT_NOTEBOOK_COMMAND_ID,
			title: localize2('notebookActions.interruptNotebook', "Interrupt"),
			precondition: ContextKeyExpr.and(
				NOTEBOOK_HAS_SOMETHING_RUNNING,
				NOTEBOOK_INTERRUPTIBLE_KERNEL
			),
			icon: icons.stopIcon,
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_HAS_SOMETHING_RUNNING,
						NOTEBOOK_INTERRUPTIBLE_KERNEL,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						NOTEBOOK_HAS_SOMETHING_RUNNING,
						NOTEBOOK_INTERRUPTIBLE_KERNEL,
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.InteractiveToolbar,
					group: 'navigation/execute'
				}
			]
		});
	}
});


MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	title: localize('revealRunningCellShort', "Go To"),
	submenu: MenuId.NotebookCellExecuteGoTo,
	group: 'navigation/execute',
	order: 20,
	icon: ThemeIcon.modify(icons.executingStateIcon, 'spin')
});

registerAction2(class RevealRunningCellAction extends NotebookAction {
	constructor() {
		super({
			id: REVEAL_RUNNING_CELL,
			title: localize('revealRunningCell', "Go to Running Cell"),
			tooltip: localize('revealRunningCell', "Go to Running Cell"),
			shortTitle: localize('revealRunningCell', "Go to Running Cell"),
			precondition: NOTEBOOK_HAS_RUNNING_CELL,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_HAS_RUNNING_CELL,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					),
					group: 'navigation',
					order: 0
				},
				{
					id: MenuId.NotebookCellExecuteGoTo,
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_HAS_RUNNING_CELL,
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					),
					group: 'navigation/execute',
					order: 20
				},
				{
					id: MenuId.InteractiveToolbar,
					when: ContextKeyExpr.and(
						NOTEBOOK_HAS_RUNNING_CELL,
						ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive')
					),
					group: 'navigation',
					order: 10
				}
			],
			icon: ThemeIcon.modify(icons.executingStateIcon, 'spin')
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
		const notebook = context.notebookEditor.textModel.uri;
		const executingCells = notebookExecutionStateService.getCellExecutionsForNotebook(notebook);
		if (executingCells[0]) {
			const topStackFrameCell = this.findCellAtTopFrame(accessor, notebook);
			const focusHandle = topStackFrameCell ?? executingCells[0].cellHandle;
			const cell = context.notebookEditor.getCellByHandle(focusHandle);
			if (cell) {
				context.notebookEditor.focusNotebookCell(cell, 'container');
			}
		}
	}

	private findCellAtTopFrame(accessor: ServicesAccessor, notebook: URI): number | undefined {
		const debugService = accessor.get(IDebugService);
		for (const session of debugService.getModel().getSessions()) {
			for (const thread of session.getAllThreads()) {
				const sf = thread.getTopStackFrame();
				if (sf) {
					const parsed = CellUri.parse(sf.source.uri);
					if (parsed && parsed.notebook.toString() === notebook.toString()) {
						return parsed.handle;
					}
				}
			}
		}

		return undefined;
	}
});

registerAction2(class RevealLastFailedCellAction extends NotebookAction {
	constructor() {
		super({
			id: REVEAL_LAST_FAILED_CELL,
			title: localize('revealLastFailedCell', "Go to Most Recently Failed Cell"),
			tooltip: localize('revealLastFailedCell', "Go to Most Recently Failed Cell"),
			shortTitle: localize('revealLastFailedCellShort', "Go to Most Recently Failed Cell"),
			precondition: NOTEBOOK_LAST_CELL_FAILED,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_LAST_CELL_FAILED,
						NOTEBOOK_HAS_RUNNING_CELL.toNegated(),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					),
					group: 'navigation',
					order: 0
				},
				{
					id: MenuId.NotebookCellExecuteGoTo,
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_LAST_CELL_FAILED,
						NOTEBOOK_HAS_RUNNING_CELL.toNegated(),
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					),
					group: 'navigation/execute',
					order: 20
				},
			],
			icon: icons.errorStateIcon,
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
		const notebook = context.notebookEditor.textModel.uri;
		const lastFailedCellHandle = notebookExecutionStateService.getLastFailedCellForNotebook(notebook);
		if (lastFailedCellHandle !== undefined) {
			const lastFailedCell = context.notebookEditor.getCellByHandle(lastFailedCellHandle);
			if (lastFailedCell) {
				context.notebookEditor.focusNotebookCell(lastFailedCell, 'container');
			}
		}
	}
});
