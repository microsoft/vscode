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
 * Provider working-directory capability flags relevant to authoritative
 * host-side validation. Mirrors {@link MultipleWorkingDirectoriesCapability}
 * fields without the transport concerns.
 */
export interface ISessionWorkingDirectoryCapability {
	readonly immutablePrimary: boolean;
	readonly primaryReplacement: boolean;
}

/**
 * Validates and canonicalizes a working-directory delta against the session's
 * current host-side URI identities. The returned spelling is safe for the
 * exact-string session reducer. `capability` reflects the owning agent's
 * multiple-working-directories capability: `immutablePrimary` fixes the first
 * entry as a process root that cannot be removed via the generic membership
 * action, and `primaryReplacement` protects index 0 as a replaceable primary
 * that may only change through `SessionWorkingDirectoryReplaced`.
 */
export function resolveSessionWorkingDirectoryAction(
	action: SessionWorkingDirectoryAction,
	workingDirectories: readonly string[],
	capability: ISessionWorkingDirectoryCapability,
): SessionWorkingDirectoryAction {
	const directory = URI.parse(action.directory, true);
	if (directory.scheme !== Schemas.file) {
		throw new Error(`Working directory must be a file URI: ${action.directory}`);
	}

	const current = workingDirectories.map(value => URI.parse(value, true));
	const index = current.findIndex(value => extUriBiasedIgnorePathCase.isEqual(value, directory));
	const canonicalDirectory = index >= 0 ? current[index] : directory;

	if (action.type === ActionType.SessionWorkingDirectoryRemoved) {
		// The generic membership action MUST NOT remove index 0 when the primary
		// is either fixed or a protected-replaceable slot; the replace action is
		// the only path in the latter case.
		if (index === 0 && (capability.immutablePrimary || capability.primaryReplacement)) {
			throw new Error('The primary working directory cannot be removed.');
		}
		return { ...action, directory: canonicalDirectory.toString() };
	}

	if (action.type === ActionType.SessionWorkingDirectoryReplaced) {
		const replacement = URI.parse(action.replacement, true);
		if (replacement.scheme !== Schemas.file) {
			throw new Error(`Working directory replacement must be a file URI: ${action.replacement}`);
		}
		// Index 0 may only be replaced when the provider advertises
		// primaryReplacement. An immutable primary without primaryReplacement
		// is fixed and cannot be swapped; a plain equal-peer index 0 (neither
		// flag set) is fine to replace like any other entry.
		if (index === 0 && capability.immutablePrimary && !capability.primaryReplacement) {
			throw new Error('The primary working directory cannot be replaced.');
		}
		const replacementIdx = current.findIndex(value => extUriBiasedIgnorePathCase.isEqual(value, replacement));
		const canonicalReplacement = replacementIdx >= 0 ? current[replacementIdx] : replacement;
		return { ...action, directory: canonicalDirectory.toString(), replacement: canonicalReplacement.toString() };
	}

	return { ...action, directory: canonicalDirectory.toString() };
}
