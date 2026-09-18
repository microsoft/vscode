/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isAgentDevContainerWorktreeHandle } from '../../common/meta/agentDevContainerWorktreeMeta.js';
import { ISessionDataService } from '../../common/sessionDataService.js';

const ADDITIONAL_WORKTREES_METADATA_KEY = 'agentHost.additionalWorktrees';

export interface ISessionAdditionalWorktree {
	readonly handle: string;
	readonly workingDirectory: string;
	readonly repositoryRoot: string;
}

/** Reads the additional repository worktrees owned by a multi-folder session. */
export async function readSessionAdditionalWorktrees(sessionDataService: ISessionDataService, session: URI): Promise<readonly ISessionAdditionalWorktree[]> {
	const ref = await sessionDataService.tryOpenDatabase(session);
	if (!ref) {
		return [];
	}
	try {
		const raw = await ref.object.getMetadata(ADDITIONAL_WORKTREES_METADATA_KEY);
		if (raw === undefined) {
			return [];
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			throw new Error(`Invalid additional worktree metadata for ${session.toString()}`, { cause: error });
		}
		if (!Array.isArray(parsed) || parsed.some(value => !isSessionAdditionalWorktree(value))) {
			throw new Error(`Invalid additional worktree metadata for ${session.toString()}`);
		}
		return parsed;
	} finally {
		ref.dispose();
	}
}

/** Replaces the additional repository worktrees owned by a multi-folder session. */
export async function writeSessionAdditionalWorktrees(sessionDataService: ISessionDataService, session: URI, worktrees: readonly ISessionAdditionalWorktree[]): Promise<void> {
	const ref = sessionDataService.openDatabase(session);
	try {
		if (worktrees.length === 0) {
			await ref.object.deleteMetadata([ADDITIONAL_WORKTREES_METADATA_KEY]);
		} else {
			await ref.object.setMetadata(ADDITIONAL_WORKTREES_METADATA_KEY, JSON.stringify(worktrees));
		}
	} finally {
		ref.dispose();
	}
}

function isSessionAdditionalWorktree(value: unknown): value is ISessionAdditionalWorktree {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<ISessionAdditionalWorktree>;
	return typeof candidate.handle === 'string'
		&& isAgentDevContainerWorktreeHandle(candidate.handle)
		&& typeof candidate.workingDirectory === 'string'
		&& candidate.workingDirectory.length > 0
		&& typeof candidate.repositoryRoot === 'string'
		&& candidate.repositoryRoot.length > 0;
}
