/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWorktreeUnderRepository } from '../../../../platform/agentHost/common/worktreePaths.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ISessionWorkspace } from '../common/session.js';

/**
 * Auto-trusts every isolated git worktree in `workspace` that VS Code created off
 * a base repository the user already trusts, granting (and persisting) trust for
 * the worktree folder so a worktree session opens/sends without tripping the
 * untrusted-folder prompt.
 *
 * A folder is treated as an eligible worktree only when ALL of the following hold:
 * - it is a worktree (`gitRepository.workTreeUri` is set);
 * - it is a strict descendant of `getWorktreesRoot(<base repo>)` — a structural
 *   provenance guard ({@link isWorktreeUnderRepository}). `workTreeUri` alone does
 *   not prove VS Code created the worktree (its contract permits an arbitrary
 *   checkout path), so without this guard a session could silently inherit trust
 *   for an arbitrary working directory whenever its reported base repository
 *   happens to be trusted. The shared `<repo>.worktrees` container is excluded so
 *   trusting it can never cascade to every worktree under it;
 * - its base repository (`gitRepository.uri`) is trusted while the worktree is not.
 *
 * Gating on the base repository's trust ensures trust never flows from an
 * untrusted repository into its worktree.
 */
export async function ensureSessionWorktreesTrusted(
	workspace: ISessionWorkspace | undefined,
	workspaceTrustManagementService: IWorkspaceTrustManagementService,
): Promise<void> {
	if (!workspace?.requiresWorkspaceTrust) {
		return;
	}

	await Promise.all(workspace.folders.map(async folder => {
		const gitRepository = folder.gitRepository;
		// `workTreeUri` is only set for a worktree (working directory !== repository
		// root), but on its own it does not prove VS Code created that worktree.
		// Require the working directory to be a strict descendant of the repository's
		// `.worktrees` sibling before inheriting trust from the (trusted) base repo.
		if (!gitRepository?.workTreeUri || !isWorktreeUnderRepository(folder.workingDirectory, gitRepository.uri)) {
			return;
		}

		const [worktreeTrust, baseRepoTrust] = await Promise.all([
			workspaceTrustManagementService.getUriTrustInfo(folder.workingDirectory),
			workspaceTrustManagementService.getUriTrustInfo(gitRepository.uri),
		]);
		if (!worktreeTrust.trusted && baseRepoTrust.trusted) {
			await workspaceTrustManagementService.setUrisTrust([folder.workingDirectory], true);
		}
	}));
}

/**
 * Has the user trust every folder that a session of `workspace` works in before it opens, not just the primary one: the
 * agent, and its tasks, terminals and other tooling, can run against any of the session's working directories. Worktrees
 * that VS Code created off a trusted repository inherit its trust first (see {@link ensureSessionWorktreesTrusted}).
 * Shows the workspace-trust dialog for each untrusted folder in turn, and resolves to `false` as soon as the user declines
 * one. A workspace that does not require trust, such as a virtual or cloud one, or that has not hydrated yet, needs none.
 */
export async function requestSessionWorkspaceTrust(
	workspace: ISessionWorkspace | undefined,
	remoteHostLabel: () => string | undefined,
	workspaceTrustManagementService: IWorkspaceTrustManagementService,
	workspaceTrustRequestService: IWorkspaceTrustRequestService,
): Promise<boolean> {
	if (!workspace?.requiresWorkspaceTrust) {
		return true;
	}
	await ensureSessionWorktreesTrusted(workspace, workspaceTrustManagementService);
	const folders = workspace.folders.map(folder => folder.workingDirectory);
	const trustInfos = await Promise.all(folders.map(folder => workspaceTrustManagementService.getUriTrustInfo(folder)));
	const untrustedFolders = folders.filter((_, index) => !trustInfos[index].trusted);
	for (const folder of untrustedFolders) {
		const trusted = await workspaceTrustRequestService.requestResourcesTrust({
			uri: folder,
			message: localize('sessionsService.trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
			remoteHostLabel: remoteHostLabel(),
		});
		if (!trusted) {
			return false;
		}
	}
	return true;
}
