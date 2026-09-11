/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../common/editing/chatEditingService.js';
import { AbstractChatResponseFileChangesService, IChatResponseFileChangesOpenContext } from './chatResponseFileChangesService.js';

/** Maps a chat-produced file change to the editor resources that represent its actual before/after states. */
export function toChatFileChangeEditorResource(diff: IEditSessionEntryDiff) {
	return {
		original: { resource: diff.isCreated ? undefined : diff.originalURI },
		modified: { resource: diff.isDeleted ? undefined : diff.modifiedSnapshotURI ?? diff.modifiedURI },
		goToFileResource: diff.modifiedURI,
	};
}

/** Opens chat-produced file changes in the standard multi-diff editor. */
export function openChatFileChanges(editorService: IEditorService, label: string, diffs: readonly IEditSessionEntryDiff[]): void {
	const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
	void editorService.openEditor({
		multiDiffSource: source,
		label,
		resources: diffs.map(toChatFileChangeEditorResource),
	});
}

export class EditorChatResponseFileChangesService extends AbstractChatResponseFileChangesService {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	override openChangesForRequest(sessionResource: URI, requestId: string | undefined, _context: IChatResponseFileChangesOpenContext): void {
		if (requestId === undefined) {
			return;
		}
		const diffs = this.getChangesForRequest(sessionResource, requestId)?.get();
		if (!diffs?.length) {
			return;
		}
		openChatFileChanges(this.editorService, localize('chatTurnPills.changes.title', "Turn File Changes"), diffs);
	}
}
