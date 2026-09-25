/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IWorkspaceTrustManagementService } from '../../workspace/common/workspaceTrust.js';
import { SessionConfigKey } from './sessionConfigKeys.js';
import { readSessionWorkspaceless, SessionState } from './state/sessionState.js';
import { isWorktreeUnderRepository } from './worktreePaths.js';

/** Resolves persisted trust roots, inheriting trust only for individual JustRide-created worktrees. */
export async function resolveAgentHostSessionTrustFolders(
	state: SessionState,
	workspaceTrustService: IWorkspaceTrustManagementService,
	mapResource: (resource: URI) => URI = resource => resource,
): Promise<readonly URI[] | undefined> {
	let workingDirectories = state.workingDirectories;
	if (readSessionWorkspaceless(state._meta)) {
		// The immutable primary remains the internal scratch directory when chats add workspace folders.
		workingDirectories = workingDirectories?.slice(1);
		if (!workingDirectories?.length) {
			return undefined;
		}
	}
	const folders = workingDirectories?.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory);
	if (folders === undefined) {
		return undefined;
	}
	if (state.config?.values[SessionConfigKey.Isolation] === 'worktree' && state.project?.uri) {
		const repositoryRoot = typeof state.project.uri === 'string' ? URI.parse(state.project.uri) : state.project.uri;
		const worktrees = folders.filter(folder => isWorktreeUnderRepository(folder, repositoryRoot)).map(mapResource);
		if (worktrees.length > 0) {
			const [repoTrust, ...folderTrusts] = await Promise.all([
				workspaceTrustService.getUriTrustInfo(mapResource(repositoryRoot)),
				...worktrees.map(folder => workspaceTrustService.getUriTrustInfo(folder)),
			]);
			if (repoTrust.trusted) {
				const untrusted = worktrees.filter((_, index) => !folderTrusts[index].trusted);
				if (untrusted.length > 0) {
					await workspaceTrustService.setUrisTrust(untrusted, true);
				}
			}
		}
	}
	return folders.map(mapResource);
}
