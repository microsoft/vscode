/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Limiter } from '../../../../base/common/async.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IMultiDiffEditorResource } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../common/editing/chatEditingService.js';
import { AbstractChatResponseFileChangesService, IChatResponseFileChangesOpenContext } from './chatResponseFileChangesService.js';

/** Opens a set of chat-produced file changes in the standard multi-diff editor. */
export function openChatFileChanges(editorService: IEditorService, label: string, diffs: readonly IEditSessionEntryDiff[]): void {
	openChatFileChangeResources(editorService, label, diffs.map(diff => ({
		original: { resource: diff.isCreated ? undefined : diff.originalURI },
		modified: { resource: diff.isDeleted ? undefined : diff.modifiedSnapshotURI ?? diff.modifiedURI },
		goToFileResource: diff.modifiedURI,
	})));
}

/** Opens Agent Host changes after replacing unreadable snapshots with available sides. */
export async function openReadableChatFileChanges(editorService: IEditorService, fileService: IFileService, label: string, diffs: readonly IEditSessionEntryDiff[]): Promise<void> {
	const limiter = new Limiter<IMultiDiffEditorResource | undefined>(4);
	let resources: IMultiDiffEditorResource[];
	try {
		resources = (await Promise.all(diffs.map(diff => limiter.queue(async () => {
			const original = diff.isCreated || !(await isReadableSnapshot(diff.originalURI, fileService)) ? undefined : diff.originalURI;
			const modified = diff.isDeleted
				? undefined
				: diff.modifiedSnapshotURI && (isEqual(diff.modifiedSnapshotURI, diff.modifiedURI) || await isReadableSnapshot(diff.modifiedSnapshotURI, fileService))
					? diff.modifiedSnapshotURI
					: diff.modifiedURI;
			return original || modified
				? {
					original: { resource: original },
					modified: { resource: modified },
					goToFileResource: diff.modifiedURI,
				}
				: undefined;
		})))).filter(resource => resource !== undefined);
	} finally {
		limiter.dispose();
	}
	if (resources.length === 0) {
		return;
	}
	await openChatFileChangeResources(editorService, label, resources);
}

function openChatFileChangeResources(editorService: IEditorService, label: string, resources: IMultiDiffEditorResource[]): Promise<unknown> {
	const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
	return editorService.openEditor({
		multiDiffSource: source,
		label,
		resources,
	});
}

async function isReadableSnapshot(resource: URI, fileService: IFileService): Promise<boolean> {
	if (resource.scheme !== AGENT_HOST_SCHEME) {
		return true;
	}
	try {
		await fileService.readFile(resource, { length: 1 });
		return true;
	} catch {
		return false;
	}
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
