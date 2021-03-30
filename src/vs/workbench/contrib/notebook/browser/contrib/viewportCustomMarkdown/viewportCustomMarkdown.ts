/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { CellEditState, INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { CellKind, cellRangesToIndexes } from 'vs/workbench/contrib/notebook/common/notebookCommon';

class NotebookClipboardContribution extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.viewportCustomMarkdown';
	private readonly _warmupViewport: RunOnceScheduler;

	constructor(private readonly _notebookEditor: INotebookEditor) {
		super();

		this._warmupViewport = new RunOnceScheduler(() => this._warmupViewportNow(), 200);

		this._register(this._notebookEditor.onDidScroll(() => {
			this._warmupViewport.schedule();
		}));
	}

	private _warmupViewportNow() {
		const visibleRanges = this._notebookEditor.getVisibleRangesPlusViewportAboveBelow();
		cellRangesToIndexes(visibleRanges).forEach(index => {
			const cell = this._notebookEditor.viewModel?.viewCells[index];

			if (cell?.cellKind === CellKind.Markdown && cell?.editState === CellEditState.Preview) {
				this._notebookEditor.createMarkdownPreview(cell);
			}
		});
	}
}

registerNotebookContribution(NotebookClipboardContribution.id, NotebookClipboardContribution);
