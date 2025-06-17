/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { INotebookOutputActionContext, NOTEBOOK_ACTIONS_CATEGORY } from './coreActions.js';
import { NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS, NOTEBOOK_CELL_HAS_OUTPUTS } from '../../common/notebookContextKeys.js';
import * as icons from '../notebookIcons.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { copyCellOutput } from '../viewModel/cellOutputTextHelper.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICellOutputViewModel, ICellViewModel, INotebookEditor, getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import { CellKind, CellUri } from '../../common/notebookCommon.js';
import { CodeCellViewModel } from '../viewModel/codeCellViewModel.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';

export const COPY_OUTPUT_COMMAND_ID = 'notebook.cellOutput.copy';

registerAction2(class ShowAllOutputsAction extends Action2 {
	constructor() {
		super({
			id: 'notebook.cellOuput.showEmptyOutputs',
			title: localize('notebookActions.showAllOutput', "Show Empty Outputs"),
			menu: {
				id: MenuId.NotebookOutputToolbar,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS)
			},
			f1: false,
			category: NOTEBOOK_ACTIONS_CATEGORY
		});
	}

	run(accessor: ServicesAccessor, context: INotebookOutputActionContext): void {
		const cell = context.cell;
		if (cell && cell.cellKind === CellKind.Code) {

			for (let i = 1; i < cell.outputsViewModels.length; i++) {
				if (!cell.outputsViewModels[i].visible.get()) {
					cell.outputsViewModels[i].setVisible(true, true);
					(cell as CodeCellViewModel).updateOutputHeight(i, 1, 'command');
				}
			}
		}
	}
});

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

export function getOutputViewModelFromId(outputId: string, notebookEditor: INotebookEditor): ICellOutputViewModel | undefined {
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
		const notebookModelService = accessor.get(INotebookEditorModelResolverService);

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
			// reserve notebook document reference since the active notebook editor might not be pinned so it can be replaced by the output editor
			const ref = await notebookModelService.resolve(notebookEditor.textModel.uri);
			await openerService.open(CellUri.generateCellOutputUriWithId(notebookEditor.textModel.uri, outputViewModel.model.outputId));
			ref.dispose();
		}
	}
});

export const OPEN_OUTPUT_IN_OUTPUT_PREVIEW_COMMAND_ID = 'notebook.cellOutput.openInOutputPreview';

registerAction2(class OpenCellOutputInNotebookOutputEditorAction extends Action2 {
	constructor() {
		super({
			id: OPEN_OUTPUT_IN_OUTPUT_PREVIEW_COMMAND_ID,
			title: localize('notebookActions.openOutputInNotebookOutputEditor', "Open in Output Preview"),
			menu: {
				id: MenuId.NotebookOutputToolbar,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, ContextKeyExpr.equals('config.notebook.output.openInPreviewEditor.enabled', true))
			},
			f1: false,
			category: NOTEBOOK_ACTIONS_CATEGORY,
		});
	}

	private getNotebookEditor(editorService: IEditorService, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): INotebookEditor | undefined {
		if (outputContext && 'notebookEditor' in outputContext) {
			return outputContext.notebookEditor;
		}
		return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	}

	async run(accessor: ServicesAccessor, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): Promise<void> {
		const notebookEditor = this.getNotebookEditor(accessor.get(IEditorService), outputContext);
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
			return;
		}

		const genericCellViewModel = outputViewModel.cellViewModel;
		if (!genericCellViewModel) {
			return;
		}

		// get cell index
		const cellViewModel = notebookEditor.getCellByHandle(genericCellViewModel.handle);
		if (!cellViewModel) {
			return;
		}
		const cellIndex = notebookEditor.getCellIndex(cellViewModel);
		if (cellIndex === undefined) {
			return;
		}

		// get output index
		const outputIndex = genericCellViewModel.outputsViewModels.indexOf(outputViewModel);
		if (outputIndex === -1) {
			return;
		}

		if (!notebookEditor.textModel) {
			return;
		}

		// craft rich output URI to pass data to the notebook output editor/viewer
		const outputURI = CellUri.generateOutputEditorUri(
			notebookEditor.textModel.uri,
			cellViewModel.id,
			cellIndex,
			outputViewModel.model.outputId,
			outputIndex,
		);

		const openerService = accessor.get(IOpenerService);
		openerService.open(outputURI, { openToSide: true });
	}
});
