/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { computeDiff } from '../../diff/notebookDiffViewModel.js';
import { INotebookEditorContribution, INotebookEditor } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookDeletedCellDecorator } from './notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from './notebookInsertedCellDecorator.js';

export class NotebookInlineDiffDecorationContribution extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.inlineDiffDecoration';

	private original?: NotebookTextModel;
	private insertedCellDecorator: NotebookInsertedCellDecorator;
	private deletedCellDecorator: NotebookDeletedCellDecorator;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this.insertedCellDecorator = this._register(instantiationService.createInstance(NotebookInsertedCellDecorator, _notebookEditor));
		this.deletedCellDecorator = this._register(instantiationService.createInstance(NotebookDeletedCellDecorator, _notebookEditor));

		this._update();
		this._register(this._notebookEditor.onDidChangeModel(() => this._update()));
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
		const current = this._notebookEditor.getViewModel()?.notebookDocument;
		if (!this.original || !current) {
			return;
		}

		const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.uri, current.uri);
		const diffInfo = computeDiff(this.original, current, notebookDiff);

		this.insertedCellDecorator.apply(diffInfo.cellDiffInfo);
		this.deletedCellDecorator.apply(diffInfo.cellDiffInfo, this.original);
	}
}

registerNotebookContribution(NotebookInlineDiffDecorationContribution.id, NotebookInlineDiffDecorationContribution);
