/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { WorkingDirectory, WorkingDirectoryOriginKind } from './state/protocol/channels-session/state.js';

export function getWorkingDirectoryUri(directory: string | WorkingDirectory): string {
	return typeof directory === 'string' ? directory : directory.uri;
}

export function getWorkingDirectoryUris(directories: readonly (string | WorkingDirectory)[] | undefined): string[] | undefined {
	return directories?.map(getWorkingDirectoryUri);
}

export function getWorkingDirectoryInfo(directories: readonly (string | WorkingDirectory)[] | undefined): WorkingDirectory[] | undefined {
	return directories?.map(directory => typeof directory === 'string' ? { uri: directory } : directory);
}

export function mapWorkingDirectory(directory: string | WorkingDirectory, mapUri: (uri: URI) => URI): string | WorkingDirectory {
	if (typeof directory === 'string') {
		return mapUri(URI.parse(directory)).toString();
	}
	return {
		...directory,
		uri: mapUri(URI.parse(directory.uri)).toString(),
		...(directory.origin?.kind === WorkingDirectoryOriginKind.Worktree ? {
			origin: { ...directory.origin, mainWorktree: mapUri(URI.parse(directory.origin.mainWorktree)).toString() },
		} : {}),
	};
}

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
export function isMultiRootSession(workingDirectories: readonly (string | WorkingDirectory)[] | undefined): boolean {
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
