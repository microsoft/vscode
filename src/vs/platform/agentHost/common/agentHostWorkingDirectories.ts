/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { Schemas } from '../../../base/common/network.js';
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

/**
 * Selects the repository root that owns a `git-blob:` URI's absolute path, for
 * multi-root sessions. Reconstructs the file URI from `absolutePath` (which is an
 * already-URI-encoded file path carried in the git-blob URI — avoid `URI.file` on
 * it so Windows drive paths aren't mis-normalized), then returns the deepest
 * containing repository root (so nested repos resolve deterministically). Returns
 * `undefined` when no root contains the path.
 */
export function selectRepositoryRootForBlobPath(absolutePath: string, repositoryRoots: readonly URI[]): URI | undefined {
	const fileUri = URI.from({ scheme: Schemas.file, path: absolutePath });
	return findDeepestContainingWorkingDirectory(fileUri, repositoryRoots);
}
