/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from './coreActions.js';
import { NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_OUTPUT_MIMETYPE } from '../../common/notebookContextKeys.js';
import * as icons from '../notebookIcons.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { copyCellOutput } from '../viewModel/cellOutputTextHelper.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import { CellKind, CellUri } from '../../common/notebookCommon.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
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
    run(accessor, context) {
        const cell = context.cell;
        if (cell && cell.cellKind === CellKind.Code) {
            for (let i = 1; i < cell.outputsViewModels.length; i++) {
                if (!cell.outputsViewModels[i].visible.get()) {
                    cell.outputsViewModels[i].setVisible(true, true);
                    cell.updateOutputHeight(i, 1, 'command');
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
    async run(accessor, outputContext) {
        const editorService = accessor.get(IEditorService);
        const clipboardService = accessor.get(IClipboardService);
        const logService = accessor.get(ILogService);
        const notebookEditor = getNotebookEditorFromContext(editorService, outputContext);
        if (!notebookEditor) {
            return;
        }
        const outputViewModel = getOutputViewModelFromContext(outputContext, notebookEditor);
        if (!outputViewModel) {
            return;
        }
        const mimeType = outputViewModel.pickedMimeType?.mimeType;
        if (mimeType?.startsWith('image/')) {
            const focusOptions = { skipReveal: true, outputId: outputViewModel.model.outputId, altOutputId: outputViewModel.model.alternativeOutputId };
            await notebookEditor.focusNotebookCell(outputViewModel.cellViewModel, 'output', focusOptions);
            notebookEditor.copyOutputImage(outputViewModel);
        }
        else {
            copyCellOutput(mimeType, outputViewModel, clipboardService, logService);
        }
    }
});
export function getOutputViewModelFromId(outputId, notebookEditor) {
    const notebookViewModel = notebookEditor.getViewModel();
    if (notebookViewModel) {
        const codeCells = notebookViewModel.viewCells.filter(cell => cell.cellKind === CellKind.Code);
        for (const cell of codeCells) {
            const output = cell.outputsViewModels.find(output => output.model.outputId === outputId || output.model.alternativeOutputId === outputId);
            if (output) {
                return output;
            }
        }
    }
    return undefined;
}
function getNotebookEditorFromContext(editorService, outputContext) {
    if (outputContext && 'notebookEditor' in outputContext) {
        return outputContext.notebookEditor;
    }
    return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
}
function getOutputViewModelFromContext(outputContext, notebookEditor) {
    let outputViewModel;
    if (outputContext && 'outputId' in outputContext && typeof outputContext.outputId === 'string') {
        outputViewModel = getOutputViewModelFromId(outputContext.outputId, notebookEditor);
    }
    else if (outputContext && 'outputViewModel' in outputContext) {
        outputViewModel = outputContext.outputViewModel;
    }
    if (!outputViewModel) {
        // not able to find the output from the provided context, use the active cell
        const activeCell = notebookEditor.getActiveCell();
        if (!activeCell) {
            return undefined;
        }
        if (activeCell.focusedOutputId !== undefined) {
            outputViewModel = activeCell.outputsViewModels.find(output => {
                return output.model.outputId === activeCell.focusedOutputId;
            });
        }
        else {
            outputViewModel = activeCell.outputsViewModels.find(output => output.pickedMimeType?.isTrusted);
        }
    }
    return outputViewModel;
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
    async run(accessor, outputContext) {
        const editorService = accessor.get(IEditorService);
        const notebookModelService = accessor.get(INotebookEditorModelResolverService);
        const openerService = accessor.get(IOpenerService);
        const notebookEditor = getNotebookEditorFromContext(editorService, outputContext);
        if (!notebookEditor) {
            return;
        }
        const outputViewModel = getOutputViewModelFromContext(outputContext, notebookEditor);
        if (outputViewModel?.model.outputId && notebookEditor.textModel?.uri) {
            // reserve notebook document reference since the active notebook editor might not be pinned so it can be replaced by the output editor
            const ref = await notebookModelService.resolve(notebookEditor.textModel.uri);
            await openerService.open(CellUri.generateCellOutputUriWithId(notebookEditor.textModel.uri, outputViewModel.model.outputId));
            ref.dispose();
        }
    }
});
export const SAVE_OUTPUT_IMAGE_COMMAND_ID = 'notebook.cellOutput.saveImage';
registerAction2(class SaveCellOutputImageAction extends Action2 {
    constructor() {
        super({
            id: SAVE_OUTPUT_IMAGE_COMMAND_ID,
            title: localize('notebookActions.saveOutputImage', "Save Image"),
            menu: {
                id: MenuId.NotebookOutputToolbar,
                when: ContextKeyExpr.regex(NOTEBOOK_CELL_OUTPUT_MIMETYPE.key, /^image\//)
            },
            f1: false,
            category: NOTEBOOK_ACTIONS_CATEGORY,
            icon: icons.saveIcon,
        });
    }
    async run(accessor, outputContext) {
        const editorService = accessor.get(IEditorService);
        const fileDialogService = accessor.get(IFileDialogService);
        const fileService = accessor.get(IFileService);
        const logService = accessor.get(ILogService);
        const notebookEditor = getNotebookEditorFromContext(editorService, outputContext);
        if (!notebookEditor) {
            return;
        }
        const outputViewModel = getOutputViewModelFromContext(outputContext, notebookEditor);
        if (!outputViewModel) {
            return;
        }
        const mimeType = outputViewModel.pickedMimeType?.mimeType;
        // Only handle image mime types
        if (!mimeType?.startsWith('image/')) {
            return;
        }
        const outputItem = outputViewModel.model.outputs.find(output => output.mime === mimeType);
        if (!outputItem) {
            logService.error('Could not find output item with mime type', mimeType);
            return;
        }
        // Determine file extension based on mime type
        const mimeToExt = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/gif': 'gif',
            'image/svg+xml': 'svg',
            'image/webp': 'webp',
            'image/bmp': 'bmp',
            'image/tiff': 'tiff'
        };
        const extension = mimeToExt[mimeType] || 'png';
        const defaultFileName = `image.${extension}`;
        const defaultUri = notebookEditor.textModel?.uri
            ? URI.joinPath(URI.file(notebookEditor.textModel.uri.fsPath), '..', defaultFileName)
            : undefined;
        const uri = await fileDialogService.showSaveDialog({
            defaultUri,
            filters: [{
                    name: localize('imageFiles', "Image Files"),
                    extensions: [extension]
                }]
        });
        if (!uri) {
            return; // User cancelled
        }
        try {
            const imageData = outputItem.data;
            await fileService.writeFile(uri, imageData);
            logService.info('Saved image output to', uri.toString());
        }
        catch (error) {
            logService.error('Failed to save image output', error);
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
    async run(accessor, outputContext) {
        const editorService = accessor.get(IEditorService);
        const openerService = accessor.get(IOpenerService);
        const notebookEditor = getNotebookEditorFromContext(editorService, outputContext);
        if (!notebookEditor) {
            return;
        }
        const outputViewModel = getOutputViewModelFromContext(outputContext, notebookEditor);
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
        const outputURI = CellUri.generateOutputEditorUri(notebookEditor.textModel.uri, cellViewModel.id, cellIndex, outputViewModel.model.outputId, outputIndex);
        openerService.open(outputURI, { openToSide: true });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbE91dHB1dEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvY2VsbE91dHB1dEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQWdDLHlCQUF5QixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLHlCQUF5QixFQUFFLDZCQUE2QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDakosT0FBTyxLQUFLLEtBQUssTUFBTSxxQkFBcUIsQ0FBQztBQUM3QyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQXlELCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDL0gsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVuRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDekcsT0FBTyxFQUFFLGtC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