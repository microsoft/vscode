/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

export interface IAgentHostFileCompletionRoots {
	readonly logicalRoots: readonly URI[];
	readonly enumerationRoots: readonly URI[];
}

export function getAgentHostFileCompletionRoots(workingDirectories: readonly URI[]): IAgentHostFileCompletionRoots {
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
