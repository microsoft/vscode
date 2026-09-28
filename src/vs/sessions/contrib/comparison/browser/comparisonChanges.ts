/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../platform/files/common/files.js';
import { IMultiDiffEditorResource } from '../../../../workbench/common/editor.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISession, ISessionFileChange } from '../../../services/sessions/common/session.js';

function indexChanges(session: ISession): Map<string, ISessionFileChange> {
	const root = session.workspace.get()?.folders[0]?.workingDirectory;
	if (!root) {
		throw new Error(localize('comparison.workspaceUnavailable', "The comparison workspace is not available."));
	}
	const changes = new Map<string, ISessionFileChange>();
	for (const change of session.changes.get()) {
		const uri = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
		const path = relativePath(root, uri);
		if (!path || path === '..' || path.startsWith('../')) {
			throw new Error(localize('comparison.outsideWorkspace', "Cannot compare a change outside the attempt workspace."));
		}
		changes.set(path, change);
	}
	return changes;
}

async function resolveUnchangedFile(session: ISession, path: string, fileService: IFileService): Promise<URI | undefined> {
	const root = session.workspace.get()?.folders[0]?.workingDirectory;
	if (!root) {
		throw new Error(localize('comparison.workspaceUnavailable', "The comparison workspace is not available."));
	}
	const resource = URI.joinPath(root, path);
	try {
		await fileService.resolve(resource);
		return resource;
	} catch (error) {
		if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw error;
	}
}

/** Pair final files by workspace-relative path; a missing change is not a missing file. */
export async function getComparisonChanges(left: ISession, right: ISession, fileService: IFileService): Promise<IMultiDiffEditorResource[]> {
	const leftChanges = indexChanges(left);
	const rightChanges = indexChanges(right);
	const paths = [...new Set([...leftChanges.keys(), ...rightChanges.keys()])].sort();
	const result: IMultiDiffEditorResource[] = [];
	for (const path of paths) {
		const a = leftChanges.get(path);
		const b = rightChanges.get(path);
		const [original, modified] = await Promise.all([
			a ? a.modifiedUri : resolveUnchangedFile(left, path, fileService),
			b ? b.modifiedUri : resolveUnchangedFile(right, path, fileService),
		]);
		if (original || modified) {
			result.push({ original: { resource: original }, modified: { resource: modified } });
		}
	}
	return result;
}
