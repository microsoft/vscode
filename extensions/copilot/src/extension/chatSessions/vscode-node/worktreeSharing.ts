/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';

/**
 * Returns the ids of "blocking" sibling sessions that share the same worktree
 * (or workspace folder) as `excludeSessionId` and would be broken if the
 * worktree directory were deleted.
 *
 * A candidate is treated as blocking iff it is *not* the excluded session, *not*
 * a `sub-session` (sub-sessions don't independently keep a worktree alive — they
 * follow their parent), and *not* archived (archived sessions have their
 * worktree reconstructed via `recreateWorktreeOnUnarchive`, so they don't block
 * cleanup either).
 */
export async function getBlockingSiblingSessionsForFolder(
	folder: vscode.Uri,
	excludeSessionId: string,
	metadataStore: IChatSessionMetadataStore,
	workspaceFolderService: IChatSessionWorkspaceFolderService,
): Promise<string[]> {
	const candidates = new Set<string>([
		...metadataStore.getSessionIdsForFolder(folder),
		...workspaceFolderService.getAssociatedSessions(folder),
	]);
	candidates.delete(excludeSessionId);

	const results: string[] = [];
	await Promise.all(Array.from(candidates).map(async id => {
		const [parent, archived] = await Promise.all([
			metadataStore.getSessionParentId(id),
			metadataStore.getSessionArchived(id),
		]);
		if (archived) {
			return;
		}
		if (parent?.kind === 'sub-session') {
			return;
		}
		results.push(id);
	}));
	return results;
}
