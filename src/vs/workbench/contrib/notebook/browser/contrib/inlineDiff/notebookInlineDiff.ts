/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { CellDiffInfo, computeDiff } from '../../diff/notebookDiffViewModel.js';
import { INotebookEditorContribution, INotebookEditor } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookCellDiffDecorator } from './notebookCellDiffDecorator.js';
import { NotebookDeletedCellDecorator } from './notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from './notebookInsertedCellDecorator.js';

export class NotebookInlineDiffDecorationContribution extends Disposable implements INotebookEditorContribution {
	static ID: string = 'workbench.notebook.inlineDiffDecoration';

	private original?: NotebookTextModel;
	private insertedCellDecorator: NotebookInsertedCellDecorator;
	private deletedCellDecorator: NotebookDeletedCellDecorator;
	private readonly cellDecorators = new Map<NotebookCellTextModel, NotebookCellDiffDecorator>();

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.insertedCellDecorator = this._register(this.instantiationService.createInstance(NotebookInsertedCellDecorator, notebookEditor));
		this.deletedCellDecorator = this._register(this.instantiationService.createInstance(NotebookDeletedCellDecorator, notebookEditor));

		this._update();
		this._register(this.notebookEditor.onDidChangeModel(() => this._update()));
		this._register(this.notebookEditor.onDidChangeVisibleRanges(() => this._update()));
	}

	async compareWith(original: NotebookTextModel): Promise<IDisposable> {
		this.original = original;
		await this._update();

		return toDisposable(() => {
			this.insertedCellDecorator.clear();
			this.deletedCellDecorator.clear();
			this.original = undefined;
		});
	}

	private async _update() {
		const current = this.notebookEditor.getViewModel()?.notebookDocument;
		if (!this.original || !current) {
			return;
		}

		const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.uri, current.uri);
		const diffInfo = computeDiff(this.original, current, notebookDiff);

		this.insertedCellDecorator.apply(diffInfo.cellDiffInfo);
		this.deletedCellDecorator.apply(diffInfo.cellDiffInfo, this.original);

		await this.updateCells(this.original, current, diffInfo.cellDiffInfo);
	}

	private async updateCells(original: NotebookTextModel, modified: NotebookTextModel, cellDiffs: CellDiffInfo[]) {
		const validDiffDecorators = new Set<NotebookCellDiffDecorator>();
		cellDiffs.forEach((diff) => {
			if (diff.type === 'modified') {
				const modifiedCell = modified.cells[diff.modifiedCellIndex];
				const originalCell = original.cells[diff.originalCellIndex];
				const editor = this.notebookEditor.codeEditors.find(([vm,]) => vm.handle === modifiedCell.handle)?.[1];

				if (editor) {
					const currentDecorator = this.cellDecorators.get(modifiedCell);
					if ((currentDecorator?.modifiedCell !== modifiedCell || currentDecorator?.originalCell !== originalCell)) {
						currentDecorator?.dispose();
						const decorator = this.instantiationService.createInstance(NotebookCellDiffDecorator, this.notebookEditor, modifiedCell, originalCell);
						this.cellDecorators.set(modifiedCell, decorator);
						validDiffDecorators.add(decorator);
						this._register(editor.onDidDispose(() => {
							decorator.dispose();
							if (this.cellDecorators.get(modifiedCell) === decorator) {
								this.cellDecorators.delete(modifiedCell);
							}
						}));
					} else if (currentDecorator) {
						validDiffDecorators.add(currentDecorator);
					}
				}
			}
		});

		// Dispose old decorators
		this.cellDecorators.forEach((v, cell) => {
			if (!validDiffDecorators.has(v)) {
				v.dispose();
				this.cellDecorators.delete(cell);
			}
		});
	}
}

registerNotebookContribution(NotebookInlineDiffDecorationContribution.ID, NotebookInlineDiffDecorationContribution);
