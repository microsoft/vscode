/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

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
