/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../base/common/hash.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Returns `true` when a session spans more than one effective working
 * directory (a *multi-root* session), and `false` otherwise — including when
 * the session has no working directories or exactly one.
 *
 * Callers pass the ordered set returned by
 * `IAgentConfigurationService.getEffectiveWorkingDirectories(session)` (index 0
 * is the primary). Multi-root change-reporting behavior is gated on this
 * predicate, so single-root and empty sessions keep their existing behavior.
 */
export function isMultiRootSession(workingDirectories: readonly string[] | undefined): boolean {
	return (workingDirectories?.length ?? 0) > 1;
}

/** Returns a stable identity for a single working directory, used to key per-folder state. */
export function getWorkingDirectoryKey(workingDirectory: string): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(URI.parse(workingDirectory));
}

/** Returns a stable identity for an effective folder/worktree set. */
export function getWorkingDirectoryScopeId(workingDirectories: readonly string[]): string {
	const keys = [...new Set(workingDirectories.map(directory => extUriBiasedIgnorePathCase.getComparisonKey(URI.parse(directory))))].sort();
	const sha1 = new StringSHA1();
	sha1.update(JSON.stringify(keys));
	return sha1.digest();
}

/**
 * Finds the deepest working directory that contains `resource`.
 */
export function findDeepestContainingWorkingDirectory(resource: URI, workingDirectories: readonly URI[]): URI | undefined {
	let deepestMatch: URI | undefined;
	for (const workingDirectory of workingDirectories) {
		if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, workingDirectory) && (!deepestMatch || workingDirectory.path.length > deepestMatch.path.length)) {
			deepestMatch = workingDirectory;
		}
	}
	return deepestMatch;
}
