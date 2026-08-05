/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { extUri, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ActionType, type SessionWorkingDirectoryAction } from './sessionActions.js';

export function areWorkingDirectoriesEqual(first: readonly URI[] | undefined, second: readonly URI[] | undefined, immutablePrimary = false): boolean {
	if (!first || !second) {
		return first === second;
	}
	if (immutablePrimary && !extUri.isEqual(first[0], second[0])) {
		return false;
	}
	const offset = immutablePrimary ? 1 : 0;
	const toKey = (directory: URI) => extUri.getComparisonKey(directory);
	const firstSet = new ResourceSet(first.slice(offset), toKey);
	const secondSet = new ResourceSet(second.slice(offset), toKey);
	return firstSet.size === secondSet.size && [...firstSet].every(directory => secondSet.has(directory));
}

/**
 * Validates and canonicalizes a working-directory delta against the session's
 * current host-side URI identities. The returned spelling is safe for the
 * exact-string session reducer.
 */
export function resolveSessionWorkingDirectoryAction(
	action: SessionWorkingDirectoryAction,
	workingDirectories: readonly string[],
	immutablePrimary: boolean,
): SessionWorkingDirectoryAction {
	const directory = URI.parse(action.directory, true);
	if (directory.scheme !== Schemas.file) {
		throw new Error(`Working directory must be a file URI: ${action.directory}`);
	}

	const current = workingDirectories.map(value => URI.parse(value, true));
	const index = current.findIndex(value => extUriBiasedIgnorePathCase.isEqual(value, directory));
	if (immutablePrimary && action.type === ActionType.SessionWorkingDirectoryRemoved && index === 0) {
		throw new Error('The primary working directory cannot be removed.');
	}

	const canonicalDirectory = index >= 0 ? current[index] : directory;
	return { ...action, directory: canonicalDirectory.toString() };
}
