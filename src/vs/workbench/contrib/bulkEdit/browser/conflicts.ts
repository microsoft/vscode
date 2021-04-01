/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceMap } from 'vs/base/common/map';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ITextModel } from 'vs/editor/common/model';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { ILogService } from 'vs/platform/log/common/log';

export class ConflictDetector {

	private readonly _conflicts = new ResourceMap<boolean>();
	private readonly _disposables = new DisposableStore();

	private readonly _onDidConflict = new Emitter<this>();
	readonly onDidConflict: Event<this> = this._onDidConflict.event;

	constructor(
		edits: ResourceEdit[],
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@ILogService logService: ILogService,
	) {

		const _workspaceEditResources = new ResourceMap<boolean>();

		for (let edit of edits) {
			if (edit instanceof ResourceTextEdit) {
				_workspaceEditResources.set(edit.resource, true);
				if (typeof edit.versionId === 'number') {
					const model = modelService.getModel(edit.resource);
					if (model && model.getVersionId() !== edit.versionId) {
						this._conflicts.set(edit.resource, true);
						this._onDidConflict.fire(this);
					}
				}

			} else if (edit instanceof ResourceFileEdit) {
				if (edit.newResource) {
					_workspaceEditResources.set(edit.newResource, true);

				} else if (edit.oldResource) {
					_workspaceEditResources.set(edit.oldResource, true);
				}
			} else if (edit instanceof ResourceNotebookCellEdit) {
				_workspaceEditResources.set(edit.resource, true);

			} else {
				logService.warn('UNKNOWN edit type', edit);
			}
		}

		// listen to file changes
		this._disposables.add(fileService.onDidFilesChange(e => {

			for (const uri of _workspaceEditResources.keys()) {
				// conflict happens when a file that we are working
				// on changes on disk. ignore changes for which a model
				// exists because we have a better check for models
				if (!modelService.getModel(uri) && e.contains(uri)) {
					this._conflicts.set(uri, true);
					this._onDidConflict.fire(this);
					break;
				}
			}
		}));

		// listen to model changes...?
		const onDidChangeModel = (model: ITextModel) => {

			// conflict
			if (_workspaceEditResources.has(model.uri)) {
				this._conflicts.set(model.uri, true);
				this._onDidConflict.fire(this);
			}
		};
		for (let model of modelService.getModels()) {
			this._disposables.add(model.onDidChangeContent(() => onDidChangeModel(model)));
		}
	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidConflict.dispose();
	}

	list(): URI[] {
		return [...this._conflicts.keys()];
	}

	hasConflicts(): boolean {
		return this._conflicts.size > 0;
	}
}
