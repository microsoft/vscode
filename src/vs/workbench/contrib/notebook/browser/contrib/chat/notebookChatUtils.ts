/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { normalizeDriveLetter } from '../../../../../../base/common/labels.js';
import { basenameOrAuthority } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { INotebookOutputVariableEntry } from '../../../../chat/common/chatModel.js';
import { CellUri } from '../../../common/notebookCommon.js';
import { ICellOutputViewModel, INotebookEditor } from '../../notebookBrowser.js';

export const NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST = [
	'text/plain',
	'text/html',
	'application/vnd.code.notebook.error',
	'application/vnd.code.notebook.stdout',
	'application/x.notebook.stdout',
	'application/x.notebook.stream',
	'application/vnd.code.notebook.stderr',
	'application/x.notebook.stderr',
	'image/png',
	'image/jpeg',
	'image/svg',
];

export function createNotebookOutputVariableEntry(outputViewModel: ICellOutputViewModel, mimeType: string, notebookEditor: INotebookEditor): INotebookOutputVariableEntry | undefined {

	// get the cell index
	const cellFromViewModelHandle = outputViewModel.cellViewModel.handle;
	const notebookModel = notebookEditor.textModel;
	const cell = notebookEditor.getCellByHandle(cellFromViewModelHandle);
	if (!cell || cell.outputsViewModels.length === 0 || !notebookModel) {
		return;
	}
	// uri of the cell
	const notebookUri = notebookModel.uri;
	const cellUri = cell.uri;
	const cellIndex = notebookModel.cells.indexOf(cell.model);

	// get the output index
	const outputId = outputViewModel?.model.outputId;
	let outputIndex: number = 0;
	if (outputId !== undefined) {
		// find the output index
		outputIndex = cell.outputsViewModels.findIndex(output => {
			return output.model.outputId === outputId;
		});
	}

	// construct the URI using the cell uri and output index
	const outputCellUri = CellUri.generateCellOutputUriWithIndex(notebookUri, cellUri, outputIndex);
	const fileName = normalizeDriveLetter(basenameOrAuthority(notebookUri));

	const l: INotebookOutputVariableEntry = {
		value: outputCellUri,
		id: outputCellUri.toString(),
		name: localize('notebookOutputCellLabel', "{0} • Cell {1} • Output {2}", fileName, `${cellIndex + 1}`, `${outputIndex + 1}`),
		icon: mimeType === 'application/vnd.code.notebook.error' ? ThemeIcon.fromId('error') : undefined,
		kind: 'notebookOutput',
		outputIndex,
		mimeType
	};

	return l;
}
