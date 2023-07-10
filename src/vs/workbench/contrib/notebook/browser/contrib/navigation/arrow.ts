/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_LAST } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { INotebookActionContext, INotebookCellActionContext, NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, findTargetCellEditor } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellEditState } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';

const NOTEBOOK_FOCUS_TOP = 'notebook.focusTop';
const NOTEBOOK_FOCUS_BOTTOM = 'notebook.focusBottom';
const NOTEBOOK_FOCUS_PREVIOUS_EDITOR = 'notebook.focusPreviousEditor';
const NOTEBOOK_FOCUS_NEXT_EDITOR = 'notebook.focusNextEditor';
const FOCUS_IN_OUTPUT_COMMAND_ID = 'notebook.cell.focusInOutput';
const FOCUS_OUT_OUTPUT_COMMAND_ID = 'notebook.cell.focusOutOutput';
export const CENTER_ACTIVE_CELL = 'notebook.centerActiveCell';
const NOTEBOOK_CURSOR_PAGEUP_COMMAND_ID = 'notebook.cell.cursorPageUp';
const NOTEBOOK_CURSOR_PAGEUP_SELECT_COMMAND_ID = 'notebook.cell.cursorPageUpSelect';
const NOTEBOOK_CURSOR_PAGEDOWN_COMMAND_ID = 'notebook.cell.cursorPageDown';
const NOTEBOOK_CURSOR_PAGEDOWN_SELECT_COMMAND_ID = 'notebook.cell.cursorPageDownSelect';

registerAction2(class FocusNextCellAction extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_NEXT_EDITOR,
			title: localize('cursorMoveDown', 'Focus Next Cell Editor'),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.equals('config.notebook.navigation.allowNavigateToSurroundingCells', true),
						ContextKeyExpr.and(
							ContextKeyExpr.has(InputFocusedContextKey),
							EditorContextKeys.editorTextFocus,
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'),
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none'),
						),
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					primary: KeyCode.DownArrow,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, // code cell keybinding, focus inside editor: lower weight to not override suggest widget
				},
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.equals('config.notebook.navigation.allowNavigateToSurroundingCells', true),
						ContextKeyExpr.and(
							NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
							NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
							NOTEBOOK_CURSOR_NAVIGATION_MODE),
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					primary: KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib, // markdown keybinding, focus on list: higher weight to override list.focusDown
				},
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow, },
					weight: KeybindingWeight.WorkbenchContrib
				},
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.equals('config.notebook.navigation.allowNavigateToSurroundingCells', true),
						ContextKeyExpr.and(
							ContextKeyExpr.has(InputFocusedContextKey),
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'),
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none'),
						),
						CTX_INLINE_CHAT_FOCUSED,
						CTX_INLINE_CHAT_INNER_CURSOR_LAST,
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					primary: KeyCode.DownArrow,
					weight: KeybindingWeight.EditorCore
				},
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.equals('config.notebook.navigation.allowNavigateToSurroundingCells', true),
						ContextKeyExpr.and(
							NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
							NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
							NOTEBOOK_CURSOR_NAVIGATION_MODE),
						CTX_INLINE_CHAT_FOCUSED,
						CTX_INLINE_CHAT_INNER_CURSOR_LAST,
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					primary: KeyCode.DownArrow,
					weight: KeybindingWeight.EditorCore
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
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

		const focusEditorLine = activeCell.textBuffer.getLineCount();
		const targetCell = (context.cell ?? context.selectedCells?.[0]);
		const foundEditor: ICodeEditor | undefined = targetCell ? findTargetCellEditor(context, targetCell) : undefined;

		if (foundEditor && foundEditor.hasTextFocus() && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === focusEditorLine) {
			InlineChatController.get(foundEditor)?.focus();
		} else {
			const newCell = editor.cellAt(idx + 1);
			const newFocusMode = newCell.cellKind === CellKind.Markup && newCell.getEditState() === CellEditState.Preview ? 'container' : 'editor';
			await editor.focusNotebookCell(newCell, newFocusMode, { focusEditorLine: 1 });
		}
	}
});


registerAction2(class FocusPreviousCellAction extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_PREVIOUS_EDITOR,
			title: localize('cursorMoveUp', 'Focus Previous Cell Editor'),
			precondition: CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.equals('config.notebook.navigation.allowNavigateToSurroundingCells', true),
						ContextKeyExpr.and(
							ContextKeyExpr.has(InputFocusedContextKey),
							EditorContextKeys.editorTextFocus,
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('bottom'),
							NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none'),
						),
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					primary: KeyCode.UpArrow,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, // code cell keybinding, focus inside editor: lower weight to not override suggest widget
				},
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
						ContextKeyExpr.equals('config.notebook.navigation.allowNavigateToSurroundingCells', true),
						ContextKeyExpr.and(
							NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
							NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
							NOTEBOOK_CURSOR_NAVIGATION_MODE
						),
						EditorContextKeys.isEmbeddedDiffEditor.negate()
					),
					primary: KeyCode.UpArrow,
					weight: KeybindingWeight.WorkbenchContrib, // markdown keybinding, focus on list: higher weight to override list.focusDown
				}
			],
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
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

		const foundEditor: ICodeEditor | undefined = findTargetCellEditor(context, newCell);

		if (foundEditor && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === focusEditorLine) {
			InlineChatController.get(foundEditor)?.focus();
		}
	}
});


registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_TOP,
			title: localize('focusFirstCell', 'Focus First Cell'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.Home,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (editor.getLength() === 0) {
			return;
		}

		const firstCell = editor.cellAt(0);
		await editor.focusNotebookCell(firstCell, 'container');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_BOTTOM,
			title: localize('focusLastCell', 'Focus Last Cell'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.End,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.hasModel() || editor.getLength() === 0) {
			return;
		}

		const lastIdx = editor.getLength() - 1;
		const lastVisibleIdx = editor.getPreviousVisibleCellIndex(lastIdx);
		if (lastVisibleIdx) {
			const cell = editor.cellAt(lastVisibleIdx);
			await editor.focusNotebookCell(cell, 'container');
		}
	}
});


registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: FOCUS_IN_OUTPUT_COMMAND_ID,
			title: localize('focusOutput', 'Focus In Active Cell Output'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_CELL_HAS_OUTPUTS),
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow, },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		return timeout(0).then(() => editor.focusNotebookCell(activeCell, 'output'));
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: FOCUS_OUT_OUTPUT_COMMAND_ID,
			title: localize('focusOutputOut', 'Focus Out Active Cell Output'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.UpArrow, },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		await editor.focusNotebookCell(activeCell, 'editor');
	}
});

registerAction2(class CenterActiveCellAction extends NotebookCellAction {
	constructor() {
		super({
			id: CENTER_ACTIVE_CELL,
			title: localize('notebookActions.centerActiveCell', "Center Active Cell"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.KeyL,
				},
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.revealInCenter(context.cell);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_CURSOR_PAGEUP_COMMAND_ID,
			title: localize('cursorPageUp', "Cell Cursor Page Up"),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.has(InputFocusedContextKey),
						EditorContextKeys.editorTextFocus,
					),
					primary: KeyCode.PageUp,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		EditorExtensionsRegistry.getEditorCommand('cursorPageUp').runCommand(accessor, { pageSize: getPageSize(context) });
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_CURSOR_PAGEUP_SELECT_COMMAND_ID,
			title: localize('cursorPageUpSelect', "Cell Cursor Page Up Select"),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.has(InputFocusedContextKey),
						EditorContextKeys.editorTextFocus,
					),
					primary: KeyMod.Shift | KeyCode.PageUp,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		EditorExtensionsRegistry.getEditorCommand('cursorPageUpSelect').runCommand(accessor, { pageSize: getPageSize(context) });
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_CURSOR_PAGEDOWN_COMMAND_ID,
			title: localize('cursorPageDown', "Cell Cursor Page Down"),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.has(InputFocusedContextKey),
						EditorContextKeys.editorTextFocus,
					),
					primary: KeyCode.PageDown,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		EditorExtensionsRegistry.getEditorCommand('cursorPageDown').runCommand(accessor, { pageSize: getPageSize(context) });
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_CURSOR_PAGEDOWN_SELECT_COMMAND_ID,
			title: localize('cursorPageDownSelect', "Cell Cursor Page Down Select"),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.has(InputFocusedContextKey),
						EditorContextKeys.editorTextFocus,
					),
					primary: KeyMod.Shift | KeyCode.PageDown,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		EditorExtensionsRegistry.getEditorCommand('cursorPageDownSelect').runCommand(accessor, { pageSize: getPageSize(context) });
	}
});


function getPageSize(context: INotebookCellActionContext) {
	const editor = context.notebookEditor;
	const layoutInfo = editor._getViewModel().layoutInfo;
	const lineHeight = layoutInfo?.fontInfo.lineHeight || 17;
	return Math.max(1, Math.floor((layoutInfo?.height || 0) / lineHeight) - 2);
}


Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'notebook',
	order: 100,
	type: 'object',
	'properties': {
		'notebook.navigation.allowNavigateToSurroundingCells': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('notebook.navigation.allowNavigateToSurroundingCells', "When enabled cursor can navigate to the next/previous cell when the current cursor in the cell editor is at the first/last line.")
		}
	}
});
