/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentHostGitService } from '../common/agentHostGitService.js';
import { WorkingDirectoryOriginKind, type WorkingDirectory } from '../common/state/protocol/channels-session/state.js';
import { getWorkingDirectoryUri } from '../common/agentHostWorkingDirectories.js';
import type { IWorktreeMetadata } from './shared/worktreeIsolation.js';

export function materializedWorkingDirectoryInfo(directories: readonly string[], previous: readonly (string | WorkingDirectory)[] | undefined, worktree: IWorktreeMetadata | undefined): WorkingDirectory[] {
	return directories.map<WorkingDirectory>(uri => {
		const directory = URI.parse(uri);
		if (worktree?.worktreePath && worktree.repositoryRoot
			&& !extUriBiasedIgnorePathCase.isEqual(worktree.worktreePath, worktree.repositoryRoot)
			&& extUriBiasedIgnorePathCase.isEqual(directory, worktree.worktreePath)) {
			return { uri, origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: worktree.repositoryRoot.toString() } };
		}
		const existing = previous?.find(entry => extUriBiasedIgnorePathCase.isEqual(directory, URI.parse(getWorkingDirectoryUri(entry))));
		return existing && typeof existing !== 'string' ? { ...existing, uri } : { uri };
	});
}

export async function resolveWorkingDirectoryInfo(directories: readonly URI[], gitService: IAgentHostGitService, worktree?: IWorktreeMetadata): Promise<WorkingDirectory[]> {
	const limiter = new Limiter<WorkingDirectory>(5);
	try {
		return await Promise.all(directories.map(directory => limiter.queue(async () => {
			const uri = directory.toString();
			if (!worktree?.worktreePath || !worktree.repositoryRoot
				|| extUriBiasedIgnorePathCase.isEqual(worktree.worktreePath, worktree.repositoryRoot)
				|| !extUriBiasedIgnorePathCase.isEqualOrParent(directory, worktree.worktreePath)) {
				return { uri };
			}
			const repositoryRoot = await gitService.getRepositoryRoot(directory).catch(() => undefined);
			if (repositoryRoot && !extUriBiasedIgnorePathCase.isEqual(repositoryRoot, worktree.worktreePath)) {
				return { uri };
			}
			return { uri, origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: worktree.repositoryRoot.toString() } };
		})));
	} finally {
		limiter.dispose();
	}
}
