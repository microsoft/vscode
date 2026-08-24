/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../../base/common/iterator.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize, localize2 } from '../../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDebugService } from '../../../debug/common/debug.js';
import { CTX_INLINE_CHAT_FOCUSED } from '../../../inlineChat/common/inlineChat.js';
import { insertCell } from './cellOperations.js';
import { CELL_TITLE_CELL_GROUP_ID, CellToolbarOrder, INotebookActionContext, INotebookCellActionContext, INotebookCellToolbarActionContext, INotebookCommandContext, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NotebookAction, NotebookCellAction, NotebookMultiCellAction, cellExecutionArgs, getContextFromActiveEditor, getContextFromUri, parseMultiCellExecutionArgs } from './coreActions.js';
import { CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, IActiveNotebookEditor, ICellViewModel, IFocusNotebookCellOptions, ScrollToRevealBehavior } from '../notebookBrowser.js';
import * as icons from '../notebookIcons.js';
import { CellKind, CellUri, NotebookSetting } from '../../common/notebookCommon.js';
import { NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_MISSING_KERNEL_EXTENSION } from '../../common/notebookContextKeys.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CodeCellViewModel } from '../viewModel/codeCellViewModel.js';

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

export const executeSectionCondition = ContextKeyExpr.and(
	NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
);

function renderAllMarkdownCells(context: INotebookActionContext): void {
	for (let i = 0; i < context.notebookEditor.getLength(); i++) {
		const cell = context.notebookEditor.cellAt(i);

		if (cell.cellKind === CellKind.Markup) {
			cell.updateEditState(CellEditState.Preview, 'renderAllMarkdownCells');
		}
	}
}

async function runCell(editorGroupsService: IEditorGroupsService, context: INotebookActionContext, editorService?: IEditorService): Promise<void> {
	const group = editorGroupsService.activeGroup;

	if (group) {
		if (group.activeEditor) {
			group.pinEditor(group.activeEditor);
		}
	}

	// If auto-reveal is enabled, ensure the notebook editor is visible before revealing cells
	if (context.autoReveal && (context.cell || context.selectedCells?.length) && editorService) {
		editorService.openEditor({ resource: context.notebookEditor.textModel.uri, options: { revealIfOpened: true } });
	}

	if (context.ui && context.cell) {
		if (context.autoReveal) {
			handleAutoReveal(context.cell, context.notebookEditor);
		}
		await context.notebookEditor.executeNotebookCells(Iterable.single(context.cell));
	} else if (context.selectedCells?.length || context.cell) {
		const selectedCells = context.selectedCells?.length ? context.selectedCells : [context.cell!];
		const firstCell = selectedCells[0];

		if (firstCell && context.autoReveal) {
			handleAutoReveal(firstCell, context.notebookEditor);
		}
		await context.notebookEditor.executeNotebookCells(selectedCells);
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
}

const SMART_VIEWPORT_TOP_REVEAL_PADDING = 20; // enough to not cut off top of cell toolbar
const SMART_VIEWPORT_BOTTOM_REVEAL_PADDING = 60; // enough to show full bottom of output element + tiny buffer below that vertical bar
function handleAutoReveal(cell: ICellViewModel, notebookEditor: IActiveNotebookEditor): void {
	// always focus the container, blue bar is a good visual aid in tracking what's happening
	notebookEditor.focusNotebookCell(cell, 'container', { skipReveal: true });

	// Handle markup cells with simple reveal
	if (cell.cellKind === CellKind.Markup) {
		const cellIndex = notebookEditor.getCellIndex(cell);
		notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		return;
	}

	// Ensure we're working with a code cell - we need the CodeCellViewModel type for accessing layout properties like outputTotalHeight
	if (!(cell instanceof CodeCellViewModel)) {
		return;
	}

	// Get all dimensions
	const cellEditorScrollTop = notebookEditor.getAbsoluteTopOfElement(cell);
	const cellEditorScrollBottom = cellEditorScrollTop + cell.layoutInfo.outputContainerOffset;

	const cellOutputHeight = cell.layoutInfo.outputTotalHeight;
	const cellOutputScrollBottom = notebookEditor.getAbsoluteBottomOfElement(cell);

	const viewportHeight = notebookEditor.getLayoutInfo().height;
	const viewportHeight34 = viewportHeight * 0.34;
	const viewportHeight66 = viewportHeight * 0.66;

	const totalHeight = cell.layoutInfo.totalHeight;

	const isFullyVisible = cellEditorScrollTop >= notebookEditor.scrollTop && cellOutputScrollBottom <= notebookEditor.scrollBottom;
	const isEditorBottomVisible = ((cellEditorScrollBottom - 25 /* padding for the cell status bar */) >= notebookEditor.scrollTop) &&
		((cellEditorScrollBottom + 25 /* padding to see a sliver of the beginning of outputs */) <= notebookEditor.scrollBottom);

	// Common scrolling functions
	const revealWithTopPadding = (position: number) => { notebookEditor.setScrollTop(position - SMART_VIEWPORT_TOP_REVEAL_PADDING); };
	const revealWithNoPadding = (position: number) => { notebookEditor.setScrollTop(position); };
	const revealWithBottomPadding = (position: number) => { notebookEditor.setScrollTop(position + SMART_VIEWPORT_BOTTOM_REVEAL_PADDING); };

	// CASE 0: Total is already visible
	if (isFullyVisible) {
		return;
	}

	// CASE 1: Total fits within viewport
	if (totalHeight <= viewportHeight && !isEditorBottomVisible) {
		revealWithTopPadding(cellEditorScrollTop);
		return;
	}

	// CASE 2: Total doesn't fit in the viewport
	if (totalHeight > viewportHeight && !isEditorBottomVisible) {
		if (cellOutputHeight > 0 && cellOutputHeight >= viewportHeight66) {
			// has large outputs -- Show 34% editor, 66% output
			revealWithNoPadding(cellEditorScrollBottom - viewportHeight34);
		} else if (cellOutputHeight > 0) {
			// has small outputs -- Show output at viewport bottom
			revealWithBottomPadding(cellOutputScrollBottom - viewportHeight);
		} else {
			// No outputs, just big cell -- put editor bottom @ 2/3 of viewport height
			revealWithNoPadding(cellEditorScrollBottom - viewportHeight66);
		}
	}
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
						ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated()),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
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
		const editor = editorService.findEditors({
			resource: context.notebookEditor.textModel.uri,
			typeId: NotebookEditorInput.ID,
			editorId: context.notebookEditor.textModel.viewType
		}).at(0);
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
				when: NOTEBOOK_CELL_LIST_FOCUSED,
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

	override parseArgs(accessor: ServicesAccessor, ...args: unknown[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);

		if (context.ui) {
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		}

		await runCell(editorGroupsService, context, editorService);
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

	override parseArgs(accessor: ServicesAccessor, ...args: unknown[]): INotebookCommandContext | undefined {
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

	override parseArgs(accessor: ServicesAccessor, ...args: unknown[]): INotebookCommandContext | undefined {
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

	override parseArgs(accessor: ServicesAccessor, ...args: unknown[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);

		if (context.ui) {
			await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		} else {
			const firstCell = context.selectedCells[0];

			if (firstCell) {
				await context.notebookEditor.focusNotebookCell(firstCell, 'container', { skipReveal: true });
			}
		}

		await runCell(editorGroupsService, context, editorService);
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

	override parseArgs(accessor: ServicesAccessor, ...args: unknown[]): INotebookCommandContext | undefined {
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
		const editorService = accessor.get(IEditorService);
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

			return runCell(editorGroupsService, context, editorService);
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
		const editorService = accessor.get(IEditorService);
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
			runCell(editorGroupsService, context, editorService);
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
