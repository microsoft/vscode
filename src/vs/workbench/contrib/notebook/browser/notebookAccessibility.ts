/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

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
	content.push(localize('notebook.cellNavigation', 'The up and down arrows will move focus between cells while focused on the outer cell container'));
	content.push(descriptionForCommand('notebook.cell.executeAndFocusContainer',
		localize('notebook.cell.executeAndFocusContainer', 'The Execute Cell command ({0}) executes the cell that currently has focus.',),
		localize('notebook.cell.executeAndFocusContainerNoKb', 'The Execute Cell command executes the cell that currently has focus and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(localize('notebook.cell.insertCodeCellBelowAndFocusContainer', 'The Insert Cell Above/Below commands will create new empty code cells'));
	content.push(localize('notebook.changeCellType', 'The Change Cell to Code/Markdown commands are used to switch between cell types.'));


	return content.join('\n');
}

function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return format(msg, kb.getAriaLabel());
	}
	return format(noKbMsg, commandId);
}

export async function runAccessibilityHelpAction(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
	const accessibleViewService = accessor.get(IAccessibleViewService);
	const helpText = getAccessibilityHelpText(accessor);
	accessibleViewService.show({
		verbositySettingKey: AccessibilityVerbositySettingId.Notebook,
		provideContent: () => helpText,
		onClose: () => {
			editor.focus();
		},
		options: { type: AccessibleViewType.Help, ariaLabel: 'Notebook accessibility help' }
	});
}

export function showAccessibleOutput(accessibleViewService: IAccessibleViewService, editorService: IEditorService) {
	const activePane = editorService.activeEditorPane;
	const notebookEditor = getNotebookEditorFromEditorPane(activePane);
	const notebookViewModel = notebookEditor?.getViewModel();
	const selections = notebookViewModel?.getSelections();
	const notebookDocument = notebookViewModel?.notebookDocument;

	if (!selections || !notebookDocument || !notebookEditor?.textModel) {
		return false;
	}

	const viewCell = notebookViewModel.viewCells[selections[0].start];
	let outputContent = '';
	const decoder = new TextDecoder();
	for (let i = 0; i < viewCell.outputsViewModels.length; i++) {
		const outputViewModel = viewCell.outputsViewModels[i];
		const outputTextModel = viewCell.model.outputs[i];
		const [mimeTypes, pick] = outputViewModel.resolveMimeTypes(notebookEditor.textModel, undefined);
		const mimeType = mimeTypes[pick].mimeType;
		let buffer = outputTextModel.outputs.find(output => output.mime === mimeType);

		if (!buffer || mimeType.startsWith('image')) {
			buffer = outputTextModel.outputs.find(output => !output.mime.startsWith('image'));
		}

		let text = `${mimeType}`; // default in case we can't get the text value for some reason.
		if (buffer) {
			const charLimit = 100_000;
			text = decoder.decode(buffer.data.slice(0, charLimit).buffer);

			if (buffer.data.byteLength > charLimit) {
				text = text + '...(truncated)';
			}

			if (mimeType.endsWith('error')) {
				text = text.replace(/\\u001b\[[0-9;]*m/gi, '').replaceAll('\\n', '\n');
			}
		}

		const index = viewCell.outputsViewModels.length > 1
			? `Cell output ${i + 1} of ${viewCell.outputsViewModels.length}\n`
			: '';
		outputContent = outputContent.concat(`${index}${text}\n`);
	}

	if (!outputContent) {
		return false;
	}

	accessibleViewService.show({
		verbositySettingKey: AccessibilityVerbositySettingId.Notebook,
		provideContent(): string { return outputContent; },
		onClose() {
			notebookEditor?.setFocus(selections[0]);
			activePane?.focus();
		},
		options: {
			ariaLabel: localize('NotebookCellOutputAccessibleView', "Notebook Cell Output Accessible View"),
			type: AccessibleViewType.View
		}
	});
	return true;
}
