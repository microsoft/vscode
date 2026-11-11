/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * The key of the file that a recorded edit's path names. Edits record the path their tool was called with,
 * so one file can have several spellings; everything that lists or addresses a file's records must use this key.
 */
export function getFileEditPathKey(filePath: string): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(URI.file(filePath));
}

/** Whether two recorded paths name the same file, see {@link getFileEditPathKey}. */
export function isSameFileEditPath(a: string, b: string): boolean {
	return a === b || getFileEditPathKey(a) === getFileEditPathKey(b);
}

/** Whether a recorded path names the file at `resource`, see {@link getFileEditPathKey}. */
export function isFileEditPath(filePath: string | undefined, resource: URI): boolean {
	return filePath !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.file(filePath), resource);
}
