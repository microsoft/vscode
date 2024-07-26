/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { localize } from 'vs/nls';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IVisibleEditorPane } from 'vs/workbench/common/editor';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';

export class NotebookAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 105;
	readonly name = 'notebook';
	readonly when = NOTEBOOK_IS_ACTIVE_EDITOR;
	readonly type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor()
			|| accessor.get(ICodeEditorService).getFocusedCodeEditor()
			|| accessor.get(IEditorService).activeEditorPane;

		if (!activeEditor) {
			return;
		}
		return getAccessibilityHelpProvider(accessor, activeEditor);
	}
}

export function getAccessibilityHelpText(): string {
	return [
		localize('notebook.overview', 'The notebook view is a collection of code and markdown cells. Code cells can be executed and will produce output directly below the cell.'),
		localize('notebook.cell.edit', 'The Edit Cell command<keybinding:notebook.cell.edit> will focus on the cell input.'),
		localize('notebook.cell.quitEdit', 'The Quit Edit command<keybinding:notebook.cell.quitEdit> will set focus on the cell container. The default (Escape) key may need to be pressed twice first exit the virtual cursor if active.'),
		localize('notebook.cell.focusInOutput', 'The Focus Output command<keybinding:notebook.cell.focusInOutput> will set focus in the cell\'s output.'),
		localize('notebook.focusNextEditor', 'The Focus Next Cell Editor command<keybinding:notebook.focusNextEditor> will set focus in the next cell\'s editor.'),
		localize('notebook.focusPreviousEditor', 'The Focus Previous Cell Editor command<keybinding:notebook.focusPreviousEditor> will set focus in the previous cell\'s editor.'),
		localize('notebook.cellNavigation', 'The up and down arrows will also move focus between cells while focused on the outer cell container.'),
		localize('notebook.cell.executeAndFocusContainer', 'The Execute Cell command<keybinding:notebook.cell.executeAndFocusContainer> executes the cell that currently has focus.',),
		localize('notebook.cell.insertCodeCellBelowAndFocusContainer', 'The Insert Cell Above/Below commands will create new empty code cells.'),
		localize('notebook.changeCellType', 'The Change Cell to Code/Markdown commands are used to switch between cell types.')
	].join('\n');
}

export function getAccessibilityHelpProvider(accessor: ServicesAccessor, editor: ICodeEditor | IVisibleEditorPane) {
	const helpText = getAccessibilityHelpText();
	return new AccessibleContentProvider(
		AccessibleViewProviderId.Notebook,
		{ type: AccessibleViewType.Help },
		() => helpText,
		() => editor.focus(),
		AccessibilityVerbositySettingId.Notebook,
	);
}
