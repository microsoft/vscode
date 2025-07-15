/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../nls.js';
import { IAction2Options, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { insertCell } from './cellOperations.js';
import { INotebookActionContext, NotebookAction } from './coreActions.js';
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_EDITABLE } from '../../common/notebookContextKeys.js';
import { CellViewModel } from '../viewModel/notebookViewModelImpl.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION } from './chat/notebookChatContext.js';
import { INotebookKernelHistoryService } from '../../common/notebookKernelService.js';

const INSERT_CODE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertCodeCellAbove';
const INSERT_CODE_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertCodeCellBelow';
const INSERT_CODE_CELL_ABOVE_AND_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.insertCodeCellAboveAndFocusContainer';
const INSERT_CODE_CELL_BELOW_AND_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.insertCodeCellBelowAndFocusContainer';
const INSERT_CODE_CELL_AT_TOP_COMMAND_ID = 'notebook.cell.insertCodeCellAtTop';
const INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertMarkdownCellAbove';
const INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertMarkdownCellBelow';
const INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID = 'notebook.cell.insertMarkdownCellAtTop';

export function insertNewCell(accessor: ServicesAccessor, context: INotebookActionContext, kind: CellKind, direction: 'above' | 'below', focusEditor: boolean) {
	let newCell: CellViewModel | null = null;
	if (context.ui) {
		context.notebookEditor.focus();
	}

	const languageService = accessor.get(ILanguageService);
	const kernelHistoryService = accessor.get(INotebookKernelHistoryService);

	if (context.cell) {
		const idx = context.notebookEditor.getCellIndex(context.cell);
		newCell = insertCell(languageService, context.notebookEditor, idx, kind, direction, undefined, true, kernelHistoryService);
	} else {
		const focusRange = context.notebookEditor.getFocus();
		const next = Math.max(focusRange.end - 1, 0);
		newCell = insertCell(languageService, context.notebookEditor, next, kind, direction, undefined, true, kernelHistoryService);
	}

	return newCell;
}

export abstract class InsertCellCommand extends NotebookAction {
	constructor(
		desc: Readonly<IAction2Options>,
		private kind: CellKind,
		private direction: 'above' | 'below',
		private focusEditor: boolean
	) {
		super(desc);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const newCell = await insertNewCell(accessor, context, this.kind, this.direction, this.focusEditor);

		if (newCell) {
			await context.notebookEditor.focusNotebookCell(newCell, this.focusEditor ? 'editor' : 'container');
		}
	}
}

registerAction2(class InsertCodeCellAboveAction extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAbove', "Insert Code Cell Above"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 0
				}
			},
			CellKind.Code,
			'above',
			true);
	}
});



registerAction2(class InsertCodeCellAboveAndFocusContainerAction extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_ABOVE_AND_FOCUS_CONTAINER_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAboveAndFocusContainer', "Insert Code Cell Above and Focus Container")
			},
			CellKind.Code,
			'above',
			false);
	}
});

registerAction2(class InsertCodeCellBelowAction extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellBelow', "Insert Code Cell Below"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated(), CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION.isEqualTo('')),
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 1
				}
			},
			CellKind.Code,
			'below',
			true);
	}
});

registerAction2(class InsertCodeCellBelowAndFocusContainerAction extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_BELOW_AND_FOCUS_CONTAINER_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellBelowAndFocusContainer', "Insert Code Cell Below and Focus Container"),
			},
			CellKind.Code,
			'below',
			false);
	}
});


registerAction2(class InsertMarkdownCellAboveAction extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellAbove', "Insert Markdown Cell Above"),
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 2
				}
			},
			CellKind.Markup,
			'above',
			true);
	}
});

registerAction2(class InsertMarkdownCellBelowAction extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below"),
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 3
				}
			},
			CellKind.Markup,
			'below',
			true);
	}
});


registerAction2(class InsertCodeCellAtTopAction extends NotebookAction {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAtTop', "Add Code Cell At Top"),
				f1: false
			});
	}

	override async run(accessor: ServicesAccessor, context?: INotebookActionContext): Promise<void> {
		context = context ?? this.getEditorContextFromArgsOrActive(accessor);
		if (context) {
			this.runWithContext(accessor, context);
		}
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const languageService = accessor.get(ILanguageService);
		const kernelHistoryService = accessor.get(INotebookKernelHistoryService);
		const newCell = insertCell(languageService, context.notebookEditor, 0, CellKind.Code, 'above', undefined, true, kernelHistoryService);

		if (newCell) {
			await context.notebookEditor.focusNotebookCell(newCell, 'editor');
		}
	}
});

registerAction2(class InsertMarkdownCellAtTopAction extends NotebookAction {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellAtTop', "Add Markdown Cell At Top"),
				f1: false
			});
	}

	override async run(accessor: ServicesAccessor, context?: INotebookActionContext): Promise<void> {
		context = context ?? this.getEditorContextFromArgsOrActive(accessor);
		if (context) {
			this.runWithContext(accessor, context);
		}
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const languageService = accessor.get(ILanguageService);
		const kernelHistoryService = accessor.get(INotebookKernelHistoryService);

		const newCell = insertCell(languageService, context.notebookEditor, 0, CellKind.Markup, 'above', undefined, true, kernelHistoryService);

		if (newCell) {
			await context.notebookEditor.focusNotebookCell(newCell, 'editor');
		}
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
		title: '$(add) ' + localize('notebookActions.menu.insertCode', "Code"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left')
	)
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
		title: localize('notebookActions.menu.insertCode.minimalToolbar', "Add Code"),
		icon: Codicon.add,
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.equals('config.notebook.experimental.insertToolbarAlignment', 'left')
	)
});

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
		icon: Codicon.add,
		title: localize('notebookActions.menu.insertCode.ontoolbar', "Code"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: -5,
	group: 'navigation/add',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden')
	)
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
	command: {
		id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
		title: '$(add) ' + localize('notebookActions.menu.insertCode', "Code"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left')
	)
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
	command: {
		id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
		title: localize('notebookActions.menu.insertCode.minimaltoolbar', "Add Code"),
		icon: Codicon.add,
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.equals('config.notebook.experimental.insertToolbarAlignment', 'left')
	)
});


MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
		title: '$(add) ' + localize('notebookActions.menu.insertMarkdown', "Markdown"),
		tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
	},
	order: 1,
	group: 'inline',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left')
	)
});

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
		icon: Codicon.add,
		title: localize('notebookActions.menu.insertMarkdown.ontoolbar', "Markdown"),
		tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
	},
	order: -5,
	group: 'navigation/add',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'),
		ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden'),
		ContextKeyExpr.notEquals(`config.${NotebookSetting.globalToolbarShowLabel}`, false),
		ContextKeyExpr.notEquals(`config.${NotebookSetting.globalToolbarShowLabel}`, 'never')
	)
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
	command: {
		id: INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID,
		title: '$(add) ' + localize('notebookActions.menu.insertMarkdown', "Markdown"),
		tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
	},
	order: 1,
	group: 'inline',
	when: ContextKeyExpr.and(
		NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
		ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left')
	)
});
