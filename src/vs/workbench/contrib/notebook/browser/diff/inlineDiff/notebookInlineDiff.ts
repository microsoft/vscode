/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { CellDiffInfo, computeDiff } from '../notebookDiffViewModel.js';
import { INotebookEditorContribution, INotebookEditor } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookCellDiffDecorator } from './notebookCellDiffDecorator.js';
import { NotebookDeletedCellDecorator } from './notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from './notebookInsertedCellDecorator.js';

export class NotebookInlineDiffDecorationContribution extends Disposable implements INotebookEditorContribution {
	static ID: string = 'workbench.notebook.inlineDiffDecoration';

	private original?: NotebookTextModel;
	private insertedCellDecorator: NotebookInsertedCellDecorator | undefined;
	private deletedCellDecorator: NotebookDeletedCellDecorator | undefined;
	private readonly cellDecorators = new Map<NotebookCellTextModel, NotebookCellDiffDecorator>();
	private cachedNotebookDiff?: { cellDiffInfo: CellDiffInfo[]; originalVersion: number; version: number };
	private listeners: IDisposable[] = [];

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this._register(autorun((reader) => {

			const previous = this.notebookEditor.notebookOptions.previousModelToCompare.read(reader);
			if (previous && this.notebookEditor.hasModel()) {
				this.initialize(previous);
				this.listeners.push(Event.once(this.notebookEditor.onDidAttachViewModel)(() => this.initialize(previous)));
			}
		}));
	}

	private clear() {
		this.listeners.forEach(l => l.dispose());
		this.cellDecorators.forEach((v, cell) => {
			v.dispose();
			this.cellDecorators.delete(cell);
		});
		this.insertedCellDecorator?.dispose();
		this.deletedCellDecorator?.dispose();
		this.cachedNotebookDiff = undefined;
		this.listeners = [];
	}

	override dispose() {
		this.clear();
		super.dispose();
	}

	private initialize(previous: NotebookTextModel) {
		this.clear();

		this.original = previous;
		this.insertedCellDecorator = this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor);
		this.deletedCellDecorator = this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor);

		this._update();
		const onVisibleChange = Event.debounce(this.notebookEditor.onDidChangeVisibleRanges, (e) => e, 100, undefined, undefined, undefined, this._store);
		this.listeners.push(onVisibleChange(() => this._update()));
		this.listeners.push(this.notebookEditor.onDidChangeModel(() => this._update()));
		if (this.notebookEditor.textModel) {
			const onContentChange = Event.debounce(this.notebookEditor.textModel!.onDidChangeContent, (_, event) => event, 100, undefined, undefined, undefined, this._store);
			this.listeners.push(onContentChange(() => this._update()));
		}
	}

	private async _update() {
		const current = this.notebookEditor.getViewModel()?.notebookDocument;
		if (!this.original || !current) {
			return;
		}

		if (!this.cachedNotebookDiff ||
			this.cachedNotebookDiff.originalVersion !== this.original.versionId ||
			this.cachedNotebookDiff.version !== current.versionId) {

			const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.uri, current.uri);
			const diffInfo = computeDiff(this.original, current, notebookDiff);

			this.cachedNotebookDiff = { cellDiffInfo: diffInfo.cellDiffInfo, originalVersion: this.original.versionId, version: current.versionId };

			this.insertedCellDecorator?.apply(diffInfo.cellDiffInfo);
			this.deletedCellDecorator?.apply(diffInfo.cellDiffInfo, this.original);
		}

		await this.updateCells(this.original, current, this.cachedNotebookDiff.cellDiffInfo);
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
						const decorator = this.instantiationService.createInstance(NotebookCellDiffDecorator, this.notebookEditor, modifiedCell, originalCell, editor);
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
