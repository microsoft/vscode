/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isAgentDevContainerWorktreeHandle } from '../../common/meta/agentDevContainerWorktreeMeta.js';
import { type IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../../common/agentHostSessionStateStore.js';
import { ISessionDataService } from '../../common/sessionDataService.js';

export const ADDITIONAL_WORKTREES_METADATA_KEY = 'agentHost.additionalWorktrees';

export interface ISessionAdditionalWorktree {
	readonly handle: string;
	readonly workingDirectory: string;
	readonly repositoryRoot: string;
	readonly chat?: string;
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
		if (!isSessionAdditionalWorktrees(parsed)) {
			throw new Error(`Invalid additional worktree metadata for ${session.toString()}`);
		}
		return parsed;
	} finally {
		ref.dispose();
	}
}

/** Parses a stored additional-worktree record; a missing or invalid record yields none. */
export function parseSessionAdditionalWorktrees(raw: string | undefined): readonly ISessionAdditionalWorktree[] {
	if (raw === undefined) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return isSessionAdditionalWorktrees(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Replaces the additional repository worktrees owned by a multi-folder session. */
export async function writeSessionAdditionalWorktrees(stateStore: IAgentHostSessionStateStore, session: URI, worktrees: readonly ISessionAdditionalWorktree[]): Promise<void> {
	if (!isSessionAdditionalWorktrees(worktrees)) {
		throw new Error(`Invalid additional worktree metadata for ${session.toString()}`);
	}
	await stateStore.writeMetadata(session, session, { [ADDITIONAL_WORKTREES_METADATA_KEY]: worktrees.length === 0 ? null : JSON.stringify(worktrees) }, SessionStateMirrorFlush.Immediate);
}

function isSessionAdditionalWorktrees(value: unknown): value is readonly ISessionAdditionalWorktree[] {
	if (!Array.isArray(value)) {
		return false;
	}
	const handles = new Set<string>();
	for (const worktree of value) {
		if (!isSessionAdditionalWorktree(worktree) || handles.has(worktree.handle)) {
			return false;
		}
		handles.add(worktree.handle);
	}
	return true;
}

function isSessionAdditionalWorktree(value: unknown): value is ISessionAdditionalWorktree {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<ISessionAdditionalWorktree>;
	return typeof candidate.handle === 'string'
		&& isAgentDevContainerWorktreeHandle(candidate.handle)
		&& isUriString(candidate.workingDirectory)
		&& isUriString(candidate.repositoryRoot)
		&& (candidate.chat === undefined || isUriString(candidate.chat));
}

function isUriString(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) {
		return false;
	}
	try {
		return URI.parse(value, true).scheme.length > 0;
	} catch {
		return false;
	}
}
