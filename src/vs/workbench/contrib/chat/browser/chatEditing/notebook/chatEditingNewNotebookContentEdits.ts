/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, ICellEditOperation } from '../../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';


/**
 * When asking LLM to generate a new notebook, LLM might end up generating the notebook
 * using the raw file format.
 * E.g. assume we ask LLM to generate a new Github Issues notebook, LLM might end up
 * genrating the notebook using the JSON format of github issues file.
 * Such a format is not known to copilot extension and those are sent over as regular
 * text edits for the Notebook URI.
 *
 * In such cases we should accumulate all of the edits, generate the content and deserialize the content
 * into a notebook, then generate notebooke edits to insert these cells.
 */
export class ChatEditingNewNotebookContentEdits {
	private readonly textEdits: TextEdit[] = [];
	constructor(
		private readonly notebook: NotebookTextModel,
		@INotebookService private readonly _notebookService: INotebookService,
	) {
	}

	acceptTextEdits(edits: TextEdit[]): void {
		if (edits.length) {
			this.textEdits.push(...edits);
		}
	}

	async generateEdits(): Promise<ICellEditOperation[]> {
		if (this.notebook.cells.length) {
			console.error(`Notebook edits not generated as notebook already has cells`);
			return [];
		}
		const content = this.generateContent();
		if (!content) {
			return [];
		}

		const notebookEdits: ICellEditOperation[] = [];
		try {
			const { serializer } = await this._notebookService.withNotebookDataProvider(this.notebook.viewType);
			const data = await serializer.dataToNotebook(VSBuffer.fromString(content));
			for (let i = 0; i < data.cells.length; i++) {
				notebookEdits.push({
					editType: CellEditType.Replace,
					index: i,
					count: 0,
					cells: [data.cells[i]]
				});
			}
		} catch (ex) {
			console.error(`Failed to generate notebook edits from text edits ${content}`, ex);
			return [];
		}

		return notebookEdits;
	}

	private generateContent() {
		try {
			return applyTextEdits(this.textEdits);
		} catch (ex) {
			console.error('Failed to generate content from text edits', ex);
			return '';
		}
	}
}

function applyTextEdits(edits: TextEdit[]): string {
	let output = '';
	for (const edit of edits) {
		output = output.slice(0, edit.range.startColumn)
			+ edit.text
			+ output.slice(edit.range.endColumn);
	}
	return output;
}
