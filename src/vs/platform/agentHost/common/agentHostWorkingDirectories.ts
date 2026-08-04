/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

export function getMostSpecificWorkingDirectory(resource: URI, workingDirectories: readonly URI[]): URI | undefined {
	let result: URI | undefined;
	for (const workingDirectory of workingDirectories) {
		if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, workingDirectory) && (!result || workingDirectory.path.length > result.path.length)) {
			result = workingDirectory;
		}
	}
	return result;
}
