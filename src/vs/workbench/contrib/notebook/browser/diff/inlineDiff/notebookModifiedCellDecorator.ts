/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { CellDiffInfo } from '../notebookDiffViewModel.js';
import { INotebookEditor } from '../../notebookBrowser.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';

export class NotebookModifiedCellDecorator extends Disposable {
	private readonly decorators = this._register(new DisposableStore());
	constructor(
		private readonly notebookEditor: INotebookEditor,
	) {
		super();
	}

	public apply(diffInfo: CellDiffInfo[]) {
		const model = this.notebookEditor.textModel;
		if (!model) {
			return;
		}

		const modifiedMarkdownCells: NotebookCellTextModel[] = [];
		for (const diff of diffInfo) {
			if (diff.type === 'modified') {
				const cell = model.cells[diff.modifiedCellIndex];
				if (cell.cellKind === CellKind.Markup) {
					modifiedMarkdownCells.push(cell);
				}
			}
		}

		const ids = this.notebookEditor.deltaCellDecorations([], modifiedMarkdownCells.map(cell => ({
			handle: cell.handle,
			options: { outputClassName: 'nb-insertHighlight' }
		})));

		this.clear();
		this.decorators.add(toDisposable(() => {
			if (!this.notebookEditor.isDisposed) {
				this.notebookEditor.deltaCellDecorations(ids, []);
			}
		}));
	}
	public clear() {
		this.decorators.clear();
	}
}
