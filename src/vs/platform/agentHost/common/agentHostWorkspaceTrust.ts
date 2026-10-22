/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IWorkspaceTrustManagementService } from '../../workspace/common/workspaceTrust.js';
import type { IAgentHostWorkspaceTrust } from './agentHostSchema.js';
import { SessionConfigKey } from './sessionConfigKeys.js';
import { readSessionScratchFolders, readSessionWorkspaceless, SessionState } from './state/sessionState.js';
import { isWorktreeUnderRepository } from './worktreePaths.js';

/**
 * Whether `resource` is trusted under the Workspace Trust snapshot the client forwards to the Agent Host
 * (`AgentHostWorkspaceTrustConfigKey`): every resource when trust is disabled, otherwise a resource equal to or under a
 * trusted URI, ignoring path case on platforms whose paths are treated case-insensitively (Windows and macOS; this does
 * not detect a case-sensitive volume). An absent snapshot is untrusted.
 */
export function isAgentHostWorkspaceTrusted(resource: URI, trust: IAgentHostWorkspaceTrust | undefined): boolean {
	if (!trust) {
		return false;
	}
	if (!trust.enabled) {
		return true;
	}
	return trust.trustedUris.some(uri => {
		try {
			return extUriBiasedIgnorePathCase.isEqualOrParent(resource, URI.parse(uri));
		} catch {
			return false;
		}
	});
}

/** Resolves persisted trust roots; VS Code-created worktrees inherit the trust of their repository when the session has it. */
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
	let folders = workingDirectories?.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory);
	if (folders === undefined) {
		return undefined;
	}
	// Host-allocated per-chat scratch folders are internal and never need workspace trust.
	// This only honors the host's own claim in the session state; the claim is the host's, not a client's.
	const scratchFolders = readSessionScratchFolders(state._meta);
	if (scratchFolders.length > 0) {
		const scratch = new Set(scratchFolders.map(folder => URI.parse(folder).toString()));
		folders = folders.filter(folder => !scratch.has(folder.toString()));
		if (folders.length === 0) {
			return undefined;
		}
	}
	// A VS Code-created worktree inherits the trust of its repository: the session's project when
	// the session is isolated in a worktree, and any repository folder of the session, whose chats
	// may have worktrees of their own.
	const repositoryRoots: URI[] = folders.filter(folder => !folders!.some(other => isWorktreeUnderRepository(folder, other)));
	if (state.config?.values[SessionConfigKey.Isolation] === 'worktree' && state.project?.uri) {
		repositoryRoots.unshift(typeof state.project.uri === 'string' ? URI.parse(state.project.uri) : state.project.uri);
	}
	for (const repositoryRoot of repositoryRoots) {
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
