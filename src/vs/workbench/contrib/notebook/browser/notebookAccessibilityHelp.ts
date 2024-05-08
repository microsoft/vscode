/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { AccessibleViewProviderId, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
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

		if (activeEditor) {
			return runAccessibilityHelpAction(accessor, activeEditor);
		}
		return;
	}
}



export function getAccessibilityHelpText(accessor: ServicesAccessor): string {
	const keybindingService = accessor.get(IKeybindingService);
	const content = [];
	content.push(localize('notebook.overview', 'The notebook view is a collection of code and markdown cells. Code cells can be executed and will produce output directly below the cell.'));
	content.push(descriptionForCommand('notebook.cell.edit',
		localize('notebook.cell.edit', 'The Edit Cell command ({0}) will focus on the cell input.'),
		localize('notebook.cell.editNoKb', 'The Edit Cell command will focus on the cell input and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(descriptionForCommand('notebook.cell.quitEdit',
		localize('notebook.cell.quitEdit', 'The Quit Edit command ({0}) will set focus on the cell container. The default (Escape) key may need to be pressed twice first exit the virtual cursor if active.'),
		localize('notebook.cell.quitEditNoKb', 'The Quit Edit command will set focus on the cell container and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(descriptionForCommand('notebook.cell.focusInOutput',
		localize('notebook.cell.focusInOutput', 'The Focus Output command ({0}) will set focus in the cell\'s output.'),
		localize('notebook.cell.focusInOutputNoKb', 'The Quit Edit command will set focus in the cell\'s output and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(descriptionForCommand('notebook.focusNextEditor',
		localize('notebook.focusNextEditor', 'The Focus Next Cell Editor command ({0}) will set focus in the next cell\'s editor.'),
		localize('notebook.focusNextEditorNoKb', 'The Focus Next Cell Editor command will set focus in the next cell\'s editor and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(descriptionForCommand('notebook.focusPreviousEditor',
		localize('notebook.focusPreviousEditor', 'The Focus Previous Cell Editor command ({0}) will set focus in the previous cell\'s editor.'),
		localize('notebook.focusPreviousEditorNoKb', 'The Focus Previous Cell Editor command will set focus in the previous cell\'s editor and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(localize('notebook.cellNavigation', 'The up and down arrows will also move focus between cells while focused on the outer cell container.'));
	content.push(descriptionForCommand('notebook.cell.executeAndFocusContainer',
		localize('notebook.cell.executeAndFocusContainer', 'The Execute Cell command ({0}) executes the cell that currently has focus.',),
		localize('notebook.cell.executeAndFocusContainerNoKb', 'The Execute Cell command executes the cell that currently has focus and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(localize('notebook.cell.insertCodeCellBelowAndFocusContainer', 'The Insert Cell Above/Below commands will create new empty code cells'));
	content.push(localize('notebook.changeCellType', 'The Change Cell to Code/Markdown commands are used to switch between cell types.'));


	return content.join('\n\n');
}

function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return format(msg, kb.getAriaLabel());
	}
	return format(noKbMsg, commandId);
}

export function runAccessibilityHelpAction(accessor: ServicesAccessor, editor: ICodeEditor | IVisibleEditorPane) {
	const helpText = getAccessibilityHelpText(accessor);
	return {
		id: AccessibleViewProviderId.Notebook,
		verbositySettingKey: AccessibilityVerbositySettingId.Notebook,
		provideContent: () => helpText,
		onClose: () => {
			editor.focus();
		},
		options: { type: AccessibleViewType.Help }
	};
}
