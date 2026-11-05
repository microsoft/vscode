/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { ICopilotCLIChatSessionItemProvider } from './copilotCLIChatSessions';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';

/**
 * Invalidates the cache for sessions affected by a repository change, and triggers a refresh of those sessions.
 * You can optionally provide a list of sessions that should not be refreshed.
 * E.g. if you know that those sessions are not affected or are already up to date, you can exclude them from the refresh to avoid unnecessary work.
 */
export async function clearChangesCacheForAffectedSessions(folder: vscode.Uri, sessionsToIgnore: string[], logService: ILogService, metadataStore: IChatSessionMetadataStore, workspaceFolderService: IChatSessionWorkspaceFolderService, worktreeService: IChatSessionWorktreeService, sessionItemProvider?: ICopilotCLIChatSessionItemProvider): Promise<void> {
	logService.trace(`[ChatSessionChangesCache] Repository state changed for ${folder.toString()}. Updating session properties.`);

	const sessionIds = metadataStore.getSessionIdsForFolder(folder).filter(id => !sessionsToIgnore.includes(id));
	const workspaceSessionIds = workspaceFolderService.clearWorkspaceChanges(folder).filter(id => !sessionsToIgnore.includes(id));
	sessionIds.forEach(id => workspaceFolderService.clearWorkspaceChanges(id));
	sessionIds.push(...workspaceSessionIds);
	await Promise.all(Array.from(new Set(sessionIds)).map(async sessionId => {
		// Worktree
		const worktreeProperties = await worktreeService.getWorktreeProperties(sessionId);
		if (worktreeProperties) {
			await worktreeService.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined
			});
		}
	}));
	// Will be passed in non-controller code paths.
	if (sessionItemProvider) {
		await sessionItemProvider.refreshSession({ reason: 'update', sessionIds });
	}
	logService.trace(`[ChatSessionChangesCache] Updated session properties for worktree ${folder.toString()}.`);
}
