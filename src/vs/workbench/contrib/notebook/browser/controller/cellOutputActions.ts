/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { INotebookOutputActionContext, NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { NOTEBOOK_CELL_HAS_OUTPUTS } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { ILogService } from 'vs/platform/log/common/log';
import { copyCellOutput } from 'vs/workbench/contrib/notebook/browser/contrib/clipboard/cellOutputClipboard';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICellOutputViewModel, ICellViewModel, INotebookEditor, getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';

export const COPY_OUTPUT_COMMAND_ID = 'notebook.cellOutput.copy';

registerAction2(class CopyCellOutputAction extends Action2 {
	constructor() {
		super({
			id: COPY_OUTPUT_COMMAND_ID,
			title: localize('notebookActions.copyOutput', "Copy Cell Output"),
			menu: {
				id: MenuId.NotebookOutputToolbar,
				when: NOTEBOOK_CELL_HAS_OUTPUTS
			},
			category: NOTEBOOK_ACTIONS_CATEGORY,
			icon: icons.copyIcon,
		});
	}

	private getNoteboookEditor(editorService: IEditorService, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): INotebookEditor | undefined {
		if (outputContext && 'notebookEditor' in outputContext) {
			return outputContext.notebookEditor;
		}
		return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	}

	async run(accessor: ServicesAccessor, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): Promise<void> {
		const notebookEditor = this.getNoteboookEditor(accessor.get(IEditorService), outputContext);

		if (!notebookEditor) {
			return;
		}

		let outputViewModel: ICellOutputViewModel | undefined;
		if (outputContext && 'outputId' in outputContext && typeof outputContext.outputId === 'string') {
			outputViewModel = getOutputViewModelFromId(outputContext.outputId, notebookEditor);
		} else if (outputContext && 'outputViewModel' in outputContext) {
			outputViewModel = outputContext.outputViewModel;
		}

		if (!outputViewModel) {
			// not able to find the output from the provided context, use the active cell
			const activeCell = notebookEditor.getActiveCell();
			if (!activeCell) {
				return;
			}

			if (activeCell.focusedOutputId !== undefined) {
				outputViewModel = activeCell.outputsViewModels.find(output => {
					return output.model.outputId === activeCell.focusedOutputId;
				});
			} else {
				outputViewModel = activeCell.outputsViewModels.find(output => output.pickedMimeType?.isTrusted);
			}
		}

		if (!outputViewModel) {
			return;
		}

		const mimeType = outputViewModel.pickedMimeType?.mimeType;

		if (mimeType?.startsWith('image/')) {
			const focusOptions = { skipReveal: true, outputId: outputViewModel.model.outputId, altOutputId: outputViewModel.model.alternativeOutputId };
			await notebookEditor.focusNotebookCell(outputViewModel.cellViewModel as ICellViewModel, 'output', focusOptions);
			notebookEditor.copyOutputImage(outputViewModel);
		} else {
			const clipboardService = accessor.get(IClipboardService);
			const logService = accessor.get(ILogService);

			copyCellOutput(mimeType, outputViewModel, clipboardService, logService);
		}
	}

});

function getOutputViewModelFromId(outputId: string, notebookEditor: INotebookEditor): ICellOutputViewModel | undefined {
	const notebookViewModel = notebookEditor.getViewModel();
	if (notebookViewModel) {
		const codeCells = notebookViewModel.viewCells.filter(cell => cell.cellKind === CellKind.Code) as CodeCellViewModel[];
		for (const cell of codeCells) {
			const output = cell.outputsViewModels.find(output => output.model.outputId === outputId || output.model.alternativeOutputId === outputId);
			if (output) {
				return output;
			}
		}
	}

	return undefined;
}

export const OPEN_OUTPUT_COMMAND_ID = 'notebook.cellOutput.openInTextEditor';

registerAction2(class OpenCellOutputInEditorAction extends Action2 {
	constructor() {
		super({
			id: OPEN_OUTPUT_COMMAND_ID,
			title: localize('notebookActions.openOutputInEditor', "Open Cell Output in Text Editor"),
			f1: false,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			icon: icons.copyIcon,
		});
	}

	private getNoteboookEditor(editorService: IEditorService, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): INotebookEditor | undefined {
		if (outputContext && 'notebookEditor' in outputContext) {
			return outputContext.notebookEditor;
		}
		return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	}

	async run(accessor: ServicesAccessor, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): Promise<void> {
		const notebookEditor = this.getNoteboookEditor(accessor.get(IEditorService), outputContext);

		if (!notebookEditor) {
			return;
		}

		let outputViewModel: ICellOutputViewModel | undefined;
		if (outputContext && 'outputId' in outputContext && typeof outputContext.outputId === 'string') {
			outputViewModel = getOutputViewModelFromId(outputContext.outputId, notebookEditor);
		} else if (outputContext && 'outputViewModel' in outputContext) {
			outputViewModel = outputContext.outputViewModel;
		}

		const openerService = accessor.get(IOpenerService);

		if (outputViewModel?.model.outputId && notebookEditor.textModel?.uri) {
			openerService.open(CellUri.generateCellOutputUri(notebookEditor.textModel.uri, outputViewModel.model.outputId));
		}
	}
});
