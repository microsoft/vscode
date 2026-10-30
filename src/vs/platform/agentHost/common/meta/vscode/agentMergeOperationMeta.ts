/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../../base/common/types.js';

interface IHasMergeOperationMeta {
	readonly _meta?: Record<string, unknown>;
}

const STASH_TARGET_CHANGES_META_KEY = 'vscode.changeset.merge.stashTargetChanges';
const ERROR_REASON_KEY = 'reason';
const ERROR_TARGET_BRANCH_KEY = 'targetBranch';
const ERROR_OVERLAPPING_PATHS_KEY = 'overlappingPaths';
const DIRTY_TARGET_ERROR_REASON = 'dirtyMergeTarget';

/**
 * Creates request metadata for a Merge Changes operation that stashes the
 * parent repository's uncommitted changes, merges, and restores them.
 */
export function mergeOperationStashTargetChangesMeta(): Record<string, unknown> {
	return { [STASH_TARGET_CHANGES_META_KEY]: true };
}

/** Whether a Merge Changes request asks to stash the parent repository's changes around the merge. */
export function readMergeOperationStashTargetChanges(source: IHasMergeOperationMeta): boolean {
	return source._meta?.[STASH_TARGET_CHANGES_META_KEY] === true;
}

/**
 * Creates structured error data for a Merge Changes operation blocked by
 * uncommitted changes in the parent repository. `overlappingPaths` lists the
 * parent's uncommitted paths that the merge also changes, whose restore after
 * a stash may conflict, or is `undefined` when they could not be determined.
 */
export function mergeOperationDirtyTargetErrorData(targetBranch: string, overlappingPaths: readonly string[] | undefined): Record<string, unknown> {
	return { [ERROR_REASON_KEY]: DIRTY_TARGET_ERROR_REASON, [ERROR_TARGET_BRANCH_KEY]: targetBranch, [ERROR_OVERLAPPING_PATHS_KEY]: overlappingPaths };
}

function isErrorDataObject(data: unknown): data is { readonly reason?: unknown; readonly targetBranch?: unknown; readonly overlappingPaths?: unknown } {
	return typeof data === 'object' && data !== null && hasKey(data, { reason: true });
}

/**
 * Reads structured error data for a Merge Changes operation blocked by
 * uncommitted changes in the parent repository, or returns `undefined` when
 * the data does not identify that failure.
 */
export function readMergeOperationDirtyTargetErrorData(data: unknown): { readonly targetBranch: string; readonly overlappingPaths: readonly string[] | undefined } | undefined {
	if (!isErrorDataObject(data) || data.reason !== DIRTY_TARGET_ERROR_REASON) {
		return undefined;
	}
	const targetBranch = data.targetBranch;
	if (typeof targetBranch !== 'string' || targetBranch.length === 0) {
		return undefined;
	}
	const overlappingPaths = Array.isArray(data.overlappingPaths) && data.overlappingPaths.every(path => typeof path === 'string')
		? data.overlappingPaths as readonly string[]
		: undefined;
	return { targetBranch, overlappingPaths };
}
