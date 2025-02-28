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
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';

export class NotebookInlineDiffDecorationContribution extends Disposable implements INotebookEditorContribution {
	static ID: string = 'workbench.notebook.inlineDiffDecoration';

	private previous?: NotebookTextModel;
	private insertedCellDecorator: NotebookInsertedCellDecorator | undefined;
	private deletedCellDecorator: NotebookDeletedCellDecorator | undefined;
	private readonly cellDecorators = new Map<NotebookCellTextModel, NotebookCellDiffDecorator>();
	private cachedNotebookDiff?: { cellDiffInfo: CellDiffInfo[]; originalVersion: number; version: number };
	private listeners: IDisposable[] = [];

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookLoggingService private readonly logService: INotebookLoggingService
	) {
		super();
		this.logService.debug('inlineDiff', 'Watching for previous model');

		this._register(autorun((reader) => {
			this.previous = this.notebookEditor.notebookOptions.previousModelToCompare.read(reader);
			if (this.previous) {
				this.logService.debug('inlineDiff', 'Previous model set');
				if (this.notebookEditor.hasModel()) {
					this.initialize();
				} else {
					this.logService.debug('inlineDiff', 'Waiting for model to attach');
					this.listeners.push(Event.once(this.notebookEditor.onDidAttachViewModel)(() => this.initialize()));
				}
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
		this.logService.debug('inlineDiff', 'Cleared decorations and listeners');
	}

	override dispose() {
		this.logService.debug('inlineDiff', 'Disposing');
		this.clear();
		super.dispose();
	}

	private initialize() {
		this.clear();

		if (!this.previous) {
			return;
		}

		this.insertedCellDecorator = this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor);
		this.deletedCellDecorator = this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, undefined);

		this._update();
		const onVisibleChange = Event.debounce(this.notebookEditor.onDidChangeVisibleRanges, (e) => e, 100, undefined, undefined, undefined, this._store);
		this.listeners.push(onVisibleChange(() => this._update()));
		this.listeners.push(this.notebookEditor.onDidChangeModel(() => this._update()));
		if (this.notebookEditor.textModel) {
			const onContentChange = Event.debounce(this.notebookEditor.textModel!.onDidChangeContent, (_, event) => event, 100, undefined, undefined, undefined, this._store);
			const onOriginalContentChange = Event.debounce(this.previous.onDidChangeContent, (_, event) => event, 100, undefined, undefined, undefined, this._store);
			this.listeners.push(onContentChange(() => this._update()));
			this.listeners.push(onOriginalContentChange(() => this._update()));
		}
		this.logService.debug('inlineDiff', 'Initialized');
	}

	private async _update() {
		const current = this.notebookEditor.getViewModel()?.notebookDocument;
		if (!this.previous || !current) {
			this.logService.debug('inlineDiff', 'Update skipped - no original or current document');
			return;
		}

		if (!this.cachedNotebookDiff ||
			this.cachedNotebookDiff.originalVersion !== this.previous.versionId ||
			this.cachedNotebookDiff.version !== current.versionId) {

			let diffInfo: { cellDiffInfo: CellDiffInfo[] } = { cellDiffInfo: [] };
			try {
				const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.previous.uri, current.uri);
				diffInfo = computeDiff(this.previous, current, notebookDiff);
			} catch (e) {
				this.logService.error('inlineDiff', 'Error computing diff:\n' + e);
				return;
			}

			this.cachedNotebookDiff = { cellDiffInfo: diffInfo.cellDiffInfo, originalVersion: this.previous.versionId, version: current.versionId };

			this.insertedCellDecorator?.apply(diffInfo.cellDiffInfo);
			this.deletedCellDecorator?.apply(diffInfo.cellDiffInfo, this.previous);
		}

		await this.updateCells(this.previous, current, this.cachedNotebookDiff.cellDiffInfo);
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
