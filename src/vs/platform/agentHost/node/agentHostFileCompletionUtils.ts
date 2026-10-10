/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Separates roots used for completion ownership from roots that require filesystem enumeration.
 */
export interface IAgentHostFileCompletionRoots {
	/** All normalized effective file roots, in session order, including roots nested under another root. */
	readonly logicalRoots: readonly URI[];
	/** Minimal declared root set to enumerate after removing roots covered by an outer logical root. */
	readonly enumerationRoots: readonly URI[];
}

/**
 * Resolves effective working directories into logical roots and the minimal root set that must be enumerated.
 * Nested roots remain logical roots but share their outer root's enumeration to avoid redundant ripgrep work.
 */
export function resolveAgentHostFileCompletionRoots(workingDirectories: readonly URI[]): IAgentHostFileCompletionRoots {
	const logicalRoots: URI[] = [];
	const seen = new Set<string>();

	for (const workingDirectory of workingDirectories) {
		if (workingDirectory.scheme !== Schemas.file) {
			continue;
		}

		const normalized = extUriBiasedIgnorePathCase.removeTrailingPathSeparator(extUriBiasedIgnorePathCase.normalizePath(workingDirectory));
		const key = extUriBiasedIgnorePathCase.getComparisonKey(normalized);
		if (!seen.has(key)) {
			seen.add(key);
			logicalRoots.push(normalized);
		}
	}

	const enumerationRoots = logicalRoots.filter((candidate, candidateIndex) =>
		!logicalRoots.some((other, otherIndex) =>
			candidateIndex !== otherIndex && extUriBiasedIgnorePathCase.isEqualOrParent(candidate, other)
		)
	);

	return { logicalRoots, enumerationRoots };
}
