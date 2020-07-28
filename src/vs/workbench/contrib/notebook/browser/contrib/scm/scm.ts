/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { INotebookEditorContribution, INotebookEditor, INotebookDeltaDecoration } from '../../notebookBrowser';
import { registerNotebookContribution } from '../../notebookEditorExtensions';
import { ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { createProviderComparer } from 'vs/workbench/contrib/scm/browser/dirtydiffDecorator';
import { first } from 'vs/base/common/async';
import { INotebookService } from '../../../common/notebookService';
import { LcsDiff } from 'vs/base/common/diff/diff';
import { CellSequence } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class SCMController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.findController';
	private _lastDecorationId: string[] = [];
	private _localDisposable = new DisposableStore();

	private _lastVersion = -1;


	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@ISCMService private readonly _scmService: ISCMService,
		@INotebookService private readonly _notebookService: INotebookService

	) {
		super();

		if (!this._notebookEditor.creationOptions.isEmbeded) {
			this._register(this._notebookEditor.onDidChangeModel(() => {
				this._localDisposable.clear();
				this.update();

				if (this._notebookEditor.textModel) {
					this._localDisposable.add(this._notebookEditor.textModel.onDidChangeContent(() => {
						this.update();
					}));

					this._localDisposable.add(this._notebookEditor.textModel.onDidChangeCells(() => {
						this.update();
					}));
				}
			}));

			this.update();
		}
	}

	async update() {

		const modifiedDocument = this._notebookEditor.textModel;
		if (!modifiedDocument) {
			return;
		}

		if (this._lastVersion >= modifiedDocument.versionId) {
			return;
		}

		this._lastVersion = modifiedDocument.versionId;

		const uri = modifiedDocument.uri;
		const providers = this._scmService.repositories.map(r => r.provider);
		const rootedProviders = providers.filter(p => !!p.rootUri);

		rootedProviders.sort(createProviderComparer(uri));

		const result = await first(rootedProviders.map(p => () => p.getOriginalResource(uri)));

		if (!result) {
			this._clear();
			return;
		}

		const originalDocument = await this._notebookService.resolveNotebook(modifiedDocument.viewType, result, false);

		if (!originalDocument) {
			this._clear();
			return;
		}

		const diff = new LcsDiff(new CellSequence(originalDocument), new CellSequence(modifiedDocument));
		const diffResult = diff.ComputeDiff(false);

		const decorations: INotebookDeltaDecoration[] = [];
		diffResult.changes.forEach(change => {
			if (change.originalLength === 0) {
				// doesn't exist in original
				for (let i = 0; i < change.modifiedLength; i++) {
					decorations.push({
						handle: modifiedDocument.cells[change.modifiedStart + i].handle,
						options: { gutterClassName: 'nb-gutter-cell-inserted' }
					});
				}
			} else {
				if (change.modifiedLength === 0) {
					// diff.deleteCount
					// removed from original
				} else {
					// modification
					for (let i = 0; i < change.modifiedLength; i++) {
						decorations.push({
							handle: modifiedDocument.cells[change.modifiedStart + i].handle,
							options: { gutterClassName: 'nb-gutter-cell-changed' }
						});
					}
				}
			}
		});


		this._lastDecorationId = this._notebookEditor.deltaCellDecorations(this._lastDecorationId, decorations);
	}

	private _clear() {
		this._lastDecorationId = this._notebookEditor.deltaCellDecorations(this._lastDecorationId, []);
	}
}

registerNotebookContribution(SCMController.id, SCMController);
