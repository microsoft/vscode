/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ResourceEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { ICustomEdit, WorkspaceEditMetadata } from '../../../../editor/common/languages.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IUndoRedoService, UndoRedoElementType, UndoRedoGroup, UndoRedoSource } from '../../../../platform/undoRedo/common/undoRedo.js';

export class ResourceAttachmentEdit extends ResourceEdit implements ICustomEdit {

	static is(candidate: any): candidate is ICustomEdit {
		if (candidate instanceof ResourceAttachmentEdit) {
			return true;
		} else {
			return isObject(candidate)
				&& (Boolean((<ICustomEdit>candidate).undo && (<ICustomEdit>candidate).redo));
		}
	}

	static lift(edit: ICustomEdit): ResourceAttachmentEdit {
		if (edit instanceof ResourceAttachmentEdit) {
			return edit;
		} else {
			return new ResourceAttachmentEdit(edit.resource, edit.undo, edit.redo, edit.metadata);
		}
	}

	constructor(
		readonly resource: URI,
		readonly undo: () => Promise<void> | void,
		readonly redo: () => Promise<void> | void,
		metadata?: WorkspaceEditMetadata
	) {
		super(metadata);
	}
}

export class OpaqueEdits {

	constructor(
		private readonly _undoRedoGroup: UndoRedoGroup,
		private readonly _undoRedoSource: UndoRedoSource | undefined,
		private readonly _progress: IProgress<void>,
		private readonly _token: CancellationToken,
		private readonly _edits: ResourceAttachmentEdit[],
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
	) { }

	async apply(): Promise<readonly URI[]> {
		const resources: URI[] = [];

		for (const edit of this._edits) {
			if (this._token.isCancellationRequested) {
				break;
			}

			await edit.redo();

			this._undoRedoService.pushElement({
				type: UndoRedoElementType.Resource,
				resource: edit.resource,
				label: edit.metadata?.label || 'Custom Edit',
				code: 'paste',
				undo: edit.undo,
				redo: edit.redo,
			}, this._undoRedoGroup, this._undoRedoSource);

			this._progress.report(undefined);
			resources.push(edit.resource);
		}

		return resources;
	}
}
