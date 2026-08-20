/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
