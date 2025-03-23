/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { CellDiffInfo } from '../notebookDiffViewModel.js';
import { INotebookEditor, NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import { overviewRulerAddedForeground } from '../../../../scm/common/quickDiff.js';

export class NotebookInsertedCellDecorator extends Disposable {
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
		const cells = diffInfo.filter(diff => diff.type === 'insert').map((diff) => model.cells[diff.modifiedCellIndex]);
		const ids = this.notebookEditor.deltaCellDecorations([], cells.map(cell => ({
			handle: cell.handle,
			options: {
				className: 'nb-insertHighlight', outputClassName: 'nb-insertHighlight', overviewRuler: {
					color: overviewRulerAddedForeground,
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
