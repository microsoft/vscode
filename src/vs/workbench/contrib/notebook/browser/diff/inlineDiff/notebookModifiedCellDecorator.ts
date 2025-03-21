/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { INotebookEditor, NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { overviewRulerModifiedForeground } from '../../../../scm/common/quickDiff.js';
import { diffInfoWithHandle } from './notebookInsertedCellDecorator.js';

export class NotebookModifiedCellDecorator extends Disposable {
	private readonly decorators = this._register(new DisposableStore());
	constructor(
		private readonly notebookEditor: INotebookEditor,
	) {
		super();
	}

	public apply(diffInfo: diffInfoWithHandle[]) {
		const model = this.notebookEditor.textModel;
		if (!model) {
			return;
		}

		const modifiedCells: NotebookCellTextModel[] = [];
		for (const diff of diffInfo) {
			if (diff.type === 'modified') {
				const cell = diff.modifiedHandle ?
					model.cells.find(c => c.handle === diff.modifiedHandle) :
					model.cells[diff.modifiedCellIndex];
				if (cell) {
					modifiedCells.push(cell);
				}
			}
		}

		const ids = this.notebookEditor.deltaCellDecorations([], modifiedCells.map(cell => ({
			handle: cell.handle,
			options: {
				overviewRuler: {
					color: overviewRulerModifiedForeground,
					modelRanges: [],
					includeOutput: true,
					position: NotebookOverviewRulerLane.Full
				}
			}
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
