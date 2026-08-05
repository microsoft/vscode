/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { extUri, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ActionType, type SessionWorkingDirectoryAction } from './sessionActions.js';

function areDirectorySetsEqual(first: readonly URI[], second: readonly URI[]): boolean {
	const toKey = (directory: URI) => extUri.getComparisonKey(directory);
	const firstSet = new ResourceSet(first, toKey);
	const secondSet = new ResourceSet(second, toKey);
	return firstSet.size === secondSet.size && [...firstSet].every(directory => secondSet.has(directory));
}

/**
 * Compares two additional (non-primary) working-directory lists. A session's
 * additional directories are unordered peers, so only membership matters.
 */
export function areAdditionalWorkingDirectoriesEqual(first: readonly URI[] | undefined, second: readonly URI[] | undefined): boolean {
	if (!first || !second) {
		return first === second;
	}
	return areDirectorySetsEqual(first, second);
}

/**
 * Compares two complete session working-directory sets. `hasImmutablePrimary`
 * is the owning agent's {@link MultipleWorkingDirectoriesCapability.immutablePrimary}
 * capability: when set, index 0 is a fixed process root and is compared by
 * position while the remaining entries are unordered peers. Agents without it
 * treat every directory as an equal peer.
 */
export function areSessionWorkingDirectoriesEqual(first: readonly URI[] | undefined, second: readonly URI[] | undefined, hasImmutablePrimary: boolean): boolean {
	if (!first || !second) {
		return first === second;
	}
	if (!hasImmutablePrimary) {
		return areDirectorySetsEqual(first, second);
	}
	return extUri.isEqual(first[0], second[0])
		&& areDirectorySetsEqual(first.slice(1), second.slice(1));
}

/**
 * Validates and canonicalizes a working-directory delta against the session's
 * current host-side URI identities. The returned spelling is safe for the
 * exact-string session reducer. `hasImmutablePrimary` reflects the owning
 * agent's capability: when `true` the first entry of `workingDirectories` is a
 * fixed process root that cannot be removed.
 */
export function resolveSessionWorkingDirectoryAction(
	action: SessionWorkingDirectoryAction,
	workingDirectories: readonly string[],
	hasImmutablePrimary: boolean,
): SessionWorkingDirectoryAction {
	const directory = URI.parse(action.directory, true);
	if (directory.scheme !== Schemas.file) {
		throw new Error(`Working directory must be a file URI: ${action.directory}`);
	}

	const current = workingDirectories.map(value => URI.parse(value, true));
	const index = current.findIndex(value => extUriBiasedIgnorePathCase.isEqual(value, directory));
	if (hasImmutablePrimary && action.type === ActionType.SessionWorkingDirectoryRemoved && index === 0) {
		throw new Error('The primary working directory cannot be removed.');
	}

	const canonicalDirectory = index >= 0 ? current[index] : directory;
	return { ...action, directory: canonicalDirectory.toString() };
}
