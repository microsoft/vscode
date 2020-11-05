/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { INotebookEditorContribution, INotebookEditor } from '../../notebookBrowser';
import { registerNotebookContribution } from '../../notebookEditorExtensions';
import { ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { createProviderComparer } from 'vs/workbench/contrib/scm/browser/dirtydiffDecorator';
import { first, ThrottledDelayer } from 'vs/base/common/async';
import { INotebookService } from '../../../common/notebookService';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';

export class SCMController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.findController';
	private _lastDecorationId: string[] = [];
	private _localDisposable = new DisposableStore();
	private _originalDocument: NotebookTextModel | undefined = undefined;
	private _originalResourceDisposableStore = new DisposableStore();
	private _diffDelayer = new ThrottledDelayer<void>(200);

	private _lastVersion = -1;


	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IFileService private readonly _fileService: FileService,
		@ISCMService private readonly _scmService: ISCMService,
		@INotebookService private readonly _notebookService: INotebookService

	) {
		super();

		if (!this._notebookEditor.isEmbedded) {
			this._register(this._notebookEditor.onDidChangeModel(() => {
				this._localDisposable.clear();
				this._originalResourceDisposableStore.clear();
				this._diffDelayer.cancel();
				this.update();

				if (this._notebookEditor.textModel) {
					this._localDisposable.add(this._notebookEditor.textModel.onDidChangeContent((e) => {
						this.update();
					}));
				}
			}));

			this._register(this._notebookEditor.onWillDispose(() => {
				this._localDisposable.clear();
				this._originalResourceDisposableStore.clear();
			}));

			this.update();
		}
	}

	private async _resolveNotebookDocument(uri: URI, viewType: string) {
		const providers = this._scmService.repositories.map(r => r.provider);
		const rootedProviders = providers.filter(p => !!p.rootUri);

		rootedProviders.sort(createProviderComparer(uri));

		const result = await first(rootedProviders.map(p => () => p.getOriginalResource(uri)));

		if (!result) {
			this._originalDocument = undefined;
			this._originalResourceDisposableStore.clear();
			return;
		}

		if (result.toString() === this._originalDocument?.uri.toString()) {
			// original document not changed
			return;
		}

		this._originalResourceDisposableStore.add(this._fileService.watch(result));
		this._originalResourceDisposableStore.add(this._fileService.onDidFilesChange(e => {
			if (e.contains(result)) {
				this._originalDocument = undefined;
				this._originalResourceDisposableStore.clear();
				this.update();
			}
		}));

		const originalDocument = await this._notebookService.resolveNotebook(viewType, result, false);
		this._originalResourceDisposableStore.add({
			dispose: () => {
				this._originalDocument?.dispose();
				this._originalDocument = undefined;
			}
		});

		this._originalDocument = originalDocument;
	}

	async update() {
		if (!this._diffDelayer) {
			return;
		}

		await this._diffDelayer
			.trigger(async () => {
				const modifiedDocument = this._notebookEditor.textModel;
				if (!modifiedDocument) {
					return;
				}

				if (this._lastVersion >= modifiedDocument.versionId) {
					return;
				}

				this._lastVersion = modifiedDocument.versionId;
				await this._resolveNotebookDocument(modifiedDocument.uri, modifiedDocument.viewType);

				if (!this._originalDocument) {
					this._clear();
					return;
				}

				// const diff = new LcsDiff(new CellSequence(this._originalDocument), new CellSequence(modifiedDocument));
				// const diffResult = diff.ComputeDiff(false);

				// const decorations: INotebookDeltaDecoration[] = [];
				// diffResult.changes.forEach(change => {
				// 	if (change.originalLength === 0) {
				// 		// doesn't exist in original
				// 		for (let i = 0; i < change.modifiedLength; i++) {
				// 			decorations.push({
				// 				handle: modifiedDocument.cells[change.modifiedStart + i].handle,
				// 				options: { gutterClassName: 'nb-gutter-cell-inserted' }
				// 			});
				// 		}
				// 	} else {
				// 		if (change.modifiedLength === 0) {
				// 			// diff.deleteCount
				// 			// removed from original
				// 		} else {
				// 			// modification
				// 			for (let i = 0; i < change.modifiedLength; i++) {
				// 				decorations.push({
				// 					handle: modifiedDocument.cells[change.modifiedStart + i].handle,
				// 					options: { gutterClassName: 'nb-gutter-cell-changed' }
				// 				});
				// 			}
				// 		}
				// 	}
				// });


				// this._lastDecorationId = this._notebookEditor.deltaCellDecorations(this._lastDecorationId, decorations);
			});
	}

	private _clear() {
		this._lastDecorationId = this._notebookEditor.deltaCellDecorations(this._lastDecorationId, []);
	}
}

registerNotebookContribution(SCMController.id, SCMController);
