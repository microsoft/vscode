/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { WorkspaceEdit, WorkspaceTextEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceMap } from 'vs/base/common/map';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import type { ITextModel } from 'vs/editor/common/model';

export abstract class Recording {

	static start(fileService: IFileService): Recording {

		let _changes = new Set<string>();
		let subscription = fileService.onAfterOperation(e => {
			_changes.add(e.resource.toString());
		});

		return {
			stop() { return subscription.dispose(); },
			hasChanged(resource) { return _changes.has(resource.toString()); }
		};
	}

	abstract stop(): void;
	abstract hasChanged(resource: URI): boolean;
}

export class ConflictDetector {

	private readonly _conflicts = new ResourceMap<boolean>();
	private readonly _changes = new ResourceMap<boolean>();
	private readonly _disposables = new DisposableStore();

	private readonly _onDidConflict = new Emitter<this>();
	readonly onDidConflict: Event<this> = this._onDidConflict.event;

	constructor(
		workspaceEdit: WorkspaceEdit,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
	) {

		const _workspaceEditResources = new ResourceMap<boolean>();

		for (let edit of workspaceEdit.edits) {
			if (WorkspaceTextEdit.is(edit)) {

				_workspaceEditResources.set(edit.resource, true);

				if (typeof edit.modelVersionId === 'number') {
					const model = modelService.getModel(edit.resource);
					if (model && model.getVersionId() !== edit.modelVersionId) {
						this._conflicts.set(edit.resource, true);
						this._onDidConflict.fire(this);
					}
				}

			} else if (edit.newUri) {
				_workspaceEditResources.set(edit.newUri, true);

			} else if (edit.oldUri) {
				_workspaceEditResources.set(edit.oldUri, true);
			}
		}

		// listen to file changes
		this._disposables.add(fileService.onFileChanges(e => {
			for (let change of e.changes) {

				// change
				this._changes.set(change.resource, true);

				// conflict
				if (_workspaceEditResources.has(change.resource)) {
					this._conflicts.set(change.resource, true);
					this._onDidConflict.fire(this);
				}
			}
		}));


		// listen to model changes...?
		const onDidChangeModel = (model: ITextModel) => {
			// change
			this._changes.set(model.uri, true);

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
		const result: URI[] = this._conflicts.keys();
		this._changes.forEach((_value, key) => {
			if (!this._conflicts.has(key)) {
				result.push(key);
			}
		});
		return result;
	}
}
