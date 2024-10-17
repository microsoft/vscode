/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { CellEditState, IInsetRenderOutput, INotebookEditor, INotebookEditorContribution, INotebookEditorDelegate, RenderOutputType } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CodeCellViewModel, outputDisplayLimit } from '../../viewModel/codeCellViewModel.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { cellRangesToIndexes } from '../../../common/notebookRange.js';
import { INotebookService } from '../../../common/notebookService.js';

class NotebookViewportContribution extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.viewportWarmup';
	private readonly _warmupViewport: RunOnceScheduler;
	private readonly _warmupDocument: RunOnceScheduler | null = null;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookService private readonly _notebookService: INotebookService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();

		this._warmupViewport = new RunOnceScheduler(() => this._warmupViewportNow(), 200);
		this._register(this._warmupViewport);
		this._register(this._notebookEditor.onDidScroll(() => {
			this._warmupViewport.schedule();
		}));

		this._warmupDocument = new RunOnceScheduler(() => this._warmupDocumentNow(), 200);
		this._register(this._warmupDocument);
		this._register(this._notebookEditor.onDidAttachViewModel(() => {
			if (this._notebookEditor.hasModel()) {
				this._warmupDocument?.schedule();
			}
		}));

		if (this._notebookEditor.hasModel()) {
			this._warmupDocument?.schedule();
		}
	}

	private _warmupDocumentNow() {
		if (this._notebookEditor.hasModel()) {
			for (let i = 0; i < this._notebookEditor.getLength(); i++) {
				const cell = this._notebookEditor.cellAt(i);

				if (cell?.cellKind === CellKind.Markup && cell?.getEditState() === CellEditState.Preview && !cell.isInputCollapsed) {
					// TODO@rebornix currently we disable markdown cell rendering in webview for accessibility
					// this._notebookEditor.createMarkupPreview(cell);
				} else if (cell?.cellKind === CellKind.Code) {
					this._warmupCodeCell((cell as CodeCellViewModel));
				}
			}
		}
	}

	private _warmupViewportNow() {
		if (this._notebookEditor.isDisposed) {
			return;
		}

		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const visibleRanges = this._notebookEditor.getVisibleRangesPlusViewportAboveAndBelow();
		cellRangesToIndexes(visibleRanges).forEach(index => {
			const cell = this._notebookEditor.cellAt(index);

			if (cell?.cellKind === CellKind.Markup && cell?.getEditState() === CellEditState.Preview && !cell.isInputCollapsed) {
				(this._notebookEditor as INotebookEditorDelegate).createMarkupPreview(cell);
			} else if (cell?.cellKind === CellKind.Code) {
				this._warmupCodeCell((cell as CodeCellViewModel));
			}
		});
	}

	private _warmupCodeCell(viewCell: CodeCellViewModel) {
		if (viewCell.isOutputCollapsed) {
			return;
		}

		const outputs = viewCell.outputsViewModels;
		for (const output of outputs.slice(0, outputDisplayLimit)) {
			const [mimeTypes, pick] = output.resolveMimeTypes(this._notebookEditor.textModel!, undefined);
			if (!mimeTypes.find(mimeType => mimeType.isTrusted) || mimeTypes.length === 0) {
				continue;
			}

			const pickedMimeTypeRenderer = mimeTypes[pick];

			if (!pickedMimeTypeRenderer) {
				return;
			}

			if (!this._notebookEditor.hasModel()) {
				return;
			}

			const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);

			if (!renderer) {
				return;
			}

			const result: IInsetRenderOutput = { type: RenderOutputType.Extension, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
			this._notebookEditor.createOutput(viewCell, result, 0, true);
		}

	}
}

registerNotebookContribution(NotebookViewportContribution.id, NotebookViewportContribution);
