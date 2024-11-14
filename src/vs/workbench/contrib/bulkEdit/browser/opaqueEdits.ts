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
import { IChatRequestVariableEntry } from '../../chat/common/chatModel.js';
import { ChatInputPart } from '../../chat/browser/chatInputPart.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';

export class ResourceAttachmentEdit extends ResourceEdit implements IAttachmentEdit {

	static is(candidate: any): candidate is IAttachmentEdit {
		if (candidate instanceof ResourceAttachmentEdit) {
			return true;
		} else {
			return isObject(candidate)
				&& (Boolean((<IAttachmentEdit>candidate).undo && (<IAttachmentEdit>candidate).redo));
		}
	}

	static lift(edit: IAttachmentEdit): ResourceAttachmentEdit {
		if (edit instanceof ResourceAttachmentEdit) {
			return edit;
		} else {
			return new ResourceAttachmentEdit(edit.resource, edit.variable, edit.undo, edit.redo, edit.metadata);
		}
	}

	constructor(
		readonly resource: URI,
		readonly variable: IChatRequestVariableEntry,
		readonly undo: () => Promise<void> | void,
		readonly redo: () => Promise<void> | void,
		metadata?: WorkspaceEditMetadata
	) {
		super(metadata);
	}
}

export interface IAttachmentEdit extends ICustomEdit {
	readonly resource: URI;
	readonly metadata?: WorkspaceEditMetadata;
	readonly variable: IChatRequestVariableEntry;
	undo(): Promise<void> | void;
	redo(): Promise<void> | void;
}

export class OpaqueEdits {

	constructor(
		private readonly _undoRedoGroup: UndoRedoGroup,
		private readonly undoRedoSource: UndoRedoSource | undefined,
		private readonly _progress: IProgress<void>,
		private readonly _token: CancellationToken,
		private readonly _edits: ResourceAttachmentEdit[],
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
	) {
		this._edits = this._edits.map(e => {
			if (e.resource.scheme === ChatInputPart.INPUT_SCHEME) {
				return new ResourceAttachmentEdit(e.resource, e.variable, e.undo, e.redo);
			} else {
				return e;
			}
		});
	}

	async apply(): Promise<readonly URI[]> {
		const resources: URI[] = [];

		for (const edit of this._edits) {
			if (this._token.isCancellationRequested) {
				break;
			}

			const widget = this._chatWidgetService.getWidgetByInputUri(edit.resource);
			widget?.attachmentModel.addContext(edit.variable);

			this._undoRedoService.pushElement({
				type: UndoRedoElementType.Resource,
				resource: edit.resource,
				label: edit.metadata?.label || 'Custom Edit',
				code: 'paste',
				undo: edit.undo,
				redo: edit.redo,
			}, this._undoRedoGroup, this.undoRedoSource);

			this._progress.report(undefined);
			resources.push(edit.resource);
		}

		return resources;
	}
}
