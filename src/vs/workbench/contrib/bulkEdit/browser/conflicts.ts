/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { ResourceNotebookCellEdit } from './bulkCellEdits.js';
import { ILogService } from '../../../../platform/log/common/log.js';

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

		for (const edit of edits) {
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
		for (const model of modelService.getModels()) {
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
